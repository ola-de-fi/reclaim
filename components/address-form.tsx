"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";

const SEARCHES = [
  "Unclaimed withdrawals to Ethereum",
  "Failed deposits from Ethereum",
  "Balances left in the wallet",
] as const;

export function AddressForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (!isAddress(address, { strict: false })) {
      setError(
        address.endsWith(".eth")
          ? "ENS names are coming soon. Paste the 0x address for now."
          : "That doesn't look like a wallet address. It should start with 0x and be 42 characters.",
      );
      return;
    }
    router.push(`/scan/${address}`);
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="form-title">
      <div className="flex justify-between gap-3 border-b border-ink px-4 py-3 font-mono text-[11px] tracking-widest text-ink uppercase sm:px-5">
        <span>Form RC-1 · Lost-property enquiry</span>
      </div>
      <div className="px-4 pt-6 pb-5 sm:px-5">
        <h2 id="form-title" className="mb-5 font-serif text-3xl leading-tight text-ink">
          Describe what you lost.
        </h2>
        <div className="mb-1.5 flex justify-between font-mono text-[11px] tracking-widest text-ink-2 uppercase">
          <label htmlFor="address">Wallet address</label>
          <span aria-hidden="true">Required</span>
        </div>
        <input
          id="address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "address-error" : undefined}
          className={`w-full min-w-0 border-0 border-b-[1.5px] bg-transparent py-2.5 font-mono text-base text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp ${error ? "border-stamp" : "border-ink"}`}
        />
        <ul aria-label="Searches included" className="mt-5 mb-6 grid gap-2 text-sm text-ink-2">
          {SEARCHES.map((s) => (
            <li key={s} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-[15px] flex-none place-items-center border-[1.5px] border-ink"
              >
                <span className="size-[7px] bg-ink" />
              </span>
              {s}
            </li>
          ))}
        </ul>
        <button
          type="submit"
          className="w-full border-[1.5px] border-ink bg-ink px-4 py-3 font-mono text-sm font-semibold tracking-wider text-card uppercase shadow-ledger hover:bg-stamp hover:border-stamp focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp active:translate-x-px active:translate-y-px active:shadow-none"
        >
          Search the register →
        </button>
      </div>
      <div
        id="address-error"
        className={`border-t border-dashed border-rule px-4 py-3 font-mono text-xs sm:px-5 ${error ? "text-stamp-ink" : "text-ink-3"}`}
      >
        {error ?? "Read-only scan. No wallet connection or signature needed."}
      </div>
    </form>
  );
}
