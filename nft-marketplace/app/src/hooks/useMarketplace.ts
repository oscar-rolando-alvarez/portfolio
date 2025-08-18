'use client';

import { useContext } from 'react';
import { MarketplaceContext } from '../contexts/MarketplaceContext';

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace must be used within MarketplaceProvider');
  }
  return context;
}