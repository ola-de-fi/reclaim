"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/** Ledger-styled wrapper around RainbowKit's connect flow. */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        const base =
          "border px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";
        if (!mounted) return <span className={`${base} invisible border-ink`}>Connect</span>;
        if (!account) {
          return (
            <button
              onClick={openConnectModal}
              className={`${base} border-ink bg-card text-ink hover:bg-paper-2`}
            >
              Connect wallet
            </button>
          );
        }
        if (chain?.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className={`${base} border-stamp bg-card text-stamp-ink hover:bg-paper-2`}
            >
              Wrong network
            </button>
          );
        }
        return (
          <button
            onClick={openAccountModal}
            className={`${base} flex items-center gap-2 border-ink bg-card text-ink hover:bg-paper-2`}
          >
            <span className="size-1.5 rounded-full bg-stamp" aria-hidden />
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
