'use client';

import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useCallback } from 'react';

export function useWallet() {
  const { 
    wallet, 
    publicKey, 
    connected, 
    connecting, 
    disconnect,
    signTransaction,
    signAllTransactions 
  } = useSolanaWallet();
  
  const { setVisible } = useWalletModal();

  const connect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  return {
    wallet,
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
  };
}