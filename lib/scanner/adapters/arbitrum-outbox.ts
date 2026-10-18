import {
  encodeFunctionData,
  formatUnits,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { CHAINS, type ChainConfig } from "@/config/chains";
import { readMany, withRetry } from "../multicall";
import type { ClaimablePosition, ProtocolAdapter, ScanContext } from "../types";

/**
 * Arbitrum canonical-bridge withdrawals (L2 → L1) that were started but never claimed on L1.
 *
 * 1. Find the user's withdrawals on L2:
 *    - ETH: ArbSys L2ToL1Tx with destination = user and callvalue > 0
 *    - Tokens: WithdrawalInitiated on the token gateways with _to = user,
 *      then the matching L2ToL1Tx by position (needed to build the L1 claim)
 * 2. Drop the ones already executed (Outbox.isSpent on L1).
 * 3. Compare each position with the sendCount of the latest confirmed assertion:
 *    below it → claimable now (proof + executeTransaction calldata built here);
 *    otherwise → pending until the challenge period ends.
 */

const ARBSYS: Address = "0x0000000000000000000000000000000000000064";
const NODE_INTERFACE: Address = "0x00000000000000000000000000000000000000C8";
/** Chainlink ETH / USD on Ethereum. description() checked = "ETH / USD" on 2026-10-18. */
const ETH_USD_FEED: Address = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const L1_WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

/** Robinhood's RPC allows at most 10,000,000 blocks per eth_getLogs (inclusive). */
const LOG_CHUNK = 9_999_999n;
const L1_BLOCK_SECONDS = 12;
/** Rough gas for Outbox.executeTransaction, used only for the "net after gas" estimate. */
const EXECUTE_GAS = 200_000n;

const L2ToL1Tx = parseAbiItem(
  "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
);
const WithdrawalInitiated = parseAbiItem(
  "event WithdrawalInitiated(address l1Token, address indexed _from, address indexed _to, uint256 indexed _l2ToL1Id, uint256 _exitNum, uint256 _amount)",
);
const AssertionConfirmed = parseAbiItem(
  "event AssertionConfirmed(bytes32 indexed assertionHash, bytes32 blockHash, bytes32 sendRoot)",
);

const outboxAbi = parseAbi([
  "function isSpent(uint256 index) view returns (bool)",
  "function executeTransaction(bytes32[] proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes data)",
]);
const rollupAbi = parseAbi(["function confirmPeriodBlocks() view returns (uint64)"]);
const nodeInterfaceAbi = parseAbi([
  "function constructOutboxProof(uint64 size, uint64 leaf) view returns (bytes32 send, bytes32 root, bytes32[] proof)",
]);
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

interface L2ToL1Message {
  position: bigint;
  caller: Address;
  destination: Address;
  arbBlockNum: bigint;
  ethBlockNum: bigint;
  timestamp: bigint;
  callvalue: bigint;
  data: Hex;
  txHash: Hex;
}

interface Withdrawal {
  message: L2ToL1Message;
  /** "native" for ETH, otherwise the L1 token address */
  token: Address | "native";
  amount: bigint;
}

export type WithdrawalStatus = { kind: "claimable" } | { kind: "pending"; readyAt: number };

/** Pure status rule, exported for tests. */
export function classifyWithdrawal(
  position: bigint,
  confirmedSendCount: bigint,
  l2Timestamp: bigint,
  challengeSeconds: number,
): WithdrawalStatus {
  if (position < confirmedSendCount) return { kind: "claimable" };
  // Assertions are posted roughly hourly, then wait the challenge period.
  return { kind: "pending", readyAt: Number(l2Timestamp) + challengeSeconds + 3600 };
}

/** Block ranges covering [from, to] in steps the RPC accepts. Exported for tests. */
export function blockChunks(from: bigint, to: bigint, size = LOG_CHUNK): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let start = from; start <= to; start += size + 1n) {
    const end = start + size > to ? to : start + size;
    out.push([start, end]);
  }
  return out;
}

async function getLogsChunked<T>(
  latest: bigint,
  fetch: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  signal: AbortSignal,
): Promise<T[]> {
  const results = await Promise.all(
    blockChunks(0n, latest).map(([from, to]) => {
      if (signal.aborted) throw new Error("aborted");
      return withRetry(() => fetch(from, to), 2);
    }),
  );
  return results.flat();
}

