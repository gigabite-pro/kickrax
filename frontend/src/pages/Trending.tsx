import { useEffect } from 'react';
import Header from '../components/Header';
import { motion } from 'framer-motion';
import { TrendingUp, ExternalLink, Flame, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTrending } from '../context/TrendingContext';

// Brand emoji mapping for visual flair
function getBrandEmoji(brand: string, name: string): string {
  const lowerName = name.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  
  if (lowerName.includes('chicago') || lowerName.includes('bred')) return '🔴';
  if (lowerName.includes('panda') || lowerName.includes('white black')) return '🐼';
  if (lowerName.includes('onyx') || lowerName.includes('black')) return '⚫';
  if (lowerName.includes('green') || lowerName.includes('pine')) return '🟢';
  if (lowerName.includes('thunder') || lowerName.includes('lightning')) return '⚡';
  if (lowerName.includes('white') || lowerName.includes('sail')) return '⚪';
  if (lowerName.includes('cherry') || lowerName.includes('red')) return '🍒';
  if (lowerName.includes('blue') || lowerName.includes('unc')) return '🔵';
  if (lowerName.includes('fire') || lowerName.includes('infrared')) return '🔥';
  if (lowerBrand.includes('jordan')) return '🏀';
  if (lowerBrand.includes('nike') || lowerBrand.includes('dunk')) return '✔️';
  if (lowerBrand.includes('adidas') || lowerBrand.includes('yeezy')) return '🔲';
  if (lowerBrand.includes('new balance')) return '🇺🇸';
  return '👟';
}

// Format price for display
function formatPrice(price: number | null | undefined): string {
  if (!price || price === 0) return 'N/A';
  return `$${price.toLocaleString()}`;
}

export default function Trending() {
  const { trending, trendingLoading, trendingMeta, fetchTrending, refreshTrending } = useTrending();

  // Fetch trending on mount if not cached
  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  const formatCacheTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Flame className="w-10 h-10 text-accent-fire" />
              <h1 className="font-display text-6xl md:text-7xl">
                TRENDING
              </h1>
            </div>
            <p className="text-drip-silver text-xl max-w-2xl mx-auto">
              The most active sneakers on StockX right now
            </p>
            
            {/* Cache info and refresh button */}
            {trendingMeta && (
              <div className="flex items-center justify-center gap-4 mt-4 text-drip-smoke text-sm">
                {trendingMeta.cached && trendingMeta.cachedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Cached at {formatCacheTime(trendingMeta.cachedAt)}
                  </span>
                )}
                <button
                  onClick={refreshTrending}
                  disabled={trendingLoading}
                  className="flex items-center gap-1 text-accent-mint hover:text-accent-mint/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${trendingLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            )}
          </motion.div>

          {/* Loading state */}
          {trendingLoading && trending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-accent-fire animate-spin" />
              <p className="text-drip-silver">Fetching trending sneakers...</p>
            </div>
          )}

          {/* Empty state */}
          {!trendingLoading && trending.length === 0 && (
            <div className="text-center py-20">
              <p className="text-drip-smoke text-lg mb-4">No trending data available</p>
              <button
                onClick={refreshTrending}
                className="inline-flex items-center gap-2 bg-accent-fire hover:bg-accent-fire/90 text-drip-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Load Trending
              </button>
            </div>
          )}

          {/* Trending list */}
          <div className="space-y-4">
            {trending.slice(0, 20).map((sneaker, index) => (
              <motion.div
                key={sneaker.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  to={`/product?url=${encodeURIComponent(sneaker.stockxUrl)}`}
                  className="glass rounded-xl p-4 flex items-center gap-4 hover:bg-drip-charcoal/80 transition-colors group block"
                >
                  {/* Product image */}
                  <div className="w-20 h-20 flex-shrink-0 bg-drip-graphite/30 rounded-lg overflow-hidden">
                    {sneaker.imageUrl ? (
                      <img
                        src={sneaker.imageUrl}
                        alt={sneaker.name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-4xl flex items-center justify-center h-full">
                        {getBrandEmoji(sneaker.brand, sneaker.name)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-drip-smoke text-sm">{sneaker.brand}</span>
                      {sneaker.sku && (
                        <>
                          <span className="text-drip-graphite">•</span>
                          <span className="text-drip-smoke text-xs font-mono truncate">{sneaker.sku}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-drip-white font-semibold text-lg group-hover:text-accent-fire transition-colors line-clamp-2">
                      {sneaker.name}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-drip-smoke text-xs">Lowest Ask</p>
                      <p className="text-accent-mint font-display text-2xl">
                        {formatPrice(sneaker.stockxLowestAsk)}
                      </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-drip-smoke group-hover:text-drip-white transition-colors" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="mt-12 text-center"
          >
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent-fire hover:bg-accent-fire/90 text-drip-white font-semibold px-8 py-4 rounded-xl transition-colors"
            >
              <TrendingUp className="w-5 h-5" />
              Search All Sneakers
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
