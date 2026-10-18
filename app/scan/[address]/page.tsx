import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { ScanView } from "@/components/scan-view";
import { SiteHeader } from "@/components/site-header";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return { title: `Scan ${address.slice(0, 6)}…${address.slice(-4)}` };
}

export default async function ScanPage({ params }: Props) {
  const { address: raw } = await params;
  if (!isAddress(raw, { strict: false })) notFound();
  const address = getAddress(raw);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6">
      <SiteHeader />
      <main className="flex flex-1 flex-col gap-4 py-8">
        <Link
          href="/"
          className="self-start font-mono text-xs tracking-[0.08em] text-ink-2 uppercase underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ← New scan
        </Link>
        <ScanView address={address} />
      </main>
    </div>
  );
}