function toMessage(log: {
  args: Partial<{
    caller: Address;
    destination: Address;
    position: bigint;
    arbBlockNum: bigint;
    ethBlockNum: bigint;
    timestamp: bigint;
    callvalue: bigint;
    data: Hex;
  }>;
  transactionHash: Hex | null;
}): L2ToL1Message | null {
  const a = log.args;
  if (
    a.caller === undefined ||
    a.destination === undefined ||
    a.position === undefined ||
    a.arbBlockNum === undefined ||
    a.ethBlockNum === undefined ||
    a.timestamp === undefined ||
    a.callvalue === undefined ||
    a.data === undefined ||
    !log.transactionHash
  ) {
    return null;
  }
  return {
    caller: a.caller,
    destination: a.destination,
    position: a.position,
    arbBlockNum: a.arbBlockNum,
    ethBlockNum: a.ethBlockNum,
    timestamp: a.timestamp,
    callvalue: a.callvalue,
    data: a.data,
    txHash: log.transactionHash,
  };
}

/** sendCount of the L2 block in the latest confirmed assertion. */
async function confirmedSendCount(l1: PublicClient, l2: PublicClient, rollup: Address) {
  const head = await l1.getBlockNumber();
  // Assertions confirm every few hundred L1 blocks; widen the window if none found.
  for (const lookback of [3_000n, 30_000n]) {
    const logs = await withRetry(
      () =>
        l1.getLogs({
          address: rollup,
          event: AssertionConfirmed,
          fromBlock: head - lookback,
          toBlock: head,
        }),
      2,
    );
    const last = logs.at(-1);
    if (!last?.args.blockHash) continue;
    const block = (await l2.request({
      method: "eth_getBlockByHash",
      params: [last.args.blockHash, false],
    } as never)) as { sendCount?: Hex; sendRoot?: Hex } | null;
    if (!block?.sendCount || block.sendRoot !== last.args.sendRoot) {
      throw new Error("Confirmed assertion does not match an L2 block");
    }
    return BigInt(block.sendCount);
  }
  throw new Error("No confirmed assertion found in the last 30,000 L1 blocks");
}

