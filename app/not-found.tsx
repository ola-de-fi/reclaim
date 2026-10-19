import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-start justify-center gap-5 py-14">
        <span className="stamp text-stamp-ink">Not on file · 404</span>
        <h1 className="font-serif text-5xl leading-none tracking-tight text-ink sm:text-6xl">
          No such <em className="text-stamp">record</em>.
        </h1>
        <p className="max-w-md text-pretty text-ink-2">
          This page does not exist, or the address in the link is not a valid wallet address.
        </p>
        <Link
          href="/"
          className="border-[1.5px] border-ink bg-ink px-4 py-2.5 font-mono text-sm font-semibold tracking-wider text-card uppercase shadow-ledger hover:border-stamp hover:bg-stamp focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp"
        >
          Back to the counter →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
