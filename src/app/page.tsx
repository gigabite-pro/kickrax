'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import SearchBar from '@/components/SearchBar';
import SneakerCard from '@/components/SneakerCard';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import { AggregatedSneaker } from '@/types';
import { motion } from 'framer-motion';
import { Clock, Filter, RefreshCw, Zap, ShieldCheck } from 'lucide-react';

export default function Home() {
  const [results, setResults] = useState<AggregatedSneaker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'lowest' | 'highest' | 'listings'>('lowest');
  const [dataSource, setDataSource] = useState<string>('');

  const handleSearch = useCallback(async (query: string, forceRefresh: boolean = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setHasSearched(true);
    setCurrentQuery(query);
    setError(null);

    try {
      const url = forceRefresh 
        ? `/api/search?q=${encodeURIComponent(query)}&refresh=true`
        : `/api/search?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data.aggregated || []);
      setDataSource(data.meta?.source || 'live');
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (currentQuery) {
      handleSearch(currentQuery, true);
    }
  }, [currentQuery, handleSearch]);

  const sortedResults = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'highest':
        return b.lowestPrice - a.lowestPrice;
      case 'listings':
        return b.listings.length - a.listings.length;
      case 'lowest':
      default:
        return a.lowestPrice - b.lowestPrice;
    }
  });

  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-6xl md:text-8xl lg:text-9xl mb-6 leading-none"
          >
            COMPARE <span className="gradient-text">SNEAKER</span>
            <br />
            PRICES ACROSS <span className="text-accent-fire">CANADA</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-drip-silver text-xl max-w-2xl mx-auto mb-12"
          >
            Stop overpaying for sneakers. We scan verified resellers like StockX, GOAT, Flight Club, and Canadian stores to find you the best deals.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SearchBar onSearch={(q) => handleSearch(q, false)} isLoading={isLoading} />
          </motion.div>
        </div>
      </section>

      {/* Results Section */}
      <section className="px-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-drip-silver">
                  <Clock className="w-5 h-5 animate-pulse" />
                  <span>Scanning verified resellers...</span>
                </div>
              </div>
              <LoadingSkeleton />
            </div>
          ) : hasSearched ? (
            results.length > 0 ? (
              <div className="mt-8">
                {/* Results Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-display">
                      {results.length} RESULT{results.length !== 1 ? 'S' : ''} FOR &ldquo;{currentQuery.toUpperCase()}&rdquo;
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-drip-smoke text-sm">
                        Prices shown in CAD
                      </p>
                      {dataSource && (
                        <span className="flex items-center gap-1 text-xs text-drip-smoke bg-drip-charcoal px-2 py-1 rounded-full">
                          {dataSource === 'cache' ? (
                            <Zap className="w-3 h-3 text-accent-gold" />
                          ) : (
                            <ShieldCheck className="w-3 h-3 text-accent-mint" />
                          )}
                          {dataSource === 'cache' ? 'Cached (< 1 min)' : 'Live'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Controls */}
                  <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="flex items-center gap-2 bg-drip-charcoal hover:bg-drip-graphite border border-drip-graphite hover:border-drip-smoke px-4 py-2 rounded-lg text-sm text-drip-white transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
                    </button>
                    
                    {/* Sort Options */}
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-drip-smoke" />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="bg-drip-charcoal border border-drip-graphite rounded-lg px-3 py-2 text-sm text-drip-white focus:border-accent-fire/50 transition-colors"
                      >
                        <option value="lowest">Lowest Price</option>
                        <option value="highest">Highest Price</option>
                        <option value="listings">Most Listings</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Results Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedResults.map((sneaker, index) => (
                    <SneakerCard key={sneaker.id} sneaker={sneaker} index={index} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState type="no-results" query={currentQuery} />
            )
          ) : (
            <EmptyState type="initial" />
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 p-4 bg-accent-fire/10 border border-accent-fire/30 rounded-xl text-center"
            >
              <p className="text-accent-fire">{error}</p>
            </motion.div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      {!hasSearched && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-20 px-6"
        >
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: '10+', label: 'Verified Resellers' },
                { value: '🇨🇦', label: 'Canada Focused' },
                { value: 'CAD', label: 'Local Pricing' },
                { value: '100%', label: 'Authenticated' },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="glass rounded-xl p-6 text-center"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="text-3xl md:text-4xl font-display text-accent-fire mb-2">
                    {stat.value}
                  </div>
                  <div className="text-drip-smoke text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      )}
    </main>
  );
}
