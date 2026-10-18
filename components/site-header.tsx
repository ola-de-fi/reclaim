import Link from "next/link";
import { PRIMARY_CHAIN } from "@/config/chains";
import { WalletButton } from "@/components/wallet-button";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={`flex-none ${className}`}>
      <path
        d="M4 9.5 11 3h17v26H11L4 22.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="16" r="2.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M23 11.5h-6.5a3.5 3.5 0 0 0 0 7H23"
        fill="none"
        stroke="var(--color-stamp)"
        strokeWidth="2.2"
      />
      <path
        d="m20 15.5 3 3-3 3"
        fill="none"
        stroke="var(--color-stamp)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
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
