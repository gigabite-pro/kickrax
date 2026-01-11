import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ExternalLink, Loader2, Zap, Tag, Check } from 'lucide-react';
import Header from '../components/Header';
import { CatalogProduct } from '../types';

interface SizeData {
  size: string;
  price: number;
  priceCAD: number;
  url?: string;
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

type SourceKey = 'stockx' | 'goat' | 'kickscrew' | 'flightclub' | 'stadiumgoods';

interface SourceState {
  loading: boolean;
  data: SourceResult | null;
  error: boolean;
  duration?: number;
}

const SOURCES: SourceKey[] = ['stockx', 'goat', 'kickscrew', 'flightclub', 'stadiumgoods'];
const SKU_SOURCES: SourceKey[] = ['goat', 'kickscrew', 'flightclub', 'stadiumgoods'];

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
  
  // Track each source's state independently
  const [sourceStates, setSourceStates] = useState<Record<SourceKey, SourceState>>({
    stockx: { loading: false, data: null, error: false },
    goat: { loading: false, data: null, error: false },
    kickscrew: { loading: false, data: null, error: false },
    flightclub: { loading: false, data: null, error: false },
    stadiumgoods: { loading: false, data: null, error: false },
  });
  
  const [styleId, setStyleId] = useState<string | null>(null);
  const [styleIdLoading, setStyleIdLoading] = useState(true);
  const [styleIdError, setStyleIdError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // Fetch from a single source
  const fetchFromSource = useCallback(async (source: SourceKey, searchSku: string) => {
    setSourceStates(prev => ({
      ...prev,
      [source]: { loading: true, data: null, error: false }
    }));

    try {
      const response = await fetch(`/api/prices/${source}?sku=${encodeURIComponent(searchSku)}`);
      const result = await response.json();
      
      setSourceStates(prev => ({
        ...prev,
        [source]: { 
          loading: false, 
          data: result.data, 
          error: false,
          duration: result.duration 
        }
      }));
    } catch (err) {
      setSourceStates(prev => ({
        ...prev,
        [source]: { loading: false, data: null, error: true }
      }));
    }
  }, []);

  // Get style ID AND StockX prices from StockX
  useEffect(() => {
    async function fetchStyleIdAndPrices() {
      if (!product?.stockxUrl) {
        setStyleIdError('No product URL available');
        setStyleIdLoading(false);
        return;
      }
      
      // Mark StockX as loading
      setSourceStates(prev => ({
        ...prev,
        stockx: { loading: true, data: null, error: false }
      }));
      
      const startTime = Date.now();
      
      try {
        const response = await fetch(`/api/product/style?url=${encodeURIComponent(product.stockxUrl)}`);
        const data = await response.json();
        
        if (data.styleId) {
          setStyleId(data.styleId);
        } else {
          setStyleIdError('Could not find Style ID');
        }
        
        // Set StockX prices from the same response
        if (data.stockxPrices) {
          setSourceStates(prev => ({
            ...prev,
            stockx: { 
              loading: false, 
              data: {
                productName: data.stockxPrices.productName,
                productUrl: data.stockxPrices.productUrl || product.stockxUrl,
                imageUrl: data.stockxPrices.imageUrl,
                sizes: data.stockxPrices.sizes || [],
              }, 
              error: false,
              duration: Date.now() - startTime
            }
          }));
        } else {
          setSourceStates(prev => ({
            ...prev,
            stockx: { loading: false, data: null, error: true }
          }));
        }
      } catch (err) {
        console.error('Failed to get style ID:', err);
        setStyleIdError('Failed to get product Style ID');
        setSourceStates(prev => ({
          ...prev,
          stockx: { loading: false, data: null, error: true }
        }));
      } finally {
        setStyleIdLoading(false);
      }
    }
    
    fetchStyleIdAndPrices();
  }, [product?.stockxUrl]);

  // Fetch from other sources in parallel when we have a style ID
  useEffect(() => {
    if (!styleId) return;
    
    // Start fetching from SKU-based sources (StockX prices already fetched with style ID)
    SKU_SOURCES.forEach(source => {
      fetchFromSource(source, styleId);
    });
  }, [styleId, fetchFromSource]);

  // Check if any source is still loading
  const isAnyLoading = SOURCES.some(s => sourceStates[s].loading);
  const hasAnyData = SOURCES.some(s => sourceStates[s].data?.sizes?.length);

  // Get all unique sizes across all sources
  const getAllSizes = (): string[] => {
    const sizes = new Set<string>();
    
    SOURCES.forEach(source => {
      const sourceData = sourceStates[source].data;
      if (sourceData?.sizes) {
        sourceData.sizes.forEach(s => sizes.add(s.size));
      }
    });
    
    return Array.from(sizes).sort((a, b) => parseFloat(a) - parseFloat(b));
  };

  // Get price for a specific size from a source
  const getPriceForSize = (source: SourceKey, size: string): SizeData | null => {
    const sourceData = sourceStates[source].data;
    if (!sourceData?.sizes) return null;
    
    return sourceData.sizes.find(s => s.size === size) || null;
  };

  // Get best price for a size (only from loaded sources)
  const getBestPriceForSize = (size: string): { source: string; price: number } | null => {
    let best: { source: string; price: number } | null = null;
    
    SOURCES.forEach(source => {
      if (sourceStates[source].loading) return; // Skip loading sources
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
  const getSourceUrl = (source: SourceKey, size?: string): string => {
    const sourceData = sourceStates[source].data;
    
    // First try productUrl at top level (GOAT, KicksCrew)
    if (sourceData?.productUrl) {
      return sourceData.productUrl;
    }
    
    // Then try URL from size data (Flight Club, Stadium Goods)
    if (size && sourceData?.sizes) {
      const sizeData = sourceData.sizes.find(s => s.size === size);
      if (sizeData?.url) {
        return sizeData.url;
      }
    }
    
    // Fallback to first size's URL
    if (sourceData?.sizes?.length && sourceData.sizes[0]?.url) {
      return sourceData.sizes[0].url;
    }
    
    return sourceConfig[source]?.url || '#';
  };

  const allSizes = getAllSizes();

  return (
    <main className="min-h-screen pb-20 pattern-bg">
      <Header />
      
      <section className="pt-28 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Back button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-noir/60 hover:text-noir mb-8 transition-colors"
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
              <div className="bg-white rounded-3xl overflow-hidden border border-noir/5 shadow-lg">
                <div className="aspect-square bg-cotton-dark p-8">
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
                  <p className="text-cherry text-sm font-semibold mb-2 uppercase tracking-wide">
                    {product?.brand || 'Sneaker'}
                  </p>
                  <h1 className="text-noir font-display text-2xl md:text-3xl leading-tight mb-4">
                    {product?.name || 'Loading...'}
                  </h1>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-cotton-dark text-noir/70 text-sm font-mono px-3 py-1.5 rounded-full">
                      <Tag className="w-4 h-4" />
                      {styleId || sku || 'N/A'}
                    </div>
                    
                    {product?.stockxUrl && (
                      <a
                        href={product.stockxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 bg-cherry/10 text-cherry text-sm px-3 py-1.5 rounded-full hover:bg-cherry/20 transition-colors"
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
              <h2 className="text-2xl font-display mb-6 text-noir">
                COMPARE <span className="text-cherry">PRICES</span>
              </h2>

              {styleIdLoading ? (
                <div className="bg-white rounded-2xl p-12 flex flex-col items-center justify-center border border-noir/5 shadow-md">
                  <Loader2 className="w-12 h-12 text-cherry animate-spin mb-4" />
                  <p className="text-noir/60">Getting product info...</p>
                </div>
              ) : styleIdError ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-noir/5 shadow-md">
                  <p className="text-cherry mb-4">{styleIdError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-cherry text-cotton rounded-lg hover:bg-cherry-light transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {/* Source Status Cards - Always visible */}
                  <div className="bg-white rounded-2xl p-6 mb-6 border border-noir/5 shadow-md">
                    <h3 className="text-lg font-display mb-4 text-noir">FETCHING PRICES</h3>
                    <div className="space-y-3">
                      {SOURCES.map((source) => {
                        const state = sourceStates[source];
                        const config = sourceConfig[source];
                        const sizesCount = state.data?.sizes?.length || 0;
                        
                        return (
                          <motion.div 
                            key={source} 
                            className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                              state.loading 
                                ? 'bg-cotton border border-noir/10' 
                                : state.data?.sizes?.length 
                                  ? 'bg-green-50 border border-green-200' 
                                  : 'bg-cotton-dark/50 border border-noir/5'
                            }`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${config.color}`} />
                              <span className="text-noir font-medium">{config.name}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {state.loading ? (
                                <>
                                  <Loader2 className="w-4 h-4 text-cherry animate-spin" />
                                  <span className="text-noir/40 text-sm">Fetching...</span>
                                </>
                              ) : state.error ? (
                                <span className="text-cherry text-sm">Failed</span>
                              ) : sizesCount > 0 ? (
                                <>
                                  <Check className="w-4 h-4 text-green-600" />
                                  <span className="text-green-600 text-sm font-medium">
                                    {sizesCount} sizes
                                  </span>
                                  {state.duration && (
                                    <span className="text-noir/40 text-xs">
                                      ({(state.duration / 1000).toFixed(1)}s)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-noir/40 text-sm">No sizes found</span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Size Selector - Shows as sizes come in */}
                  {hasAnyData && (
                    <motion.div 
                      className="bg-white rounded-2xl p-6 mb-6 border border-noir/5 shadow-md"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <p className="text-noir/60 text-sm mb-4">
                        Select your size {isAnyLoading && <span className="text-noir/40">(more sizes loading...)</span>}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {allSizes.map((size) => {
                          const best = getBestPriceForSize(size);
                          const isSelected = selectedSize === size;
                          
                          return (
                            <motion.button
                              key={size}
                              onClick={() => setSelectedSize(isSelected ? null : size)}
                              className={`relative px-4 py-3 rounded-xl border transition-all ${
                                isSelected
                                  ? 'bg-cherry text-cotton border-cherry'
                                  : 'bg-cotton text-noir border-noir/10 hover:border-noir/30'
                              }`}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              layout
                            >
                              <span className="font-medium">{size}</span>
                              {best && (
                                <span className={`block text-xs mt-0.5 ${isSelected ? 'text-cotton/80' : 'text-noir/40'}`}>
                                  {formatPrice(best.price)}
                                </span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

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
                        <p className="text-noir/60 text-sm mb-4">
                          Prices for size <span className="text-noir font-semibold">{selectedSize}</span>:
                        </p>
                        
                        {SOURCES.map((source) => {
                          const state = sourceStates[source];
                          const sizeData = getPriceForSize(source, selectedSize);
                          const config = sourceConfig[source];
                          const best = getBestPriceForSize(selectedSize);
                          const isBest = best?.source === source;
                          const url = getSourceUrl(source, selectedSize);
                          
                          return (
                            <motion.div
                              key={source}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                                state.loading
                                  ? 'bg-white border border-noir/10'
                                  : sizeData
                                    ? isBest
                                      ? 'bg-green-50 border border-green-200'
                                      : 'bg-white border border-noir/5'
                                    : 'bg-white/50 border border-noir/5 opacity-50'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-3 h-3 rounded-full ${config.color}`} />
                                <span className="text-noir font-medium">{config.name}</span>
                                {isBest && sizeData && !state.loading && (
                                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <Zap className="w-3 h-3" />
                                    Best Price
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {state.loading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 text-cherry animate-spin" />
                                    <span className="text-noir/40 text-sm">Loading...</span>
                                  </>
                                ) : sizeData ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 group"
                                  >
                                    <span className="font-mono font-bold text-lg text-noir">
                                      {formatPrice(sizeData.priceCAD || sizeData.price)}
                                    </span>
                                    <ExternalLink className="w-4 h-4 text-noir/40 group-hover:text-cherry transition-colors" />
                                  </a>
                                ) : (
                                  <span className="text-noir/40 text-sm">Not available</span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    ) : hasAnyData ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white rounded-2xl p-8 text-center border border-noir/5 shadow-md"
                      >
                        <p className="text-noir/60">Select a size above to compare prices</p>
                      </motion.div>
                    ) : !isAnyLoading ? (
                      <div className="bg-white rounded-2xl p-8 text-center border border-noir/5 shadow-md">
                        <p className="text-noir/60">No sizes available from any source.</p>
                      </div>
                    ) : null}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}

