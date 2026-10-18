"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, formatUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { getChainById } from "@/config/chains";
import { tokenByL1 } from "@/config/tokens";
import { inspectClaim } from "@/lib/claims/inspect";
import type { ClaimAction, ClaimablePosition } from "@/lib/scanner/types";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const trim = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 });
const PLACEHOLDER_SENDER: Address = "0x000000000000000000000000000000000000dEaD";

type Simulation =
  | { state: "running" }
  | { state: "ok"; gas: bigint; gasPrice: bigint | null; from: Address }
  | { state: "failed"; reason: string };

/**
 * Review-then-sign flow for a direct claim:
 * 1. Verify the target is a known Outbox and decode what the calldata really does.
 * 2. Simulate on the claim chain (re-run right before signing with the connected account).
 * 3. Show a plain-English summary. The user signs in their own wallet. No approvals, no fee.
 */
export function ClaimDialog({
  position,
  onClose,
  onClaimed,
}: {
  position: ClaimablePosition;
  onClose: () => void;
  onClaimed: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  if (position.claimAction.type !== "direct") throw new Error("ClaimDialog needs a direct claim");
  const action: Extract<ClaimAction, { type: "direct" }> = position.claimAction;

  const claimChain = getChainById(action.chainId);
  const inspection = useMemo(
    () => inspectClaim(action.to, action.data, action.chainId),
    [action.to, action.data, action.chainId],
  );

  const { address: account, chainId: walletChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const client = usePublicClient({ chainId: action.chainId });
  const send = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash: send.data, chainId: action.chainId });

  const [sim, setSim] = useState<Simulation>({ state: "running" });
  const recipient = inspection.ok ? inspection.claim.recipient : null;

  // Not a native modal <dialog>: its top layer would hide the RainbowKit wallet picker.
  useEffect(() => {
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Simulate as the connected wallet, or before connecting as the recipient (or any sender).
  // Both claim types are permissionless, so anyone may submit them.
  const simFrom = account ?? recipient ?? PLACEHOLDER_SENDER;
  useEffect(() => {
    if (!inspection.ok || !client || !simFrom) return;
    let cancelled = false;
    setSim({ state: "running" });
    simulate(client, simFrom, action.to, action.data)
      .then((r) => !cancelled && setSim(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inspection.ok, client, simFrom, action.to, action.data]);

  useEffect(() => {
    if (receipt.data?.status === "success") onClaimed(position.id);
  }, [receipt.data?.status, onClaimed, position.id]);

  // Guards the whole confirm flow (switch + fresh simulation + send) against double-submit.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (!account || !client || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (walletChainId !== action.chainId) {
        await switchChainAsync({ chainId: action.chainId });
      }
      // Fresh simulation with the exact sender, immediately before signing.
      const fresh = await simulate(client, account, action.to, action.data);
      setSim(fresh);
      if (fresh.state !== "ok") return;
      await send.sendTransactionAsync({
        chainId: action.chainId,
        to: action.to,
        data: action.data,
        value: 0n,
        gas: (fresh.gas * 12n) / 10n,
      });
    } catch {
      // Errors surface through send.error / the switch hook.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // What the calldata itself says is received. Symbol/decimals come from our token list, never the scan.
  const receive = (() => {
    if (!inspection.ok) return null;
    const d = inspection.claim.decoded;
    if (!d) {
      return {
        text: `${position.amountFormatted} ${position.asset.symbol}`,
        known: true,
        note: " · per scan, not decoded from the transaction",
      };
    }
    if (!d.tokenL1) {
      return { text: `${trim(formatUnits(d.amount, 18))} ETH`, known: true, note: "" };
    }
    const t = tokenByL1(d.tokenL1);
    if (!t) {
      return {
        text: `${d.amount.toString()} units of unknown token ${short(d.tokenL1)}`,
        known: false,
        note: "",
      };
    }
    return {
      text: `${trim(formatUnits(d.amount, t.decimals))} ${t.symbol}`,
      known: true,
      note: "",
    };
  })();

  const gasEth = sim.state === "ok" && sim.gasPrice !== null ? sim.gas * sim.gasPrice : null;
  const ethUsd =
    position.asset.symbol === "ETH" && position.estimatedUsdValue
      ? position.estimatedUsdValue /
        Number(formatUnits(BigInt(position.amountRaw), position.asset.decimals))
      : null;

  const done = receipt.data?.status === "success";
  const reverted = receipt.data?.status === "reverted";
  const busy =
    submitting || switching || send.isPending || (send.data !== undefined && receipt.isLoading);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        tabIndex={-1}
        onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 id="claim-title" className="text-sm font-semibold">
            Review claim
          </h2>
          <button
            onClick={() => onClose()}
            disabled={busy}
            aria-label="Close"
            className="font-mono text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
          >
            esc
          </button>
        </div>

        {!inspection.ok ? (
          <p role="alert" className="px-5 py-5 text-sm text-red-300">
            Blocked: {inspection.reason} Reclaim will not let you sign this transaction.
          </p>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div>
              <div className="text-xs text-zinc-500">You receive</div>
              <div className="mt-1 font-mono text-2xl text-accent">{receive?.text}</div>
              <div className="font-mono text-xs text-zinc-500">
                {receive?.known &&
                  position.estimatedUsdValue !== null &&
                  `≈ $${position.estimatedUsdValue.toFixed(2)} (scan estimate)`}
                {receive?.note}
              </div>
            </div>

            <ul className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
              {inspection.claim.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                Calls <span className="font-mono">{inspection.claim.functionName}</span> on{" "}
                {inspection.claim.contractLabel}{" "}
                <a
                  href={`${inspection.claim.explorerUrl}/address/${inspection.claim.contract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-zinc-400 underline decoration-zinc-700 hover:text-zinc-200"
                >
                  {short(inspection.claim.contract)} ↗
                </a>{" "}
                on {claimChain?.name ?? `chain ${action.chainId}`}. Verified contract.
              </li>
              {recipient && (
                <li>
                  Funds go to <span className="font-mono">{short(recipient)}</span>
                  {account && recipient && account.toLowerCase() !== recipient.toLowerCase() && (
                    <span className="text-amber-300">
                      {" "}
                      — not your connected wallet. You would pay gas to release someone else&apos;s
                      funds.
                    </span>
                  )}
                  .
                </li>
              )}
              <li>No token approvals. No Reclaim fee.</li>
            </ul>

            <div className="font-mono text-xs">
              {sim.state === "running" && <span className="text-zinc-500">Simulating…</span>}
              {sim.state === "ok" && (
                <span className="text-zinc-400">
                  <span className="text-accent">✓</span> Simulation passed · gas{" "}
                  {sim.gas.toLocaleString()}
                  {gasEth !== null && (
                    <>
                      {" "}
                      · ≈ {Number(formatEther(gasEth)).toFixed(6)} ETH
                      {ethUsd !== null &&
                        ` ($${(Number(formatEther(gasEth)) * ethUsd).toFixed(2)})`}
                    </>
                  )}
                </span>
              )}
              {sim.state === "failed" && (
                <span role="alert" className="text-red-300">
                  ✕ Simulation failed: {sim.reason}
                </span>
              )}
            </div>

            {send.error && (
              <p role="alert" className="font-mono text-xs text-red-300">
                {friendlyError(send.error)}
              </p>
            )}

            {send.data && (
              <div className="rounded-md border border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-400">
                {done ? (
                  <span className="text-accent">✓ Claimed</span>
                ) : reverted ? (
                  <span className="text-red-300">✕ Transaction reverted</span>
                ) : (
                  "Waiting for confirmation…"
                )}{" "}
                ·{" "}
                <a
                  href={`${claimChain?.explorer.url}/tx/${send.data}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  view tx ↗
                </a>
              </div>
            )}

            {done ? (
              <button
                onClick={() => onClose()}
                className="rounded-md border border-zinc-700 px-4 py-2.5 text-sm"
              >
                Done
              </button>
            ) : !account ? (
              <button
                onClick={openConnectModal}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-zinc-950"
              >
                Connect wallet to claim
              </button>
            ) : (
              <button
                onClick={confirm}
                disabled={busy || sim.state !== "ok"}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {switching
                  ? "Switching network…"
                  : send.isPending
                    ? "Confirm in your wallet…"
                    : send.data && receipt.isLoading
                      ? "Claiming…"
                      : walletChainId !== action.chainId
                        ? `Switch to ${claimChain?.name ?? "network"} & claim`
                        : "Claim"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function simulate(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  from: Address,
  to: Address,
  data: Hex,
): Promise<Simulation> {
  try {
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({ account: from, to, data }),
      client.getGasPrice().catch(() => null),
    ]);
    return { state: "ok", gas, gasPrice, from };
  } catch (err) {
    return { state: "failed", reason: friendlyError(err) };
  }
}

function friendlyError(err: unknown): string {
  const msg =
    err instanceof Error
      ? ((err as { shortMessage?: string }).shortMessage ?? err.message)
      : String(err);
  if (/user rejected|denied/i.test(msg)) return "You rejected the request in your wallet.";
  if (/ALREADY_SPENT|already spent/i.test(msg)) return "This withdrawal has already been claimed.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH on Ethereum to pay gas.";
  return msg.split("\n")[0] ?? "Unknown error";
}
