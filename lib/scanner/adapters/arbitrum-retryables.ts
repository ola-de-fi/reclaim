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

interface TicketTx {
  hash: Hex;
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

  const withTx = await Promise.all(
    live.map(async (t) => {
      const tx = (await l2.request({
        method: "eth_getTransactionByHash",
        params: [t.ticketId],
      } as never)) as TicketTx | null;
      return tx ? { ...t, tx } : null;
    }),
  );
  return withTx.filter((t): t is LiveTicket => t !== null);
}

export function createRetryablesAdapter(chain: ChainConfig = CHAINS.robinhood): ProtocolAdapter {
  const id = `retryables-${chain.id}`;
  const parent = chain.settlesTo ? CHAINS[chain.settlesTo] : CHAINS.ethereum;
  const liveTickets = createLiveTicketCache();

  return {
    id,
    name: `${chain.name} failed deposits`,
    category: "bridge",
    supportedChainIds: [chain.id],
    timeoutMs: 45_000,

    async scanAddress(user: Address, ctx: ScanContext): Promise<ClaimablePosition[]> {
      const tickets = await liveTickets(ctx.getClient(chain.id));
      const me = user.toLowerCase();
      const mine = tickets.flatMap((t) => {
        const deposit = t.tx.retryData ? decodeGatewayDeposit(t.tx.retryData) : null;
        const owners = [t.tx.beneficiary, t.tx.retryTo, deposit?.to].map((a) => a?.toLowerCase());
        return owners.includes(me) ? [{ ...t, deposit }] : [];
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
              symbol: known?.symbol ?? "TOKEN",
              address: (known?.l2 ?? t.deposit.l1Token) as Address,
              decimals: known?.decimals ?? 18,
            }
          : { symbol: "ETH", address: "native" as const, decimals: 18 };
        const raw = t.deposit ? t.deposit.amount : BigInt(t.tx.retryValue ?? "0x0");
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
