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

  const focusRing =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";
  const row = "grid grid-cols-[7.5rem_1fr] gap-3 border-b border-rule py-2.5 last:border-b-0";
  const key = "font-mono text-[11px] uppercase tracking-wider text-ink-3";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        tabIndex={-1}
        onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
        className="max-h-full w-full max-w-lg overflow-y-auto border-2 border-ink bg-card text-ink shadow-ledger focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper-2 px-5 py-2.5">
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">
            Release form · Item {short(position.id)}
          </span>
          <button
            onClick={() => onClose()}
            disabled={busy}
            aria-label="Close"
            className={`shrink-0 font-mono text-xs uppercase tracking-wider text-ink-2 hover:text-ink disabled:opacity-40 ${focusRing}`}
          >
            Close ✕
          </button>
        </div>

        <div className="px-5 pt-5">
          <h2 id="claim-title" className="font-serif text-2xl leading-tight text-ink">
            Review before you sign.
          </h2>
        </div>

        {!inspection.ok ? (
          <p
            role="alert"
            className="mx-5 my-5 border-2 border-stamp bg-paper px-4 py-3 text-sm text-stamp-ink"
          >
            Blocked: {inspection.reason} Reclaim will not let you sign this transaction.
          </p>
        ) : (
          <div className="flex flex-col gap-4 px-5 pt-3 pb-5">
            <div>
              <div className={key}>You receive</div>
              <div className="mt-1 font-mono text-3xl break-words text-ink">{receive?.text}</div>
              <div className="font-mono text-xs text-ink-3">
                {receive?.known &&
                  position.estimatedUsdValue !== null &&
                  `≈ $${position.estimatedUsdValue.toFixed(2)} (scan estimate)`}
                {receive?.note}
              </div>
            </div>

            <ul className="border-y-2 border-ink text-sm text-ink-2">
              {inspection.claim.lines.map((line) => (
                <li key={line} className="border-b border-rule py-2.5">
                  {line}
                </li>
              ))}
              <li className={row}>
                <span className={key}>Contract called</span>
                <span>
                  <span className="font-mono text-ink">{inspection.claim.functionName}</span> on{" "}
                  {inspection.claim.contractLabel}{" "}
                  <a
                    href={`${inspection.claim.explorerUrl}/address/${inspection.claim.contract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-mono text-ink underline decoration-rule underline-offset-2 hover:decoration-ink ${focusRing}`}
                  >
                    {short(inspection.claim.contract)} ↗
                  </a>{" "}
                  on {claimChain?.name ?? `chain ${action.chainId}`}. Verified contract.
                </span>
              </li>
              {recipient && (
                <li className={row}>
                  <span className={key}>Funds go to</span>
                  <span>
                    <span className="font-mono text-ink">{short(recipient)}</span>
                    {account && recipient && account.toLowerCase() !== recipient.toLowerCase() && (
                      <span className="font-medium text-stamp-ink">
                        {" "}
                        — not your connected wallet. You would pay gas to release someone
                        else&apos;s funds.
                      </span>
                    )}
                    .
                  </span>
                </li>
              )}
              <li className={row}>
                <span className={key}>Simulation</span>
                <span className="font-mono text-xs">
                  {sim.state === "running" && <span className="text-ink-3">Simulating…</span>}
                  {sim.state === "ok" && (
                    <span className="text-ink-2">
                      <span className="text-transit">✓</span> Simulation passed · gas{" "}
                      {sim.gas.toLocaleString()}
                    </span>
                  )}
                  {sim.state === "failed" && (
                    <span role="alert" className="text-stamp-ink">
                      ✕ Simulation failed: {sim.reason}
                    </span>
                  )}
                </span>
              </li>
              <li className={row}>
                <span className={key}>Token approvals</span>
                <span>No token approvals. No Reclaim fee.</span>
              </li>
              {sim.state === "ok" && gasEth !== null && (
                <li className={row}>
                  <span className={key}>Network fee</span>
                  <span className="font-mono text-xs">
                    ≈ {Number(formatEther(gasEth)).toFixed(6)} ETH
                    {ethUsd !== null && ` ($${(Number(formatEther(gasEth)) * ethUsd).toFixed(2)})`}
                  </span>
                </li>
              )}
            </ul>

            {sim.state !== "running" && (
              <div aria-hidden className="flex justify-end pr-2">
                {sim.state === "ok" ? (
                  <span className="stamp text-transit">Simulation passed</span>
                ) : (
                  <span className="stamp text-stamp">Simulation failed</span>
                )}
              </div>
            )}

            {send.error && (
              <p role="alert" className="font-mono text-xs text-stamp-ink">
                {friendlyError(send.error)}
              </p>
            )}

            {send.data && (
              <div className="border border-ink bg-paper px-3 py-2 font-mono text-xs text-ink-2">
                {done ? (
                  <span className="text-transit">✓ Collected</span>
                ) : reverted ? (
                  <span className="text-stamp-ink">✕ Transaction reverted</span>
                ) : (
                  "Waiting for confirmation…"
                )}{" "}
                ·{" "}
                <a
                  href={`${claimChain?.explorer.url}/tx/${send.data}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-ink underline ${focusRing}`}
                >
                  view tx ↗
                </a>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!done && (
                <button
                  onClick={() => onClose()}
                  disabled={busy}
                  className={`border-2 border-ink bg-card px-4 py-2.5 font-mono text-sm text-ink hover:bg-paper-2 disabled:opacity-40 ${focusRing}`}
                >
                  Cancel
                </button>
              )}
              {done ? (
                <button
                  onClick={() => onClose()}
                  className={`border-2 border-ink bg-card px-4 py-2.5 font-mono text-sm text-ink hover:bg-paper-2 ${focusRing}`}
                >
                  Done
                </button>
              ) : !account ? (
                <button
                  onClick={openConnectModal}
                  className={`border-2 border-ink bg-stamp px-4 py-2.5 font-mono text-sm font-semibold text-card ${focusRing}`}
                >
                  Connect wallet to collect
                </button>
              ) : (
                <button
                  onClick={confirm}
                  disabled={busy || sim.state !== "ok"}
                  className={`border-2 border-ink bg-stamp px-4 py-2.5 font-mono text-sm font-semibold text-card disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                >
                  {switching
                    ? "Switching network…"
                    : send.isPending
                      ? "Confirm in your wallet…"
                      : send.data && receipt.isLoading
                        ? "Collecting…"
                        : walletChainId !== action.chainId
                          ? `Switch to ${claimChain?.name ?? "network"} & collect`
                          : "Collect"}
                </button>
              )}
            </div>
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
  if (/ALREADY_SPENT|already spent/i.test(msg))
    return "This withdrawal has already been collected.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH on Ethereum to pay gas.";
  return msg.split("\n")[0] ?? "Unknown error";
}
