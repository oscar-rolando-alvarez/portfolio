'use client';

import { useWallet } from '../../hooks/useWallet';
import { useTheme } from '../../contexts/ThemeContext';

export function Header() {
  const { connected, connect, disconnect, publicKey } = useWallet();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold">NFT Marketplace</h1>
          <nav className="hidden md:flex items-center gap-6">
            <a href="/explore" className="text-sm font-medium hover:text-primary">Explore</a>
            <a href="/collections" className="text-sm font-medium hover:text-primary">Collections</a>
            <a href="/create" className="text-sm font-medium hover:text-primary">Create</a>
            <a href="/activity" className="text-sm font-medium hover:text-primary">Activity</a>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-accent"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '🌞' : '🌙'}
          </button>
          
          {connected ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
              </span>
              <button onClick={disconnect} className="btn-outline">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connect} className="btn-primary">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}