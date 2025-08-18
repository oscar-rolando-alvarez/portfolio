'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useMarketplace } from '../hooks/useMarketplace';
import { Header } from '../components/layout/Header';
import { HeroSection } from '../components/home/HeroSection';
import { FeaturedNFTs } from '../components/home/FeaturedNFTs';
import { CategoryFilter } from '../components/filters/CategoryFilter';
import { NFTGrid } from '../components/nft/NFTGrid';
import { StatsOverview } from '../components/analytics/StatsOverview';
import { TrendingCollections } from '../components/collections/TrendingCollections';
import { RecentActivity } from '../components/activity/RecentActivity';
import { SearchBar } from '../components/search/SearchBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export default function HomePage() {
  const { connected } = useWallet();
  const { nfts, collections, loading, error, fetchNFTs } = useMarketplace();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    fetchNFTs();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-destructive mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/10">
      <Header />
      
      <main className="container mx-auto px-4 space-y-12">
        {/* Hero Section */}
        <HeroSection />
        
        {/* Stats Overview */}
        <StatsOverview />
        
        {/* Search and Filters */}
        <section className="space-y-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex-1 max-w-md">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search NFTs, collections, or creators..."
              />
            </div>
            <CategoryFilter
              selected={selectedCategory}
              onChange={setSelectedCategory}
            />
          </div>
        </section>
        
        {/* Featured NFTs */}
        <FeaturedNFTs nfts={nfts.slice(0, 8)} />
        
        {/* Trending Collections */}
        <TrendingCollections collections={collections.slice(0, 6)} />
        
        {/* All NFTs */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold">All NFTs</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {nfts.length} items
              </span>
            </div>
          </div>
          
          <NFTGrid
            nfts={nfts}
            searchQuery={searchQuery}
            categoryFilter={selectedCategory}
          />
        </section>
        
        {/* Recent Activity */}
        <RecentActivity />
      </main>
      
      <footer className="mt-24 border-t bg-muted/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">NFT Marketplace</h3>
              <p className="text-sm text-muted-foreground">
                The most advanced NFT marketplace on Solana with cutting-edge features.
              </p>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Marketplace</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/explore" className="hover:text-foreground">Explore</a></li>
                <li><a href="/collections" className="hover:text-foreground">Collections</a></li>
                <li><a href="/activity" className="hover:text-foreground">Activity</a></li>
                <li><a href="/stats" className="hover:text-foreground">Stats</a></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Create</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/create" className="hover:text-foreground">Mint NFT</a></li>
                <li><a href="/collections/create" className="hover:text-foreground">Create Collection</a></li>
                <li><a href="/candy-machine" className="hover:text-foreground">Candy Machine</a></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/docs" className="hover:text-foreground">Documentation</a></li>
                <li><a href="/api" className="hover:text-foreground">API</a></li>
                <li><a href="/help" className="hover:text-foreground">Help Center</a></li>
                <li><a href="/blog" className="hover:text-foreground">Blog</a></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; 2024 NFT Marketplace. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}