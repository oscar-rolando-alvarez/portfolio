'use client'

import React, { FC, ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  SlopeWalletAdapter,
  BackpackWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// Import wallet adapter CSS
require('@solana/wallet-adapter-react-ui/styles.css')

interface WalletContextProviderProps {
  children: ReactNode
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  // Configure the network (devnet, testnet, mainnet-beta)
  const network = WalletAdapterNetwork.Devnet
  
  // You can also provide a custom RPC endpoint
  const endpoint = useMemo(() => {
    if (network === WalletAdapterNetwork.Devnet) {
      return process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(network)
    }
    return clusterApiUrl(network)
  }, [network])

  // Configure supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new SlopeWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}