import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NFT Marketplace", template: "%s · NFT Marketplace" },
  description: "Read-only explorer for a Solana NFT marketplace: fixed-price listings, offers and live auctions.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0b14" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <WalletProvider>
          <Header />
          <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
            {children}
          </main>
        </WalletProvider>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
          Read-only interface. Artwork is generated from each mint address; on-chain metadata is not
          fetched.
        </footer>
      </body>
    </html>
  );
}
