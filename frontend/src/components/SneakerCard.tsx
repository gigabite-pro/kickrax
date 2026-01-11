import { motion } from 'framer-motion';
import { ExternalLink, TrendingDown, TrendingUp, Minus, ShieldCheck } from 'lucide-react';
import { AggregatedSneaker, SneakerListing } from '../types';

interface SneakerCardProps {
  sneaker: AggregatedSneaker;
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

function getPriceIndicator(listing: SneakerListing, average: number) {
  const diff = ((listing.priceCAD - average) / average) * 100;
  
  if (diff < -10) {
    return { icon: TrendingDown, color: 'text-accent-mint', label: 'Great deal!' };
  } else if (diff > 10) {
    return { icon: TrendingUp, color: 'text-accent-fire', label: 'Above avg' };
  }
  return { icon: Minus, color: 'text-drip-silver', label: 'Fair price' };
}

const sourceColors: Record<string, string> = {
  stockx: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  goat: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  grailed: 'bg-red-500/20 text-red-400 border-red-500/30',
  'flight-club': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'stadium-goods': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  livestock: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  haven: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  capsule: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  exclucity: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  nrml: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
};

export default function SneakerCard({ sneaker, index }: SneakerCardProps) {
  const savings = sneaker.highestPrice - sneaker.lowestPrice;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden hover-lift group"
    >
      {/* Image Section */}
      <div className="relative aspect-square bg-gradient-to-br from-drip-charcoal to-drip-graphite p-6 overflow-hidden">
        {sneaker.imageUrl ? (
          <img
            src={sneaker.imageUrl}
            alt={sneaker.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">👟</span>
          </div>
        )}
        
        {/* Best Deal Badge */}
        {savings > 50 && (
          <div className="absolute top-4 left-4 bg-accent-mint text-drip-black text-xs font-bold px-3 py-1.5 rounded-full">
            Save up to {formatPrice(savings)}
          </div>
        )}
        
        {/* Verified Badge */}
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-drip-black/70 backdrop-blur-sm text-accent-mint text-xs font-mono px-2 py-1 rounded-full">
          <ShieldCheck className="w-3 h-3" />
          Verified
        </div>
        
        {/* Listings Count */}
        <div className="absolute bottom-4 right-4 bg-drip-black/70 backdrop-blur-sm text-drip-white text-xs font-mono px-3 py-1.5 rounded-full">
          {sneaker.listings.length} {sneaker.listings.length === 1 ? 'listing' : 'listings'}
        </div>
      </div>
      
      {/* Info Section */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-drip-silver text-sm font-medium">{sneaker.brand}</p>
            <h3 className="text-drip-white font-semibold text-lg leading-tight line-clamp-2">
              {sneaker.name}
            </h3>
          </div>
        </div>
        
        {sneaker.sku && (
          <p className="text-drip-smoke text-xs font-mono mb-3">{sneaker.sku}</p>
        )}
        
        {/* Price Range */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-display text-accent-mint">
              {formatPrice(sneaker.lowestPrice)}
            </span>
            <span className="text-drip-smoke text-sm">
              to {formatPrice(sneaker.highestPrice)}
            </span>
          </div>
          <div className="price-bar w-full opacity-60" />
        </div>
        
        {/* Listings by Source */}
        <div className="space-y-2">
          {sneaker.listings.slice(0, 4).map((listing, idx) => {
            const indicator = getPriceIndicator(listing, sneaker.averagePrice);
            const IconComponent = indicator.icon;
            
            return (
              <a
                key={`${listing.source.slug}-${idx}`}
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-drip-charcoal/50 hover:bg-drip-charcoal transition-colors group/listing"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-md border ${sourceColors[listing.source.slug] || 'bg-drip-graphite text-drip-silver border-drip-smoke'}`}>
                    {listing.source.name}
                  </span>
                  {listing.size && (
                    <span className="text-drip-smoke text-xs">Size {listing.size}</span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <IconComponent className={`w-4 h-4 ${indicator.color}`} />
                  <span className="font-mono font-semibold text-drip-white">
                    {formatPrice(listing.priceCAD)}
                  </span>
                  <ExternalLink className="w-4 h-4 text-drip-smoke group-hover/listing:text-drip-white transition-colors" />
                </div>
              </a>
            );
          })}
          
          {sneaker.listings.length > 4 && (
            <p className="text-center text-drip-smoke text-sm py-2">
              +{sneaker.listings.length - 4} more listings
            </p>
          )}
        </div>
        
        {/* Verified indicator */}
        <div className="mt-4 pt-4 border-t border-drip-graphite flex items-center justify-center gap-2 text-drip-smoke text-sm">
          <ShieldCheck className="w-4 h-4 text-accent-mint" />
          <span>All sellers are verified resellers</span>
        </div>
      </div>
    </motion.div>
  );
}
