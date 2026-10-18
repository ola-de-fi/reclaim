"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { createWagmiConfig } from "@/lib/providers/wagmi";

const theme = lightTheme({
  accentColor: "#c2361b",
  accentColorForeground: "#fbf8f1",
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "none",
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(createWagmiConfig);
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
