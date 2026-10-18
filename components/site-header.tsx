import Link from "next/link";
import { PRIMARY_CHAIN } from "@/config/chains";
import { WalletButton } from "@/components/wallet-button";

/** The claim tag. Geometry matches design/brand/assets/mark.svg (scripts/brand/export.mjs). */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`flex-none ${className}`}>
      <g transform="rotate(-10 34 32)">
        <path
          d="M6 14 C 10 22, 14 28, 20 32"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M16 20 L26 11 H56 V53 H26 L16 44 Z"
          fill="var(--color-card)"
          stroke="var(--color-ink)"
          strokeWidth="3.6"
          strokeLinejoin="round"
        />
        <circle
          cx="23"
          cy="32"
          r="3.4"
          fill="var(--color-paper)"
          stroke="var(--color-ink)"
          strokeWidth="3"
        />
        <path
          d="M49 24 H40 a8 8 0 0 0 0 16 H49"
          fill="none"
          stroke="var(--color-stamp)"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <path
          d="M44 34.5 L49.5 40 L44 45.5"
          fill="none"
          stroke="var(--color-stamp)"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";

export function SiteHeader({ showNav = false }: { showNav?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-ink py-4 sm:py-5">
      <div className="flex min-w-0 items-center gap-6">
        <Link
          href="/"
          className={`flex items-center gap-2.5 font-serif text-2xl leading-none text-ink sm:text-3xl ${focus}`}
        >
          <LogoMark />
          Reclaim
        </Link>
        <p className="hidden font-mono text-[11px] leading-snug tracking-wider text-ink-2 uppercase md:block">
          Lost-property office
          <br />
          {PRIMARY_CHAIN.name} · {PRIMARY_CHAIN.id}
        </p>
      </div>
      <div className="flex items-center gap-6">
        {showNav && (
          <nav aria-label="Primary" className="hidden gap-6 lg:flex">
            {[
              ["#how", "How it works"],
              ["#register", "What we find"],
              ["#safety", "Safety"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={`font-mono text-xs tracking-widest text-ink-2 uppercase hover:text-ink ${focus}`}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        <WalletButton />
      </div>
    </header>
  );
}
