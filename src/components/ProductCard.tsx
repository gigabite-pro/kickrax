import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, ChevronDown, ChevronUp, ShieldCheck, Tag, Zap } from 'lucide-react';
import { ProductWithPrices, SourcePricing } from '../types';

interface ProductCardProps {
  product: ProductWithPrices;
  index: number;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

const sourceColors: Record<string, string> = {
  stockx: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  goat: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'flight-club': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'stadium-goods': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  grailed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function ProductCard({ product, index }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  
  const { product: catalogProduct, sources, lowestOverallPrice, bestDeal } = product;
  
  // Get all unique sizes across all sources
  const allSizes = Array.from(new Set(
    sources.flatMap(s => s.sizes.map(sz => sz.size))
  )).sort((a, b) => parseFloat(a) - parseFloat(b));

  // Get price for a specific size from a source
  const getPriceForSize = (source: SourcePricing, size: string) => {
    return source.sizes.find(s => s.size === size);
  };

  // Get best price for a specific size
  const getBestPriceForSize = (size: string) => {
    let best: { source: SourcePricing; price: number; url: string } | null = null;
    
    for (const source of sources) {
      const sizePrice = source.sizes.find(s => s.size === size);
      if (sizePrice && (!best || sizePrice.priceCAD < best.price)) {
        best = { source, price: sizePrice.priceCAD, url: sizePrice.url };
      }
    }
    
    return best;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden hover-lift group"
    >
      {/* Image Section */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-drip-charcoal to-drip-graphite p-6 overflow-hidden">
        {catalogProduct.imageUrl ? (
          <img
            src={catalogProduct.imageUrl}
            alt={catalogProduct.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">👟</span>
          </div>
        )}
        
        {/* Best Deal Badge */}
        {bestDeal && (
          <a
            href={bestDeal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 left-4 bg-accent-mint text-drip-black text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 hover:scale-105 transition-transform"
          >
            <Zap className="w-3 h-3" />
            Best: {formatPrice(bestDeal.price)} ({bestDeal.source.name})
          </a>
        )}
        
        {/* SKU Badge */}
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-drip-black/70 backdrop-blur-sm text-drip-silver text-xs font-mono px-2 py-1 rounded-full">
          <Tag className="w-3 h-3" />
          {catalogProduct.sku}
        </div>
        
        {/* Sources Count */}
        <div className="absolute bottom-4 right-4 bg-drip-black/70 backdrop-blur-sm text-drip-white text-xs font-mono px-3 py-1.5 rounded-full flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-accent-mint" />
          {sources.length} sources
        </div>
      </div>
      
      {/* Info Section */}
      <div className="p-5">
        <div className="mb-2">
          <p className="text-drip-silver text-sm font-medium">{catalogProduct.brand}</p>
          <h3 className="text-drip-white font-semibold text-lg leading-tight line-clamp-2">
            {catalogProduct.name}
          </h3>
          {catalogProduct.colorway && (
            <p className="text-drip-smoke text-xs mt-1">{catalogProduct.colorway}</p>
          )}
        </div>
        
        {/* Price Overview */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-display text-accent-mint">
              {formatPrice(lowestOverallPrice)}
            </span>
            <span className="text-drip-smoke text-sm">
              lowest across {sources.length} sites
            </span>
          </div>
          <div className="price-bar w-full opacity-60 mt-2" />
        </div>

        {/* Size Selector */}
        <div className="mb-4">
          <p className="text-drip-smoke text-xs mb-2">Select size to compare:</p>
          <div className="flex flex-wrap gap-1.5">
            {allSizes.slice(0, expanded ? undefined : 8).map((size) => {
              const bestForSize = getBestPriceForSize(size);
              const isSelected = selectedSize === size;
              
              return (
                <button
                  key={size}
                  onClick={() => setSelectedSize(isSelected ? null : size)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    isSelected 
                      ? 'bg-accent-fire text-white border-accent-fire' 
                      : 'bg-drip-charcoal text-drip-silver border-drip-graphite hover:border-drip-smoke'
                  }`}
                >
                  {size}
                  {bestForSize && (
                    <span className="ml-1 opacity-70">
                      {formatPrice(bestForSize.price)}
                    </span>
                  )}
                </button>
              );
            })}
            {allSizes.length > 8 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs px-2.5 py-1.5 text-accent-fire"
              >
                +{allSizes.length - 8} more
              </button>
            )}
          </div>
        </div>

        {/* Selected Size Comparison */}
        <AnimatePresence>
          {selectedSize && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 mb-4"
            >
              <p className="text-drip-smoke text-xs">
                Size {selectedSize} prices:
              </p>
              {sources.map((source) => {
                const sizePrice = getPriceForSize(source, selectedSize);
                if (!sizePrice) return null;
                
                const isBest = getBestPriceForSize(selectedSize)?.source === source;
                
                return (
                  <a
                    key={source.source.slug}
                    href={sizePrice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors group/link ${
                      isBest 
                        ? 'bg-accent-mint/10 border border-accent-mint/30' 
                        : 'bg-drip-charcoal/50 hover:bg-drip-charcoal'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-md border ${sourceColors[source.source.slug] || 'bg-drip-graphite text-drip-silver border-drip-smoke'}`}>
                        {source.source.name}
                      </span>
                      {isBest && (
                        <span className="text-xs text-accent-mint flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Best price
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-drip-white">
                        {formatPrice(sizePrice.priceCAD)}
                      </span>
                      <ExternalLink className="w-4 h-4 text-drip-smoke group-hover/link:text-drip-white transition-colors" />
                    </div>
                  </a>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Source Overview */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-drip-charcoal/30 hover:bg-drip-charcoal/50 transition-colors text-sm"
        >
          <span className="text-drip-silver">
            {expanded ? 'Hide' : 'Show'} all sources
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-drip-smoke" />
          ) : (
            <ChevronDown className="w-4 h-4 text-drip-smoke" />
          )}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2"
            >
              {sources.map((source) => (
                <div
                  key={source.source.slug}
                  className="p-3 rounded-xl bg-drip-charcoal/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-md border ${sourceColors[source.source.slug] || 'bg-drip-graphite text-drip-silver border-drip-smoke'}`}>
                      {source.source.name}
                    </span>
                    <span className="text-sm text-drip-silver">
                      from {formatPrice(source.lowestPrice)}
                    </span>
                  </div>
                  <div className="text-xs text-drip-smoke">
                    {source.sizes.length} sizes available
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

