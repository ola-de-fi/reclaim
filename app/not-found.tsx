import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-6">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-start justify-center gap-4 py-14">
        <p className="font-mono text-xs text-zinc-500">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-md text-pretty text-zinc-400">
          This page does not exist, or the address in the link is not a valid wallet address.
        </p>
        <Link
          href="/"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Back to scanner
        </Link>
      </main>
    </div>
  );
}
