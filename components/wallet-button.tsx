"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/** Matte-styled wrapper around RainbowKit's connect flow. */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        const base =
          "rounded-md border px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";
        if (!mounted) return <span className={`${base} invisible border-zinc-800`}>Connect</span>;
        if (!account) {
          return (
            <button
              onClick={openConnectModal}
              className={`${base} border-zinc-700 text-zinc-200 hover:border-zinc-500`}
            >
              Connect wallet
            </button>
          );
        }
        if (chain?.unsupported) {
          return (
            <button onClick={openChainModal} className={`${base} border-red-900 text-red-300`}>
              Wrong network
            </button>
          );
        }
        return (
          <button
            onClick={openAccountModal}
            className={`${base} flex items-center gap-2 border-zinc-800 text-zinc-300 hover:border-zinc-600`}
          >
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
