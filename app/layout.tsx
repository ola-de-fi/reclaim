import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

const description =
  "Find and recover forgotten crypto on Robinhood Chain: unclaimed bridge withdrawals and failed deposits. Non-custodial.";
const ogImage = "/api/og?claimable=0&pending=0&found=0";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Reclaim", template: "%s · Reclaim" },
  description,
  openGraph: {
    type: "website",
    siteName: "Reclaim",
    title: "Reclaim",
    description,
    images: [{ url: ogImage, width: 1200, height: 630, alt: "Reclaim" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reclaim",
    description,
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
