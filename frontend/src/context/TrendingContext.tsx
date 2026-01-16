import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CatalogProduct } from '../types';
import { api } from '../lib/api';

interface TrendingContextType {
  trending: CatalogProduct[];
  trendingLoading: boolean;
  fetchTrending: () => Promise<void>;
}

const TrendingContext = createContext<TrendingContextType | null>(null);

// Module-level cache to persist across StrictMode remounts and navigation
let cachedTrending: CatalogProduct[] | null = null;
let isFetching = false;

export function TrendingProvider({ children }: { children: ReactNode }) {
  const [trending, setTrending] = useState<CatalogProduct[]>(cachedTrending || []);
  const [trendingLoading, setTrendingLoading] = useState(false);

  const fetchTrending = useCallback(async () => {
    // If we already have cached data, use it
    if (cachedTrending && cachedTrending.length > 0) {
      console.log('[TrendingContext] Using cached trending data, count:', cachedTrending.length);
      setTrending(cachedTrending);
      return;
    }
    
    // Prevent duplicate fetches
    if (isFetching) {
      console.log('[TrendingContext] Already fetching, skipping...');
      return;
    }
    isFetching = true;

    console.log('[TrendingContext] Fetching trending data...');
    setTrendingLoading(true);
    try {
      const response = await fetch(api("/api/trending"));
      if (!response.ok) throw new Error("Failed to fetch trending");
      const data = await response.json();
      console.log('[TrendingContext] Fetched trending products:', data.products?.length || 0);
      const products = data.products || [];
      cachedTrending = products;
      setTrending(products);
    } catch (err) {
      console.error("Trending fetch error:", err);
    } finally {
      setTrendingLoading(false);
      isFetching = false;
    }
  }, []);

  return (
    <TrendingContext.Provider value={{ trending, trendingLoading, fetchTrending }}>
      {children}
    </TrendingContext.Provider>
  );
}

export function useTrending() {
  const context = useContext(TrendingContext);
  if (!context) {
    throw new Error('useTrending must be used within a TrendingProvider');
  }
  return context;
}


