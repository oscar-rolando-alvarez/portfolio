'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useProgram } from '../hooks/useProgram'
import toast from 'react-hot-toast'

const SUPPORTED_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', apy: '4.2%', icon: '💵' },
  { symbol: 'SOL', name: 'Solana', apy: '3.8%', icon: '◎' },
  { symbol: 'USDT', name: 'Tether', apy: '3.9%', icon: '💴' },
  { symbol: 'BTC', name: 'Bitcoin', apy: '2.1%', icon: '₿' },
]

export function LendingInterface() {
  const { connected } = useWallet()
  const { program } = useProgram()
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0])
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSupply = async () => {
    if (!connected || !program) {
      toast.error('Please connect your wallet')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      setLoading(true)
      
      // Mock transaction for demo
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      toast.success(`Successfully supplied ${amount} ${selectedToken.symbol}`)
      setAmount('')
    } catch (error) {
      console.error('Supply error:', error)
      toast.error('Failed to supply tokens')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Supply Form */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Supply Assets</h2>
        
        {/* Token Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Asset
          </label>
          <div className="grid grid-cols-2 gap-3">
            {SUPPORTED_TOKENS.map((token) => (
              <button
                key={token.symbol}
                onClick={() => setSelectedToken(token)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedToken.symbol === token.symbol
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{token.icon}</span>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">{token.symbol}</div>
                    <div className="text-sm text-gray-500">APY: {token.apy}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to Supply
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input-field pr-20"
              step="0.01"
              min="0"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
              {selectedToken.symbol}
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Balance: 0.00 {selectedToken.symbol}
          </div>
        </div>

        {/* Supply Button */}
        <button
          onClick={handleSupply}
          disabled={loading || !connected}
          className="btn-primary w-full py-3 text-lg"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="loading-spinner mr-2"></div>
              Supplying...
            </div>
          ) : (
            `Supply ${selectedToken.symbol}`
          )}
        </button>

        {/* Transaction Info */}
        {amount && parseFloat(amount) > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-800 mb-2">Transaction Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Supply Amount:</span>
                <span className="font-medium">{amount} {selectedToken.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Annual APY:</span>
                <span className="font-medium text-success-600">{selectedToken.apy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Daily Earnings:</span>
                <span className="font-medium">
                  {(parseFloat(amount) * parseFloat(selectedToken.apy.replace('%', '')) / 100 / 365).toFixed(4)} {selectedToken.symbol}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Your Supplies */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Your Supplies</h3>
        
        <div className="space-y-3">
          {/* Mock supply data */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">💵</span>
              <div>
                <div className="font-semibold">USDC</div>
                <div className="text-sm text-gray-500">USD Coin</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">1,000.00 USDC</div>
              <div className="text-sm text-success-600">+42.00 earned</div>
            </div>
            <button className="btn-secondary">Withdraw</button>
          </div>

          <div className="text-center py-8 text-gray-500">
            <span className="text-4xl block mb-2">📭</span>
            No supplies yet. Start earning by supplying assets above.
          </div>
        </div>
      </div>
    </div>
  )
}