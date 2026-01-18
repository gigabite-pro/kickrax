import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CatalogProduct } from '../types';
import { api } from '../lib/api';

interface TrendingMeta {
  total: number;
  timestamp: string;
  cached: boolean;
  cachedAt?: string;
  expiresAt?: string;
}

interface TrendingContextType {
  trending: CatalogProduct[];
  trendingLoading: boolean;
  trendingMeta: TrendingMeta | null;
  fetchTrending: () => Promise<void>;
  refreshTrending: () => Promise<void>;
}

const TrendingContext = createContext<TrendingContextType | null>(null);

// Module-level cache to persist across StrictMode remounts and navigation
let cachedTrending: CatalogProduct[] | null = null;
let cachedMeta: TrendingMeta | null = null;
let isFetching = false;

export function TrendingProvider({ children }: { children: ReactNode }) {
  const [trending, setTrending] = useState<CatalogProduct[]>(cachedTrending || []);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingMeta, setTrendingMeta] = useState<TrendingMeta | null>(cachedMeta);

  const fetchTrending = useCallback(async (forceRefresh = false) => {
    // If we already have cached data and not forcing refresh, use it
    if (!forceRefresh && cachedTrending && cachedTrending.length > 0) {
      console.log('[TrendingContext] Using cached trending data, count:', cachedTrending.length);
      setTrending(cachedTrending);
      setTrendingMeta(cachedMeta);
      return;
    }
    
    // Prevent duplicate fetches
    if (isFetching) {
      console.log('[TrendingContext] Already fetching, skipping...');
      return;
    }
    isFetching = true;

    const endpoint = forceRefresh ? '/api/trending?refresh=true' : '/api/trending';
    console.log(`[TrendingContext] Fetching trending data... (refresh=${forceRefresh})`);
    setTrendingLoading(true);
    
    try {
      const response = await fetch(api(endpoint));
      if (!response.ok) {
        throw new Error(`Failed to fetch trending: ${response.status}`);
      }
      const data = await response.json();
      console.log('[TrendingContext] Fetched trending products:', data.products?.length || 0);
      
      const products = data.products || [];
      const meta: TrendingMeta = data.meta || {
        total: products.length,
        timestamp: new Date().toISOString(),
        cached: false,
      };
      
      // Update module-level cache
      cachedTrending = products;
      cachedMeta = meta;
      
      // Update state
      setTrending(products);
      setTrendingMeta(meta);
    } catch (err) {
      console.error('Trending fetch error:', err);
      // Don't clear existing data on error
    } finally {
      setTrendingLoading(false);
      isFetching = false;
    }
  }, []);

  const refreshTrending = useCallback(async () => {
    // Clear cache and force refresh
    cachedTrending = null;
    cachedMeta = null;
    await fetchTrending(true);
  }, [fetchTrending]);

  return (
    <TrendingContext.Provider value={{ 
      trending, 
      trendingLoading, 
      trendingMeta,
      fetchTrending: () => fetchTrending(false),
      refreshTrending,
    }}>
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
