'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useProgram } from '../hooks/useProgram'
import { PortfolioOverview } from './PortfolioOverview'
import { MarketList } from './MarketList'
import { TransactionHistory } from './TransactionHistory'
import { HealthFactor } from './HealthFactor'

export function Dashboard() {
  const { connected, publicKey } = useWallet()
  const { program } = useProgram()
  const [userObligation, setUserObligation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (connected && publicKey && program) {
      fetchUserData()
    }
  }, [connected, publicKey, program])

  const fetchUserData = async () => {
    try {
      setLoading(true)
      // Fetch user obligation and other data
      // This would interact with your Anchor program
      
      // Mock data for now
      setTimeout(() => {
        setUserObligation({
          totalSupply: 5000,
          totalBorrow: 2000,
          healthFactor: 1.85,
          netAPY: 3.2,
        })
        setLoading(false)
      }, 1000)
    } catch (error) {
      console.error('Error fetching user data:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="loading-spinner"></div>
        <span className="ml-3 text-gray-600">Loading dashboard...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <PortfolioOverview userObligation={userObligation} />
      
      {/* Health Factor */}
      <HealthFactor healthFactor={userObligation?.healthFactor} />
      
      {/* Market Overview */}
      <MarketList />
      
      {/* Transaction History */}
      <TransactionHistory />
    </div>
  )
}