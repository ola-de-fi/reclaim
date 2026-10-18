import { decodeFunctionData, type Address, type Hex } from "viem";
import { ALL_CHAINS } from "@/config/chains";
import { inspectOutboxClaim } from "./outbox";
import { ARB_RETRYABLE_TX, retryableAbi } from "./retryable";

/** What a claim transaction does, decoded from its calldata for the review screen. */
export interface InspectedClaim {
  kind: "outbox" | "retryable-redeem";
  contract: Address;
  contractLabel: string;
  explorerUrl: string;
  functionName: string;
  /** Who receives the funds, when the calldata itself says so. */
  recipient: Address | null;
  /** Amount decoded from calldata. Null when only the scan knows it (e.g. redeem by ticket id). */
  decoded: { amount: bigint; tokenL1?: Address } | null;
  /** Plain-English lines describing the action. */
  lines: string[];
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Allow-list check for every transaction Reclaim asks a user to sign.
 * Anything that isn't one of the known claim shapes on a verified contract is refused.
 */
export function inspectClaim(
  to: Address,
  data: Hex,
  chainId: number,
): { ok: true; claim: InspectedClaim } | { ok: false; reason: string } {
  if (to.toLowerCase() === ARB_RETRYABLE_TX.toLowerCase()) return inspectRedeem(data, chainId);

  const r = inspectOutboxClaim(to, data, chainId);
  if (!r.ok) return r;
  const c = r.claim;
  return {
    ok: true,
    claim: {
      kind: "outbox",
      contract: c.outbox,
      contractLabel: `${c.l2ChainName} Outbox`,
      explorerUrl: c.explorerUrl,
      functionName: "executeTransaction",
      recipient: c.token?.recipient ?? c.recipient,
      decoded: c.token ? { amount: c.token.amount, tokenL1: c.token.address } : { amount: c.value },
      lines: [`Finalizes ${c.l2ChainName} withdrawal #${c.index.toString()}.`],
    },
  };
}

function inspectRedeem(
  data: Hex,
  chainId: number,
): { ok: true; claim: InspectedClaim } | { ok: false; reason: string } {
  // Only on Arbitrum chains whose bridge we have verified.
  const chain = ALL_CHAINS.find(
    (c) => c.id === chainId && c.contracts.canonicalBridge.rollup.status === "verified",
  );
  if (!chain) return { ok: false, reason: "Redeem is only allowed on a verified Arbitrum chain." };
  try {
    const d = decodeFunctionData({ abi: retryableAbi, data });
    if (d.functionName !== "redeem") {
      return { ok: false, reason: "Calldata is not a retryable redeem call." };
    }
    const [ticketId] = d.args;
    return {
      ok: true,
      claim: {
        kind: "retryable-redeem",
        contract: ARB_RETRYABLE_TX,
        contractLabel: "ArbRetryableTx (system contract)",
        explorerUrl: chain.explorer.url,
        functionName: "redeem",
        recipient: null,
        decoded: null,
        lines: [
          `Re-runs failed deposit ticket ${short(ticketId)}.`,
          "The deposit then completes to the address it was originally sent to.",
        ],
      },
    };
  } catch {
    return { ok: false, reason: "Calldata could not be decoded." };
  }
}
