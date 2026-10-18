import Link from "next/link";
import { PRIMARY_CHAIN } from "@/config/chains";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-zinc-800 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Reclaim
        </Link>
        <span className="hidden items-center gap-2 font-mono text-xs text-zinc-500 sm:flex">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          {PRIMARY_CHAIN.name} · {PRIMARY_CHAIN.id}
        </span>
      </div>
      <WalletButton />
    </header>
  );
}
