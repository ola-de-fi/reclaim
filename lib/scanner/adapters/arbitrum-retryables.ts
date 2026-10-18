import { encodeFunctionData, formatUnits, type Address, type Hex, type PublicClient } from "viem";
import { CHAINS, type ChainConfig } from "@/config/chains";
import { ETH_USD_FEED, tokenByL1 } from "@/config/tokens";
import { ARB_RETRYABLE_TX, decodeGatewayDeposit, retryableAbi } from "@/lib/claims/retryable";
import { readMany, withRetry } from "../multicall";
import { priceOf, readUsdPrices } from "../prices";
import type { ClaimablePosition, ProtocolAdapter, ScanContext } from "../types";

/**
 * Ethereum → L2 deposits whose automatic L2 execution failed (e.g. not enough gas).
 * The funds sit in a retryable ticket that anyone can redeem on L2 until it expires
 * (7 days by default). After that they are lost, so these are time-critical.
 *
 * Tickets that still exist are exactly the unredeemed ones: ArbRetryableTx.getTimeout reverts
 * for redeemed or expired tickets. We look back over the ticket lifetime plus a day, sized from the recent block rate.
 */

/** Default ticket lifetime is 7 days; add a day of margin. Capped at one getLogs chunk. */
const LOOKBACK_SECONDS = 8 * 86_400;
const MAX_LOOKBACK_BLOCKS = 9_999_999n;
const RATE_SAMPLE_BLOCKS = 1_000_000n;

export interface TicketTx {
  hash: Hex;
  /** L2 sender: the aliased L1 address that created the ticket. */
  from?: Address;
  beneficiary?: Address;
  refundTo?: Address;
  retryTo?: Address | null;
  retryValue?: Hex;
  retryData?: Hex;
}

interface LiveTicket {
  ticketId: Hex;
  expiresAt: number;
  tx: TicketTx;
}

/**
 * Robinhood Chain L1 (Ethereum) token gateways. Source: https://docs.robinhood.com/chain/ (contract
 * addresses). A ticket finalizing a token deposit must come from one of these, aliased.
 */
const ROBINHOOD_L1_GATEWAYS: Address[] = [
  "0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0", // L1 ERC20 Gateway
  "0x9368EAEbFe6E063C69dcF8126711A6997E0eCeE1", // L1 Arb-Custom Gateway
  "0xF7e12b9614b509C747ab4423bC4ACF923759Cf1B", // L1 WETH Gateway
];

const ALIAS_OFFSET = 0x1111000000000000000000000000000000001111n;

/** Arbitrum L1→L2 address alias: (l1 + 0x1111…1111) mod 2^160, lowercase hex. */
export function applyL1ToL2Alias(l1: Address): string {
  const v = (BigInt(l1) + ALIAS_OFFSET) % (1n << 160n);
  return `0x${v.toString(16).padStart(40, "0")}`;
}

export type TicketClass =
  | { kind: "token"; deposit: { l1Token: Address; to: Address; amount: bigint } }
  | { kind: "eth"; amount: bigint };

/**
 * Decide whether a live ticket is a deposit owned by `user`. Anyone can create a retryable with
 * arbitrary beneficiary / retryTo / calldata, so only two shapes are trusted:
 *  - token: retryTo is a verified L2 gateway, calldata is finalizeInboundTransfer, decoded `to` is the
 *    user (and, when `l1GatewayAliases` is given, the ticket sender is an aliased L1 gateway);
 *  - eth: retryTo is the user and calldata is empty.
 * Anything else (e.g. beneficiary-only matches) is skipped: redeeming it would run a contract call
 * we can't vouch for, so we don't surface it at all.
 */
export function classifyTicket(
  tx: TicketTx,
  user: Address,
  gateways: readonly Address[],
  l1GatewayAliases?: readonly string[],
): TicketClass | null {
  const me = user.toLowerCase();
  const retryTo = tx.retryTo?.toLowerCase();
  const data = tx.retryData ?? "0x";
  if (!retryTo) return null;

  if (gateways.some((g) => g.toLowerCase() === retryTo)) {
    if (l1GatewayAliases) {
      const from = tx.from?.toLowerCase();
      if (!from || !l1GatewayAliases.includes(from)) return null;
    }
    const d = data !== "0x" ? decodeGatewayDeposit(data) : null;
    if (!d || d.to.toLowerCase() !== me) return null;
    return { kind: "token", deposit: { l1Token: d.l1Token, to: d.to, amount: d.amount } };
  }

  if (retryTo === me && data === "0x") {
    return { kind: "eth", amount: BigInt(tx.retryValue ?? "0x0") };
  }
  return null;
}

