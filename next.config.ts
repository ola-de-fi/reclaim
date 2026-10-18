import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config, { webpack }) => {
    config.plugins.push(
      // Optional deps of wallet SDKs that we never use: x402 (via @coinbase/cdp-sdk) and React
      // Native storage (via @metamask/sdk). Skip them instead of failing or warning.
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402\/|@react-native-async-storage\/async-storage$)/,
      }),
    );
    // Optional deps pulled in by WalletConnect; not needed in the browser.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
