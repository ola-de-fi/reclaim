import Link from "next/link";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL;

export function SiteFooter() {
  const links: Array<[string, string]> = [
    ["/safety", "Safety"],
    ["/about", "About"],
    ["/terms", "Terms & privacy"],
  ];
  return (
    <footer className="mt-auto flex flex-col gap-4 border-t border-ink py-6 font-mono text-xs text-ink-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <p>Independent tool. Not affiliated with Robinhood.</p>
        <p>Non-custodial. Reclaim never asks for your seed phrase or token approvals.</p>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 tracking-wider uppercase">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={`hover:text-ink hover:underline ${focus}`}>
            {label}
          </Link>
        ))}
        {REPO_URL && (
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:text-ink hover:underline ${focus}`}
          >
            Source code ↗
          </a>
        )}
      </nav>
    </footer>
  );
}
