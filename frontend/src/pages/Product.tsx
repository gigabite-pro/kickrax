import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ExternalLink, Loader2, Zap, Tag, ChevronDown, ChevronUp, Check } from 'lucide-react';
import Header from '../components/Header';
import { CatalogProduct } from '../types';
import { api } from '../lib/api';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Check scroll position for indicators
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    setCanScrollUp(container.scrollTop > 0);
    setCanScrollDown(container.scrollTop < container.scrollHeight - container.clientHeight - 5);
  }, []);

  // Initialize scroll state when dropdown opens
  useEffect(() => {
    if (isDropdownOpen) {
      setTimeout(handleScroll, 50);
    }
  }, [isDropdownOpen, handleScroll]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // AbortController for canceling requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  // Cleanup on unmount - abort all pending requests
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isFetchingRef.current = false;
    };
  }, []);

  // Update page title for SEO
  useEffect(() => {
    if (product?.name) {
      document.title = `${product.name} | Compare Prices | KickRax`;
    }
    return () => {
      document.title = 'KickRax | Compare Sneaker Prices';
    };
  }, [product?.name]);

  // Stream all-prices via SSE: show each source as soon as it arrives (same structure, incremental UI).
  useEffect(() => {
    if (!product?.stockxUrl) {
      setStyleIdError('No product URL available');
      setStyleIdLoading(false);
      return;
    }

    // Prevent duplicate requests (React StrictMode in dev runs effects twice)
    if (isFetchingRef.current) {
      console.log('[Product] Already fetching, skipping duplicate request');
      return;
    }
    isFetchingRef.current = true;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const start = Date.now();

    setSourceStates(prev => ({
      ...prev,
      stockx: { loading: true, data: null, error: false },
      goat: { loading: true, data: null, error: false },
      kickscrew: { loading: true, data: null, error: false },
      flightclub: { loading: true, data: null, error: false },
      stadiumgoods: { loading: true, data: null, error: false },
    }));

    (async () => {
      try {
        const res = await fetch(api(`/api/product/all-prices?url=${encodeURIComponent(product.stockxUrl)}`), { signal });
        if (signal?.aborted) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || 'Failed to fetch prices');
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        let buf = '';
        const processEvent = (event: string, data: unknown) => {
          if (event === 'error') {
            setStyleIdError((data as { message?: string })?.message || 'Failed to load prices');
            SOURCES.forEach(s => {
              setSourceStates(prev => ({ ...prev, [s]: { loading: false, data: null, error: true } }));
            });
            setStyleIdLoading(false);
            return;
          }
          if (event === 'done') {
            setStyleIdLoading(false);
            return;
          }
          if (event !== 'update' || typeof data !== 'object' || !data) return;

          const d = data as Record<string, unknown>;
          const dur = Date.now() - start;

          if (d.styleId != null) {
            setStyleId(d.styleId as string);
            if (!d.styleId) setStyleIdError('Could not find Style ID');
          }
          if (d.stockx != null) {
            const sx = d.stockx as SourceResult | null;
            setSourceStates(prev => ({
              ...prev,
              stockx: {
                loading: false,
                data: sx ? {
                  productName: sx.productName,
                  productUrl: sx.productUrl || product!.stockxUrl!,
                  imageUrl: sx.imageUrl,
                  sizes: sx.sizes || [],
                } : null,
                error: !sx,
                duration: dur,
              },
            }));
            setStyleIdLoading(false);
          }
          (['goat', 'kickscrew', 'flightclub', 'stadiumgoods'] as const).forEach(source => {
            if (d[source] === undefined) return;
            const val = d[source] as SourceResult | null;
            setSourceStates(prev => ({
              ...prev,
              [source]: { loading: false, data: val, error: !val, duration: dur },
            }));
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            let event = 'update';
            let data: unknown = null;
            for (const line of part.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) {
                try { data = JSON.parse(line.slice(5).trim()); } catch { /* ignore */ }
              }
            }
            processEvent(event, data);
          }
        }
        if (!signal?.aborted) setStyleIdLoading(false);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('All-prices stream failed:', e);
        setStyleIdError('Failed to load prices');
        setSourceStates(prev => ({
          ...prev,
          stockx: { loading: false, data: null, error: true },
          goat: { loading: false, data: null, error: true },
          kickscrew: { loading: false, data: null, error: true },
          flightclub: { loading: false, data: null, error: true },
          stadiumgoods: { loading: false, data: null, error: true },
        }));
        setStyleIdLoading(false);
      } finally {
        isFetchingRef.current = false;
      }
    })();

    return () => { 
      abortControllerRef.current?.abort();
      isFetchingRef.current = false;
    };
  }, [product?.stockxUrl]);

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
    <main className="min-h-screen sm:h-screen sm:overflow-hidden pattern-bg">
      <Header />
      
      <section className="min-h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] pt-16 sm:pt-20 px-4 sm:px-6 pb-8 sm:pb-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {/* Back button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-noir/60 hover:text-noir mb-3 sm:mb-4 transition-colors text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            Back to search
          </motion.button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Left: Product Image & Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-noir/5 shadow-lg flex flex-col sm:flex-row lg:flex-col">
                <div className="w-full sm:w-1/3 lg:w-full aspect-[4/3] sm:aspect-square lg:aspect-[4/3] bg-cotton-dark flex-shrink-0 overflow-hidden relative">
                  {/* Use HD image from StockX if available, otherwise fall back to product image */}
                  {(sourceStates.stockx.data?.imageUrl || product?.imageUrl) ? (
                    <img
                      src={sourceStates.stockx.data?.imageUrl || product?.imageUrl}
                      alt={product?.name || 'Product'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-7xl opacity-30">👟</span>
                    </div>
                  )}
                  
                  {/* Loading overlay while fetching HD image */}
                  {sourceStates.stockx.loading && product?.imageUrl && (
                    <div className="absolute inset-0 bg-cotton-dark/40 backdrop-blur-[2px] flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-cherry animate-spin" />
                    </div>
                  )}
                </div>
                
                <div className="p-3 sm:p-5 flex-1">
                  <p className="text-cherry text-xs sm:text-sm font-bold mb-1 sm:mb-1.5 uppercase tracking-wider">
                    {product?.brand || 'Sneaker'}
                  </p>
                  <h1 className="text-noir font-bold text-sm sm:text-lg md:text-xl leading-snug mb-2 sm:mb-4 line-clamp-2 sm:line-clamp-none">
                    {product?.name || 'Loading...'}
                  </h1>
                  
                  <div className="inline-flex items-center gap-1 sm:gap-1.5 bg-cotton-dark text-noir/70 text-xs sm:text-sm font-mono px-2 sm:px-3 py-1 sm:py-1.5 rounded-full w-fit">
                    <Tag className="w-3 sm:w-4 h-3 sm:h-4" />
                    <span className="truncate max-w-[120px] sm:max-w-none">{styleId || sku || 'N/A'}</span>
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
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5 text-noir uppercase tracking-wide">
                Compare <span className="text-cherry">Prices</span>
              </h2>

              {styleIdLoading ? (
                <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center border border-noir/5 shadow-md">
                  <Loader2 className="w-10 sm:w-12 h-10 sm:h-12 text-cherry animate-spin mb-3 sm:mb-4" />
                  <p className="text-noir/60 text-sm sm:text-base">Getting product info...</p>
                  <p className="text-noir/40 text-xs sm:text-sm mt-1">This may take up to 40 seconds</p>
                </div>
              ) : styleIdError ? (
                <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center border border-noir/5 shadow-md">
                  <p className="text-cherry mb-3 sm:mb-4 text-sm sm:text-base">{styleIdError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-cherry text-cotton rounded-lg hover:bg-cherry-light transition-colors text-sm"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {/* Size Selector Dropdown */}
                  <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-5 mb-4 sm:mb-5 border border-noir/5 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
                      <p className="text-noir/60 text-xs sm:text-sm">Select your size:</p>
                      {isAnyLoading && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-noir/40 text-xs sm:text-sm">
                          <Loader2 className="w-3 sm:w-4 h-3 sm:h-4 animate-spin text-cherry" />
                          <span>Fetching prices...</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Custom Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`w-full flex items-center justify-between bg-cotton border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3.5 text-left transition-all ${
                          isDropdownOpen 
                            ? 'border-cherry ring-2 ring-cherry/20' 
                            : 'border-noir/10 hover:border-noir/30'
                        }`}
                      >
                        <span className={`font-semibold text-sm sm:text-base ${selectedSize ? 'text-noir' : 'text-noir/40'}`}>
                          {selectedSize 
                            ? `US ${selectedSize} — ${getBestPriceForSize(selectedSize) ? formatPrice(getBestPriceForSize(selectedSize)!.price) : ''}`
                            : 'Choose a size'
                          }
                        </span>
                        <ChevronDown className={`w-4 sm:w-5 h-4 sm:h-5 text-noir/40 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute z-50 w-full mt-2 bg-white border border-noir/10 rounded-xl shadow-xl overflow-hidden"
                          >
                            <div className="relative">
                              {/* Top scroll indicator */}
                              <AnimatePresence>
                                {canScrollUp && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute top-0 left-0 right-0 z-10 flex justify-center items-center h-10 bg-gradient-to-b from-white from-60% to-transparent pointer-events-none"
                                  >
                                    <ChevronUp className="w-5 h-5 text-noir/50" />
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div 
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="max-h-64 overflow-y-auto scrollbar-hide py-1" 
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                              >
                                {allSizes.length === 0 ? (
                                  <div className="px-4 py-3 text-noir/40 text-sm text-center">
                                    {isAnyLoading ? 'Loading sizes...' : 'No sizes available'}
                                  </div>
                                ) : (
                                  allSizes.map((size, index) => {
                                    const best = getBestPriceForSize(size);
                                    const isSelected = selectedSize === size;
                                    const isLast = index === allSizes.length - 1;
                                    
                                    return (
                                      <button
                                        key={size}
                                        type="button"
                                        onClick={() => {
                                          setSelectedSize(size);
                                          setIsDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                                          isSelected 
                                            ? 'bg-cherry/10 text-cherry' 
                                            : 'hover:bg-cotton text-noir'
                                        } ${!isLast ? 'border-b border-noir/5' : ''}`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="font-semibold">US {size}</span>
                                          {best && (
                                            <span className={`text-sm ${isSelected ? 'text-cherry/70' : 'text-noir/50'}`}>
                                              {formatPrice(best.price)}
                                            </span>
                                          )}
                                        </div>
                                        {isSelected && <Check className="w-4 h-4" />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>

                              {/* Bottom scroll indicator */}
                              <AnimatePresence>
                                {canScrollDown && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end h-10 bg-gradient-to-t from-white from-60% to-transparent pointer-events-none"
                                  >
                                    <ChevronDown className="w-5 h-5 text-noir/50 mb-1" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    
                    {!hasAnyData && !isAnyLoading && (
                      <p className="text-noir/40 text-sm mt-3">No sizes available yet</p>
                    )}
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
                        <p className="text-noir/60 text-sm mb-3">
                          Prices for size <span className="text-noir font-semibold">{selectedSize}</span>:
                        </p>
                        
                        {SOURCES.map((source, sourceIndex) => {
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
                              transition={{ delay: sourceIndex * 0.05 }}
                              className={`flex items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl transition-all ${
                                state.loading
                                  ? 'bg-white border border-noir/10'
                                  : sizeData
                                    ? isBest
                                      ? 'bg-green-50 border border-green-200'
                                      : 'bg-white border border-noir/5'
                                    : 'bg-white/50 border border-noir/5 opacity-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className={`w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full ${config.color}`} />
                                <span className="text-noir font-semibold text-xs sm:text-base">{config.name}</span>
                                {isBest && sizeData && !state.loading && (
                                  <span className="hidden sm:flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <Zap className="w-3 h-3" />
                                    Best
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 sm:gap-3">
                                {state.loading ? (
                                  <>
                                    <Loader2 className="w-3 sm:w-4 h-3 sm:h-4 text-cherry animate-spin" />
                                    <span className="text-noir/40 text-xs sm:text-sm">Loading...</span>
                                  </>
                                ) : sizeData ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 sm:gap-3 group"
                                  >
                                    <span className="font-bold text-sm sm:text-lg text-noir">
                                      {formatPrice(sizeData.priceCAD || sizeData.price)}
                                    </span>
                                    <ExternalLink className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-noir/50 group-hover:text-cherry transition-colors" />
                                  </a>
                                ) : (
                                  <span className="text-noir/40 text-xs sm:text-sm">Unavailable</span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
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

