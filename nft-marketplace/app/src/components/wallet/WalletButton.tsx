"use client";

import { type UiWallet, useConnect, useDisconnect } from "@wallet-standard/react";
import { useId, useRef, useState } from "react";
import { shortenAddress } from "@/lib/format";
import { useWalletSelection } from "./WalletProvider";

function WalletIcon({ wallet }: { wallet: UiWallet }) {
  // Wallet icons are data: URIs supplied by the wallet; next/image is not applicable here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={wallet.icon} alt="" width={20} height={20} className="size-5 rounded" />;
}

function WalletOption({
  wallet,
  onConnected,
  onError,
}: {
  wallet: UiWallet;
  onConnected: () => void;
  onError: (message: string) => void;
}) {
  const { select } = useWalletSelection();
  const [isConnecting, connect] = useConnect(wallet);

  async function handleClick() {
    try {
      const accounts = await connect();
      const first = accounts[0] ?? wallet.accounts[0];
      if (!first) {
        onError(`${wallet.name} did not authorize any account.`);
        return;
      }
      select(wallet, first);
      onConnected();
    } catch (err) {
      onError(err instanceof Error ? err.message : `Could not connect to ${wallet.name}.`);
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        disabled={isConnecting}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted disabled:opacity-60"
      >
        <WalletIcon wallet={wallet} />
        <span className="flex-1">{wallet.name}</span>
        {isConnecting && <span className="text-xs text-muted">Connecting…</span>}
      </button>
    </li>
  );
}

function ConnectedButton({ wallet, address }: { wallet: UiWallet; address: string }) {
  const { clear } = useWalletSelection();
  const [isDisconnecting, disconnect] = useDisconnect(wallet);

  async function handleDisconnect() {
    try {
      await disconnect();
    } finally {
      clear();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-sm sm:inline-flex"
        title={address}
      >
        <WalletIcon wallet={wallet} />
        {shortenAddress(address)}
      </span>
      <button
        type="button"
        onClick={handleDisconnect}
        disabled={isDisconnecting}
        className="btn-secondary"
        aria-label={`Disconnect ${shortenAddress(address)}`}
      >
        <span className="font-mono sm:hidden">{shortenAddress(address, 3)}</span>
        <span className="hidden sm:inline">Disconnect</span>
      </button>
    </div>
  );
}

export function WalletButton() {
  const { wallets, wallet, account } = useWalletSelection();
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  if (wallet && account) return <ConnectedButton wallet={wallet} address={account.address} />;

  return (
    <div className="relative">
      <button
        type="button"
        popoverTarget={popoverId}
        className="btn-primary"
        onClick={() => setError(null)}
      >
        Connect wallet
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="popover-panel"
        aria-label="Choose a wallet"
      >
        <p className="px-3 pt-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Wallet Standard wallets
        </p>
        {wallets.length === 0 ? (
          <p className="px-3 pb-2 text-sm text-muted">
            No compatible wallet detected. Install a Solana wallet that supports the Wallet
            Standard (for example Phantom, Solflare or Backpack) and reload.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {wallets.map((w) => (
              <WalletOption
                key={w.name}
                wallet={w}
                onConnected={() => popoverRef.current?.hidePopover()}
                onError={setError}
              />
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mx-3 mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
