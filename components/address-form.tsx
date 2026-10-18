"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";

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
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <label htmlFor="address" className="sr-only">
          Wallet address
        </label>
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
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-zinc-950 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none"
        >
          Scan
        </button>
      </div>
      <div
        id="address-error"
        className={`border-t border-zinc-800 px-4 py-3 font-mono text-xs ${error ? "text-red-400" : "text-zinc-500"}`}
      >
        {error ?? "Read-only scan. No wallet connection or signature needed."}
      </div>
    </form>
  );
}
