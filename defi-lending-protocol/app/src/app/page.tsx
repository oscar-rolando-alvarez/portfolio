'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useState, useEffect } from 'react'
import { Header } from '../components/Header'
import { Dashboard } from '../components/Dashboard'
import { LendingInterface } from '../components/LendingInterface'
import { BorrowingInterface } from '../components/BorrowingInterface'
import { ProtocolStats } from '../components/ProtocolStats'
import { GovernancePanel } from '../components/GovernancePanel'
import { useProgram } from '../hooks/useProgram'

export default function Home() {
  const { connected } = useWallet()
  const { program, connection } = useProgram()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'lend' | 'borrow' | 'governance'>('dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gradient mb-4">
            DeFi Lending Protocol
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Lend, borrow, and earn on Solana with our decentralized lending platform. 
            Powered by smart contracts and governed by the community.
          </p>
          
          {!connected && (
            <div className="flex justify-center">
              <WalletMultiButton />
            </div>
          )}
        </div>

        {/* Protocol Stats */}
        <ProtocolStats />

        {connected && (
          <>
            {/* Navigation Tabs */}
            <div className="flex justify-center mb-8">
              <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-md">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
                  { id: 'lend', label: 'Lend', icon: '💰' },
                  { id: 'borrow', label: 'Borrow', icon: '🏦' },
                  { id: 'governance', label: 'Governance', icon: '🗳️' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-md font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="max-w-6xl mx-auto">
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'lend' && <LendingInterface />}
              {activeTab === 'borrow' && <BorrowingInterface />}
              {activeTab === 'governance' && <GovernancePanel />}
            </div>
          </>
        )}

        {!connected && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
              <div className="mb-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔗</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Connect Your Wallet
                </h3>
                <p className="text-gray-600">
                  Connect your Solana wallet to start lending, borrowing, and participating in governance.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>✅ Phantom</span>
                  <span>✅ Solflare</span>
                  <span>✅ Slope</span>
                </div>
                
                <WalletMultiButton className="w-full" />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">
            Protocol Features
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: '🏦',
                title: 'Lending & Borrowing',
                description: 'Supply assets to earn interest or borrow against your collateral',
              },
              {
                icon: '⚡',
                title: 'Flash Loans',
                description: 'Access instant liquidity for arbitrage and liquidations',
              },
              {
                icon: '🗳️',
                title: 'Governance',
                description: 'Participate in protocol governance with voting tokens',
              },
              {
                icon: '🔒',
                title: 'Liquidation Protection',
                description: 'Automated liquidation system protects the protocol',
              },
            ].map((feature, index) => (
              <div key={index} className="text-center p-6 card-hover">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">{feature.icon}</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2024 DeFi Lending Protocol. Built on Solana.
          </p>
        </div>
      </footer>
    </div>
  )
}