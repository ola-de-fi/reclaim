import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

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
  themeColor: "#f4efe4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${sans.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
