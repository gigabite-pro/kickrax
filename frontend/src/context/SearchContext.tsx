import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CatalogProduct } from '../types';
import { api } from '../lib/api';

interface SearchContextType {
  results: CatalogProduct[];
  isLoading: boolean;
  hasSearched: boolean;
  currentQuery: string;
  error: string | null;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setIsLoading(true);
    setHasSearched(true);
    setCurrentQuery(query);
    setError(null);
    setResults([]);

    try {
      const response = await fetch(api(`/api/search?q=${encodeURIComponent(query)}`));

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      console.log('Search response:', data);
      setResults(data.products || []);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setResults([]);
    setHasSearched(false);
    setCurrentQuery('');
    setError(null);
  }, []);

  return (
    <SearchContext.Provider value={{ 
      results, 
      isLoading, 
      hasSearched, 
      currentQuery, 
      error, 
      search,
      clearSearch 
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
