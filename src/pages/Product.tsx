import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ExternalLink, Loader2, Zap, Tag } from 'lucide-react';
import Header from '../components/Header';
import { CatalogProduct, SOURCES } from '../types';

interface SizeData {
  size: string;
  price: number;
  priceCAD: number;
}

interface SourceResult {
  productName?: string;
  productUrl?: string;
  imageUrl?: string;
  sizes: SizeData[];
  source?: {
    name: string;
    slug: string;
  };
  lowestPrice?: number;
  available?: boolean;
}

interface PriceData {
  sku: string;
  goat: SourceResult | null;
  kickscrew: SourceResult | null;
  flightclub: SourceResult | null;
  stadiumgoods: SourceResult | null;
}

const sourceConfig: Record<string, { name: string; color: string; url: string }> = {
  goat: { name: 'GOAT', color: 'bg-purple-500', url: 'https://goat.com' },
  kickscrew: { name: 'KicksCrew', color: 'bg-blue-500', url: 'https://kickscrew.com' },
  flightclub: { name: 'Flight Club', color: 'bg-orange-500', url: 'https://flightclub.com' },
  stadiumgoods: { name: 'Stadium Goods', color: 'bg-green-500', url: 'https://stadiumgoods.com' },
  stockx: { name: 'StockX', color: 'bg-emerald-500', url: 'https://stockx.com' },
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export default function Product() {
  const { sku } = useParams<{ sku: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const product = (location.state as { product?: CatalogProduct })?.product;
  
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);

  // Get style ID from StockX if we have the product
  useEffect(() => {
    async function fetchStyleId() {
      if (!product?.stockxUrl) {
        setError('No product URL available');
        setIsLoading(false);
        return;
      }
      
      try {
        const response = await fetch(`/api/product/style?url=${encodeURIComponent(product.stockxUrl)}`);
        const data = await response.json();
        if (data.styleId) {
          setStyleId(data.styleId);
        } else {
          setError('Could not find Style ID');
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to get style ID:', err);
        setError('Failed to get product Style ID');
        setIsLoading(false);
      }
    }
    
    fetchStyleId();
  }, [product?.stockxUrl]);

  // Fetch prices ONLY when we have a valid style ID
  useEffect(() => {
    async function fetchPrices() {
      // Only fetch if we have a real style ID
      if (!styleId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/goat/prices?sku=${encodeURIComponent(styleId)}`);
        const data = await response.json();
        setPriceData(data);
      } catch (err) {
        console.error('Failed to fetch prices:', err);
        setError('Failed to load prices. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrices();
  }, [styleId]);

  // Get all unique sizes across all sources
  const getAllSizes = (): string[] => {
    if (!priceData) return [];
    
    const sizes = new Set<string>();
    
    const sources = ['goat', 'kickscrew', 'flightclub', 'stadiumgoods'] as const;
    sources.forEach(source => {
      const sourceData = priceData[source];
      if (sourceData?.sizes) {
        sourceData.sizes.forEach(s => sizes.add(s.size));
      }
    });
    
    return Array.from(sizes).sort((a, b) => parseFloat(a) - parseFloat(b));
  };

  // Get price for a specific size from a source
  const getPriceForSize = (source: string, size: string): SizeData | null => {
    if (!priceData) return null;
    
    const sourceData = priceData[source as keyof PriceData] as SourceResult | null;
    if (!sourceData?.sizes) return null;
    
    return sourceData.sizes.find(s => s.size === size) || null;
  };

  // Get best price for a size
  const getBestPriceForSize = (size: string): { source: string; price: number } | null => {
    const sources = ['goat', 'kickscrew', 'flightclub', 'stadiumgoods'];
    let best: { source: string; price: number } | null = null;
    
    sources.forEach(source => {
      const sizeData = getPriceForSize(source, size);
      if (sizeData) {
        const price = sizeData.priceCAD || sizeData.price;
        if (!best || price < best.price) {
          best = { source, price };
        }
      }
    });
    
    return best;
  };

  // Get source URL for a size
  const getSourceUrl = (source: string): string => {
    if (!priceData) return '#';
    const sourceData = priceData[source as keyof PriceData] as SourceResult | null;
    return sourceData?.productUrl || sourceConfig[source]?.url || '#';
  };

  const allSizes = getAllSizes();

  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      <section className="pt-28 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Back button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-drip-silver hover:text-drip-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to search
          </motion.button>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Left: Product Image & Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="glass rounded-3xl overflow-hidden">
                <div className="aspect-square bg-gradient-to-br from-drip-charcoal via-drip-graphite to-drip-charcoal p-8">
                  {product?.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-9xl opacity-30">👟</span>
                    </div>
                  )}
                </div>
                
                <div className="p-6">
                  <p className="text-accent-fire text-sm font-medium mb-2 uppercase tracking-wide">
                    {product?.brand || 'Sneaker'}
                  </p>
                  <h1 className="text-drip-white font-display text-2xl md:text-3xl leading-tight mb-4">
                    {product?.name || 'Loading...'}
                  </h1>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-drip-charcoal text-drip-silver text-sm font-mono px-3 py-1.5 rounded-full">
                      <Tag className="w-4 h-4" />
                      {styleId || sku || 'N/A'}
                    </div>
                    
                    {product?.stockxUrl && (
                      <a
                        href={product.stockxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-sm px-3 py-1.5 rounded-full hover:bg-emerald-500/30 transition-colors"
                      >
                        StockX
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right: Price Comparison */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-2xl font-display mb-6">
                COMPARE <span className="gradient-text">PRICES</span>
              </h2>

              {isLoading ? (
                <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-accent-mint animate-spin mb-4" />
                  <p className="text-drip-silver">Fetching prices from all sources...</p>
                  <p className="text-drip-smoke text-sm mt-2">This may take up to 30 seconds</p>
                </div>
              ) : error ? (
                <div className="glass rounded-2xl p-8 text-center">
                  <p className="text-accent-fire mb-4">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-accent-fire text-white rounded-lg hover:bg-accent-fire/80 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : allSizes.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center">
                  <p className="text-drip-silver">No sizes available from any source.</p>
                </div>
              ) : (
                <>
                  {/* Size Selector */}
                  <div className="glass rounded-2xl p-6 mb-6">
                    <p className="text-drip-silver text-sm mb-4">Select your size:</p>
                    <div className="flex flex-wrap gap-2">
                      {allSizes.map((size) => {
                        const best = getBestPriceForSize(size);
                        const isSelected = selectedSize === size;
                        
                        return (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(isSelected ? null : size)}
                            className={`relative px-4 py-3 rounded-xl border transition-all ${
                              isSelected
                                ? 'bg-accent-fire text-white border-accent-fire'
                                : 'bg-drip-charcoal text-drip-silver border-drip-graphite hover:border-drip-smoke'
                            }`}
                          >
                            <span className="font-medium">{size}</span>
                            {best && (
                              <span className={`block text-xs mt-0.5 ${isSelected ? 'text-white/80' : 'text-drip-smoke'}`}>
                                {formatPrice(best.price)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Price Comparison Table */}
                  <AnimatePresence mode="wait">
                    {selectedSize ? (
                      <motion.div
                        key={selectedSize}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-3"
                      >
                        <p className="text-drip-silver text-sm mb-4">
                          Prices for size <span className="text-drip-white font-semibold">{selectedSize}</span>:
                        </p>
                        
                        {['goat', 'kickscrew', 'flightclub', 'stadiumgoods'].map((source) => {
                          const sizeData = getPriceForSize(source, selectedSize);
                          const config = sourceConfig[source];
                          const best = getBestPriceForSize(selectedSize);
                          const isBest = best?.source === source;
                          const url = getSourceUrl(source);
                          
                          return (
                            <a
                              key={source}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center justify-between p-4 rounded-xl transition-all group ${
                                sizeData
                                  ? isBest
                                    ? 'bg-accent-mint/10 border border-accent-mint/30 hover:bg-accent-mint/20'
                                    : 'glass hover:bg-drip-charcoal'
                                  : 'glass opacity-50 cursor-not-allowed'
                              }`}
                              onClick={(e) => !sizeData && e.preventDefault()}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-3 h-3 rounded-full ${config.color}`} />
                                <span className="text-drip-white font-medium">{config.name}</span>
                                {isBest && sizeData && (
                                  <span className="flex items-center gap-1 text-xs text-accent-mint bg-accent-mint/20 px-2 py-0.5 rounded-full">
                                    <Zap className="w-3 h-3" />
                                    Best Price
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {sizeData ? (
                                  <>
                                    <span className="font-mono font-bold text-lg text-drip-white">
                                      {formatPrice(sizeData.priceCAD || sizeData.price)}
                                    </span>
                                    <ExternalLink className="w-4 h-4 text-drip-smoke group-hover:text-drip-white transition-colors" />
                                  </>
                                ) : (
                                  <span className="text-drip-smoke text-sm">Not available</span>
                                )}
                              </div>
                            </a>
                          );
                        })}
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass rounded-2xl p-8 text-center"
                      >
                        <p className="text-drip-silver">Select a size above to compare prices</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* All Sources Overview */}
                  <div className="mt-8 glass rounded-2xl p-6">
                    <h3 className="text-lg font-display mb-4">ALL SOURCES</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {['goat', 'kickscrew', 'flightclub', 'stadiumgoods'].map((source) => {
                        const sourceData = priceData?.[source as keyof PriceData] as SourceResult | null;
                        const config = sourceConfig[source];
                        const sizesCount = sourceData?.sizes?.length || 0;
                        
                        return (
                          <div key={source} className="p-4 bg-drip-charcoal/50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-2 h-2 rounded-full ${config.color}`} />
                              <span className="text-drip-white font-medium text-sm">{config.name}</span>
                            </div>
                            <p className="text-drip-smoke text-xs">
                              {sizesCount > 0 ? `${sizesCount} sizes available` : 'No sizes found'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}

