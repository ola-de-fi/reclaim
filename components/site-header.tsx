import Link from "next/link";
import { PRIMARY_CHAIN } from "@/config/chains";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 py-4">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Reclaim
      </Link>
      <span className="flex items-center gap-2 font-mono text-xs text-zinc-400">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        {PRIMARY_CHAIN.name} · {PRIMARY_CHAIN.id}
      </span>
    </header>
  );
}
