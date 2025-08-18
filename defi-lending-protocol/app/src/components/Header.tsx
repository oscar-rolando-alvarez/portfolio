'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useEffect, useState } from 'react'

export function Header() {
  const { connected, publicKey } = useWallet()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">DL</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">DeFi Lending</h1>
              <p className="text-xs text-gray-500">Powered by Solana</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#" className="text-gray-600 hover:text-primary-600 font-medium">
              Markets
            </a>
            <a href="#" className="text-gray-600 hover:text-primary-600 font-medium">
              Analytics
            </a>
            <a href="#" className="text-gray-600 hover:text-primary-600 font-medium">
              Docs
            </a>
            <a href="#" className="text-gray-600 hover:text-primary-600 font-medium">
              Support
            </a>
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {connected && publicKey && (
              <div className="hidden md:flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-600 text-sm font-medium">
                    {publicKey.toString().slice(0, 2)}
                  </span>
                </div>
                <span className="text-sm text-gray-600 font-mono">
                  {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                </span>
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  )
}