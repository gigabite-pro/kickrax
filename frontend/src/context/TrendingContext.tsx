import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { CatalogProduct } from '../types';

interface TrendingContextType {
  trending: CatalogProduct[];
  trendingLoading: boolean;
  fetchTrending: () => Promise<void>;
}

const TrendingContext = createContext<TrendingContextType | null>(null);

export function TrendingProvider({ children }: { children: ReactNode }) {
  const [trending, setTrending] = useState<CatalogProduct[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const hasFetchedRef = useRef(false);

  const fetchTrending = useCallback(async () => {
    // Use ref to prevent duplicate fetches
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    setTrendingLoading(true);
    try {
      const response = await fetch("/api/trending");
      if (!response.ok) throw new Error("Failed to fetch trending");
      const data = await response.json();
      setTrending(data.products || []);
    } catch (err) {
      console.error("Trending fetch error:", err);
      hasFetchedRef.current = false; // Allow retry on error
    } finally {
      setTrendingLoading(false);
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