/** Bounded-concurrency map that drops (and logs) individual failures. */
async function mapSettled<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        out.push(await fn(item));
      } catch (err) {
        console.warn("[retryables] dropping ticket after fetch failure", err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The live-ticket set is the same for every user, so it is computed once and shared briefly. */
const CACHE_TTL_MS = 2 * 60_000;

function createLiveTicketCache() {
  let cached: { at: number; value: Promise<LiveTicket[]> } | null = null;
  return (l2: PublicClient): Promise<LiveTicket[]> => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    const value = loadLiveTickets(l2);
    const entry = { at: Date.now(), value };
    cached = entry;
    // Never cache a failure.
    value.catch(() => {
      if (cached === entry) cached = null;
    });
    return value;
  };
}

/**
 * Tickets created within the lifetime window that still exist. getTimeout reverts for redeemed or
 * expired tickets, so the ones that answer are exactly the unredeemed deposits.
 */
async function loadLiveTickets(l2: PublicClient): Promise<LiveTicket[]> {
  const latestBlock = await l2.getBlock();
  const latest = latestBlock.number;
  // Convert the lookback window to blocks using the recent block rate.
  const sample = await l2.getBlock({
    blockNumber: latest > RATE_SAMPLE_BLOCKS ? latest - RATE_SAMPLE_BLOCKS : 0n,
  });
  const elapsed = Number(latestBlock.timestamp - sample.timestamp) || 1;
  const perSecond = Number(latest - sample.number) / elapsed;
  let lookback = BigInt(Math.ceil(perSecond * LOOKBACK_SECONDS));
  if (lookback > MAX_LOOKBACK_BLOCKS) lookback = MAX_LOOKBACK_BLOCKS;

  const created = await withRetry(
    () =>
      l2.getLogs({
        address: ARB_RETRYABLE_TX,
        event: retryableAbi[0],
        fromBlock: latest > lookback ? latest - lookback : 0n,
        toBlock: latest,
      }),
    2,
  );
  const ticketIds = created.flatMap((l) => (l.args.ticketId ? [l.args.ticketId] : []));
  if (ticketIds.length === 0) return [];

  const timeouts = await readMany(
    l2,
    ticketIds.map((ticketId) => ({
      address: ARB_RETRYABLE_TX,
      abi: retryableAbi,
      functionName: "getTimeout",
      args: [ticketId],
    })),
    { chunkConcurrency: 8 },
  );
  const live = ticketIds.flatMap((ticketId, i) => {
    const r = timeouts[i];
    return r?.status === "success" ? [{ ticketId, expiresAt: Number(r.result as bigint) }] : [];
  });

  const withTx = await mapSettled(live, 6, async (t) => {
    const tx = (await withRetry(
      () =>
        l2.request({
          method: "eth_getTransactionByHash",
          params: [t.ticketId],
        } as never),
      2,
    )) as TicketTx | null;
    return tx ? { ...t, tx } : null;
  });
  return withTx.filter((t): t is LiveTicket => t !== null);
}

export function createRetryablesAdapter(chain: ChainConfig = CHAINS.robinhood): ProtocolAdapter {
  const id = `retryables-${chain.id}`;
  const parent = chain.settlesTo ? CHAINS[chain.settlesTo] : CHAINS.ethereum;
  const liveTickets = createLiveTicketCache();
  const gw = chain.contracts.canonicalBridge.l2Gateways;
  const gateways: Address[] = gw.status === "verified" ? gw.value : [];
  // L1 gateway list is Robinhood-specific; other chains rely on the L2 gateway check alone.
  const l1Aliases =
    chain.id === CHAINS.robinhood.id ? ROBINHOOD_L1_GATEWAYS.map(applyL1ToL2Alias) : undefined;

  return {
    id,
    name: `${chain.name} failed deposits`,
    category: "bridge",
    supportedChainIds: [chain.id],
    timeoutMs: 45_000,

    async scanAddress(user: Address, ctx: ScanContext): Promise<ClaimablePosition[]> {
      const tickets = await liveTickets(ctx.getClient(chain.id));
      const mine = tickets.flatMap((t) => {
        const c = classifyTicket(t.tx, user, gateways, l1Aliases);
        if (!c) return [];
        return [
          {
            ...t,
            deposit: c.kind === "token" ? c.deposit : null,
            ethAmount: c.kind === "eth" ? c.amount : 0n,
          },
        ];
      });
      if (mine.length === 0) return [];

      const prices = await readUsdPrices(ctx.getClient(parent.id), [
        ETH_USD_FEED,
        ...mine.flatMap((t) => {
          const feed = t.deposit ? tokenByL1(t.deposit.l1Token)?.usdFeed : null;
          return feed ? [feed] : [];
        }),
      ]).catch(() => new Map<string, number>());

      return mine.map((t): ClaimablePosition => {
        const known = t.deposit ? tokenByL1(t.deposit.l1Token) : undefined;
        const asset = t.deposit
          ? {
              symbol: known?.symbol ?? "Unknown token",
              address: (known?.l2 ?? t.deposit.l1Token) as Address,
              decimals: known?.decimals ?? 18,
            }
          : { symbol: "ETH", address: "native" as const, decimals: 18 };
        const raw = t.deposit ? t.deposit.amount : t.ethAmount;
        const amount = formatUnits(raw, asset.decimals);
        const price = t.deposit
          ? priceOf(prices, known?.usdFeed ?? null)
          : priceOf(prices, ETH_USD_FEED);
        const unknownToken = t.deposit !== null && !known;

        return {
          id: `${id}:${t.ticketId}`,
          adapterId: id,
          protocol: `Failed deposit → ${chain.name}`,
          chainId: chain.id,
          kind: "claimable",
          category: "bridge",
          asset,
          amountRaw: raw.toString(),
          amountFormatted: Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }),
          estimatedUsdValue: price === null || unknownToken ? null : Number(amount) * price,
          claimAction: {
            type: "direct",
            chainId: chain.id,
            to: ARB_RETRYABLE_TX,
            data: encodeFunctionData({
              abi: retryableAbi,
              functionName: "redeem",
              args: [t.ticketId],
            }),
          },
          risk: {
            verified: !unknownToken,
            notes: `Deposit ticket expires ${new Date(t.expiresAt * 1000).toUTCString()}. Redeem before then or the funds are lost.${unknownToken ? " Token not in Reclaim's verified list; decimals assumed." : ""}`,
          },
          source: `${chain.explorer.url}/tx/${t.ticketId}`,
        };
      });
    },
  };
}
