import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { CHAINS, toViemChain } from "@/config/chains";

/**
 * Browser wallet config. Only the chains a claim can happen on: Ethereum (where L2→L1
 * withdrawals are executed) and Robinhood Chain. Public RPCs only; private RPCs stay server-side.
 *
 * WalletConnect wallets need NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Without it we fall back to
 * browser-extension wallets so local dev works with no setup.
 */
export function createWagmiConfig() {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
  const wallets = projectId
    ? [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
    : [injectedWallet, rabbyWallet, coinbaseWallet];

  const connectors = connectorsForWallets([{ groupName: "Wallets", wallets }], {
    appName: "Reclaim",
    projectId: projectId || "reclaim-local",
  });

  const ethereum = toViemChain(CHAINS.ethereum);
  const robinhood = toViemChain(CHAINS.robinhood);

  return createConfig({
    connectors,
    chains: [ethereum, robinhood],
    transports: {
      [ethereum.id]: http(),
      [robinhood.id]: http(),
    },
    ssr: true,
  });
}
