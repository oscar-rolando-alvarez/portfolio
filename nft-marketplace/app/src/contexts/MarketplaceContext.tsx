'use client';

import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';

export interface NFT {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  image: string;
  price?: number;
  collection?: string;
  traits: Array<{ trait_type: string; value: string }>;
  rarityScore: number;
  rarityRank?: number;
  owner: string;
  listed: boolean;
  listingExpiry?: number;
}

export interface Collection {
  address: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  floorPrice: number;
  volume: number;
  totalSupply: number;
  verified: boolean;
}

interface MarketplaceContextType {
  nfts: NFT[];
  collections: Collection[];
  loading: boolean;
  error: string | null;
  fetchNFTs: () => Promise<void>;
  fetchCollections: () => Promise<void>;
  listNFT: (mint: string, price: number) => Promise<void>;
  buyNFT: (mint: string) => Promise<void>;
  makeOffer: (mint: string, amount: number) => Promise<void>;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Mock data for demonstration
      const mockNFTs: NFT[] = [
        {
          mint: '11111111111111111111111111111111',
          name: 'Cyber Punk #1234',
          symbol: 'CP',
          uri: 'https://example.com/metadata/1234',
          image: 'https://via.placeholder.com/400x400?text=NFT1',
          price: 1.5,
          collection: 'Cyber Punks',
          traits: [
            { trait_type: 'Background', value: 'Neon' },
            { trait_type: 'Eyes', value: 'Laser' },
            { trait_type: 'Rarity', value: 'Legendary' }
          ],
          rarityScore: 850,
          rarityRank: 123,
          owner: '22222222222222222222222222222222',
          listed: true,
          listingExpiry: Date.now() + 86400000
        },
        // Add more mock NFTs...
      ];
      
      setNfts(mockNFTs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch NFTs');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    try {
      const mockCollections: Collection[] = [
        {
          address: '33333333333333333333333333333333',
          name: 'Cyber Punks',
          symbol: 'CP',
          image: 'https://via.placeholder.com/200x200?text=Collection1',
          description: 'A collection of futuristic cyber punk characters',
          floorPrice: 1.2,
          volume: 1234.5,
          totalSupply: 10000,
          verified: true
        },
        // Add more mock collections...
      ];
      
      setCollections(mockCollections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch collections');
    }
  }, []);

  const listNFT = useCallback(async (mint: string, price: number) => {
    try {
      setLoading(true);
      // Implement listing logic here
      console.log(`Listing NFT ${mint} for ${price} SOL`);
      // Update local state
      setNfts(prev => prev.map(nft => 
        nft.mint === mint 
          ? { ...nft, listed: true, price }
          : nft
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list NFT');
    } finally {
      setLoading(false);
    }
  }, []);

  const buyNFT = useCallback(async (mint: string) => {
    try {
      setLoading(true);
      // Implement buying logic here
      console.log(`Buying NFT ${mint}`);
      // Update local state
      setNfts(prev => prev.map(nft => 
        nft.mint === mint 
          ? { ...nft, listed: false, price: undefined }
          : nft
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to buy NFT');
    } finally {
      setLoading(false);
    }
  }, []);

  const makeOffer = useCallback(async (mint: string, amount: number) => {
    try {
      setLoading(true);
      // Implement offer logic here
      console.log(`Making offer of ${amount} SOL on NFT ${mint}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make offer');
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    nfts,
    collections,
    loading,
    error,
    fetchNFTs,
    fetchCollections,
    listNFT,
    buyNFT,
    makeOffer,
  };

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (context === undefined) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return context;
}