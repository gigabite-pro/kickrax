import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { CatalogProduct } from '../types';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface StockXProductCardProps {
  product: CatalogProduct;
  index: number;
}

function StockXProductCard({ product, index }: StockXProductCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    // Navigate to product detail page with product data
    navigate(`/product/${encodeURIComponent(product.sku)}`, { 
      state: { product } 
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={handleClick}
      className="glass rounded-3xl overflow-hidden hover-lift group block cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gradient-to-br from-drip-charcoal via-drip-graphite to-drip-charcoal p-6 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 ease-out"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-7xl opacity-30">👟</span>
          </div>
        )}
        
        {/* Price badge */}
        {product.stockxLowestAsk > 0 && (
          <div className="absolute bottom-4 left-4 bg-accent-mint text-drip-black text-sm font-bold px-3 py-1.5 rounded-full">
            CA${product.stockxLowestAsk}
          </div>
        )}
        
        {/* Subtle overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-drip-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      
      {/* Info - Full name */}
      <div className="p-5">
        <p className="text-accent-fire text-xs font-medium mb-2 uppercase tracking-wide">{product.brand}</p>
        <h3 className="text-drip-white font-semibold text-sm leading-snug group-hover:text-accent-mint transition-colors">
          {product.name}
        </h3>
        {product.sku && (
          <p className="text-drip-smoke text-xs mt-2 font-mono">{product.sku}</p>
        )}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setHasSearched(true);
    setCurrentQuery(query);
    setError(null);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      console.log('Search response:', data);
      console.log('Products:', data.products);
      setResults(data.products || []);
      setDuration(data.meta?.duration || 0);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      {/* Hero */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-6xl md:text-8xl lg:text-9xl mb-6 leading-none"
          >
            SEARCH <span className="gradient-text">SNEAKERS</span>
            <br />
            ON <span className="text-accent-fire">STOCKX</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-drip-silver text-xl max-w-2xl mx-auto mb-12"
          >
            Search for any sneaker and see the top 20 listings from StockX.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </motion.div>
        </div>
      </section>

      {/* Results */}
      <section className="px-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="mt-8">
              <div className="flex items-center gap-2 text-drip-silver mb-6">
                <Clock className="w-5 h-5 animate-pulse" />
                <span>Searching StockX...</span>
              </div>
              <LoadingSkeleton />
            </div>
          ) : hasSearched ? (
            results.length > 0 ? (
              <div className="mt-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-display">
                      {results.length} RESULTS FOR "{currentQuery.toUpperCase()}"
                    </h2>
                    <p className="text-drip-smoke text-sm mt-1">
                      From StockX • {duration}ms
                    </p>
                  </div>
                </div>
                
                {/* Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {results.map((product, index) => {
                    console.log('Rendering product:', product.name, product);
                    return (
                      <StockXProductCard key={product.id} product={product} index={index} />
                    );
                  })}
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
    </main>
  );
}
