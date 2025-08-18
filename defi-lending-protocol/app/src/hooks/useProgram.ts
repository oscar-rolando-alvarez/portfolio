'use client'

import { useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

// Import your IDL here (you would generate this from your Anchor program)
// import idl from '../idl/defi_lending_protocol.json'

// Mock IDL for demo purposes
const mockIdl = {
  version: "0.1.0",
  name: "defi_lending_protocol",
  instructions: [],
  accounts: [],
  types: []
}

const PROGRAM_ID = new PublicKey("DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT")

export function useProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null
    
    return new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    })
  }, [connection, wallet])

  const program = useMemo(() => {
    if (!provider) return null
    
    try {
      return new Program(mockIdl as Idl, PROGRAM_ID, provider)
    } catch (error) {
      console.error('Error creating program:', error)
      return null
    }
  }, [provider])

  return {
    program,
    provider,
    connection,
    programId: PROGRAM_ID,
  }
}