"use client";

import {
  type UiWallet,
  type UiWalletAccount,
  useWallets,
} from "@wallet-standard/react";
import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { walletChain } from "@/lib/config";

interface Selection {
  walletName: string;
  address: string;
}

interface WalletContextValue {
  /** Wallet Standard wallets that can connect and support Solana. */
  wallets: readonly UiWallet[];
  wallet: UiWallet | null;
  account: UiWalletAccount | null;
  select: (wallet: UiWallet, account: UiWalletAccount) => void;
  clear: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function isSolanaWallet(wallet: UiWallet): boolean {
  return (
    wallet.features.includes("standard:connect") &&
    wallet.chains.some((chain) => chain.startsWith("solana:"))
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const allWallets = useWallets();
  const [selection, setSelection] = useState<Selection | null>(null);

  const value = useMemo<WalletContextValue>(() => {
    const preferredChain = walletChain();
    const wallets = allWallets
      .filter(isSolanaWallet)
      .toSorted(
        (a, b) => Number(b.chains.includes(preferredChain)) - Number(a.chains.includes(preferredChain)),
      );
    // Re-derive from the live registry so stale accounts disappear when a wallet disconnects.
    const wallet = selection ? (wallets.find((w) => w.name === selection.walletName) ?? null) : null;
    const account = wallet?.accounts.find((a) => a.address === selection?.address) ?? null;
    return {
      wallets,
      wallet: account ? wallet : null,
      account,
      select: (w, a) => setSelection({ walletName: w.name, address: a.address }),
      clear: () => setSelection(null),
    };
  }, [allWallets, selection]);

  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWalletSelection(): WalletContextValue {
  const ctx = use(WalletContext);
  if (!ctx) throw new Error("useWalletSelection must be used inside <WalletProvider>");
  return ctx;
}