export function createArbitrumOutboxAdapter(chain: ChainConfig): ProtocolAdapter {
  const bridge = chain.contracts.canonicalBridge;
  const parent = chain.settlesTo ? CHAINS[chain.settlesTo] : undefined;
  const outbox = bridge.outbox.value;
  const rollup = bridge.rollup.value;
  const gateways = bridge.l2Gateways.value ?? [];
  if (!parent || !outbox || !rollup) {
    throw new Error(`${chain.name}: canonical bridge contracts are not verified`);
  }

  const id = `arb-outbox-${chain.id}`;

  return {
    id,
    name: `${chain.name} bridge withdrawals`,
    category: "bridge",
    supportedChainIds: [chain.id],
    timeoutMs: 25_000,

    async scanAddress(user: Address, ctx: ScanContext): Promise<ClaimablePosition[]> {
      const l2 = ctx.getClient(chain.id);
      const l1 = ctx.getClient(parent.id);
      const latest = await l2.getBlockNumber();

      const [ethLogs, tokenLogs] = await Promise.all([
        getLogsChunked(
          latest,
          (fromBlock, toBlock) =>
            l2.getLogs({
              address: ARBSYS,
              event: L2ToL1Tx,
              args: { destination: user },
              fromBlock,
              toBlock,
            }),
          ctx.signal,
        ),
        // One gateway per query: multi-address filters are capped at 100k blocks on this RPC.
        Promise.all(
          gateways.map((gateway) =>
            getLogsChunked(
              latest,
              (fromBlock, toBlock) =>
                l2.getLogs({
                  address: gateway,
                  event: WithdrawalInitiated,
                  args: { _to: user },
                  fromBlock,
                  toBlock,
                }),
              ctx.signal,
            ),
          ),
        ).then((r) => r.flat()),
      ]);

      const withdrawals: Withdrawal[] = [];
      for (const log of ethLogs) {
        const m = toMessage(log);
        // Plain ETH withdrawals carry value; zero-value messages are arbitrary calls, not funds.
        if (m && m.callvalue > 0n)
          withdrawals.push({ message: m, token: "native", amount: m.callvalue });
      }

      const tokenIds = tokenLogs.flatMap((l) =>
        l.args._l2ToL1Id !== undefined && l.args.l1Token && l.args._amount !== undefined
          ? [
              {
                position: l.args._l2ToL1Id,
                token: l.args.l1Token,
                amount: l.args._amount,
                txHash: l.transactionHash,
              },
            ]
          : [],
      );
      if (tokenIds.length > 0) {
        // The matching L2ToL1Tx is emitted in the same transaction as WithdrawalInitiated.
        const txHashes = [...new Set(tokenIds.map((t) => t.txHash))];
        const receipts = await Promise.all(
          txHashes.map((hash) => withRetry(() => l2.getTransactionReceipt({ hash }), 2)),
        );
        const msgLogs = parseEventLogs({
          abi: [L2ToL1Tx],
          logs: receipts.flatMap((r) =>
            r.logs.filter((l) => l.address.toLowerCase() === ARBSYS.toLowerCase()),
          ),
        });
        const byPosition = new Map(
          msgLogs.flatMap((l) => {
            const m = toMessage(l);
            return m ? [[m.position, m] as const] : [];
          }),
        );
        for (const t of tokenIds) {
          const message = byPosition.get(t.position);
          if (message) withdrawals.push({ message, token: t.token, amount: t.amount });
          else
            ctx.logger.warn("Token withdrawal without L2ToL1Tx", { position: String(t.position) });
        }
      }

      if (withdrawals.length === 0) return [];

      const l1Tokens = [
        ...new Set(withdrawals.flatMap((w) => (w.token === "native" ? [] : [w.token]))),
      ];
      const [spent, meta, sendCount, gasPrice] = await Promise.all([
        readMany(
          l1,
          withdrawals.map((w) => ({
            address: outbox,
            abi: outboxAbi,
            functionName: "isSpent",
            args: [w.message.position],
          })),
        ),
        readMany(l1, [
          { address: rollup, abi: rollupAbi, functionName: "confirmPeriodBlocks" },
          { address: ETH_USD_FEED, abi: feedAbi, functionName: "latestRoundData" },
          ...l1Tokens.flatMap((token) => [
            { address: token, abi: erc20Abi, functionName: "symbol" },
            { address: token, abi: erc20Abi, functionName: "decimals" },
          ]),
        ]),
        confirmedSendCount(l1, l2, rollup),
        l1.getGasPrice().catch(() => null),
      ]);

      const [periodRes, feedRes, ...tokenRes] = meta;
      const challengeSeconds =
        periodRes?.status === "success" ? Number(periodRes.result) * L1_BLOCK_SECONDS : 7 * 86_400;
      const ethUsd =
        feedRes?.status === "success"
          ? Number((feedRes.result as readonly [bigint, bigint, bigint, bigint, bigint])[1]) / 1e8
          : null;
      const tokenInfo = new Map(
        l1Tokens.map((token, i) => {
          const sym = tokenRes[i * 2];
          const dec = tokenRes[i * 2 + 1];
          return [
            token,
            {
              symbol: sym?.status === "success" ? String(sym.result) : "TOKEN",
              decimals: dec?.status === "success" ? Number(dec.result) : null,
            },
          ] as const;
        }),
      );
      const gasUsd =
        gasPrice !== null && ethUsd !== null
          ? Number(formatUnits(gasPrice * EXECUTE_GAS, 18)) * ethUsd
          : null;

      const positions: ClaimablePosition[] = [];
      for (const [i, w] of withdrawals.entries()) {
        const s = spent[i];
        if (s?.status !== "success") {
          ctx.logger.warn("isSpent failed", { position: String(w.message.position) });
          continue;
        }
        if (s.result === true) continue;

        const info =
          w.token === "native"
            ? { symbol: "ETH", decimals: 18 }
            : (tokenInfo.get(w.token) ?? { symbol: "TOKEN", decimals: null });
        if (info.decimals === null) continue;
        const amount = formatUnits(w.amount, info.decimals);
        const isEth = w.token === "native" || w.token.toLowerCase() === L1_WETH.toLowerCase();
        const usd = isEth && ethUsd !== null ? Number(amount) * ethUsd : null;

        const status = classifyWithdrawal(
          w.message.position,
          sendCount,
          w.message.timestamp,
          challengeSeconds,
        );
        let claimAction: ClaimablePosition["claimAction"] = { type: "none" };
        if (status.kind === "claimable") {
          const [, , proof] = await l2.readContract({
            address: NODE_INTERFACE,
            abi: nodeInterfaceAbi,
            functionName: "constructOutboxProof",
            args: [sendCount, w.message.position],
          });
          const m = w.message;
          claimAction = {
            type: "direct",
            chainId: parent.id,
            to: outbox,
            data: encodeFunctionData({
              abi: outboxAbi,
              functionName: "executeTransaction",
              args: [
                proof,
                m.position,
                m.caller,
                m.destination,
                m.arbBlockNum,
                m.ethBlockNum,
                m.timestamp,
                m.callvalue,
                m.data,
              ],
            }),
          };
        }

        positions.push({
          id: `${id}:${w.message.position}`,
          adapterId: id,
          protocol: `${chain.name} → ${parent.name}`,
          chainId: chain.id,
          kind: status.kind,
          category: "bridge",
          asset: { symbol: info.symbol, address: w.token, decimals: info.decimals },
          amountRaw: w.amount.toString(),
          amountFormatted: Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }),
          estimatedUsdValue: usd,
          estimatedGasUsd: gasUsd,
          ...(status.kind === "pending" ? { readyAt: status.readyAt } : {}),
          claimAction,
          risk: {
            verified: true,
            notes: `Canonical bridge withdrawal #${w.message.position}. Claim executes on ${parent.name} Outbox.`,
          },
          source: `${chain.explorer.url}/tx/${w.message.txHash}`,
        });
      }
      return positions;
    },
  };
}
