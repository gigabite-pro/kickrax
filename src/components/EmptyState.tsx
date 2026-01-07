import { motion } from 'framer-motion';
import { Search, ShoppingBag, ShieldCheck } from 'lucide-react';

interface EmptyStateProps {
  type: 'initial' | 'no-results';
  query?: string;
}

export default function EmptyState({ type, query }: EmptyStateProps) {
  if (type === 'initial') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20"
      >
        <div className="relative inline-block mb-8">
          <motion.div
            animate={{ 
              rotate: [0, -10, 10, -10, 0],
              y: [0, -10, 0]
            }}
            transition={{ 
              duration: 4,
              repeat: Infinity,
              repeatType: 'reverse'
            }}
            className="text-8xl"
          >
            👟
          </motion.div>
          <div className="absolute -inset-8 bg-accent-fire/10 rounded-full blur-3xl -z-10" />
        </div>
        
        <h2 className="font-display text-4xl md:text-5xl mb-4">
          FIND YOUR <span className="gradient-text">GRAILS</span>
        </h2>
        
        <p className="text-drip-silver text-lg max-w-md mx-auto mb-8">
          Search any sneaker to compare prices across verified Canadian resellers
        </p>
        
        {/* Verified Resellers */}
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 text-drip-smoke text-sm mb-4">
            <ShieldCheck className="w-4 h-4 text-accent-mint" />
            <span>Verified Resellers Only</span>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-3 text-sm text-drip-smoke max-w-3xl mx-auto">
          {/* Major Platforms */}
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            StockX
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            GOAT
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            Flight Club
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Stadium Goods
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Grailed
          </div>
          {/* Canadian Retailers */}
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full border border-accent-fire/30">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            Livestock 🇨🇦
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full border border-accent-fire/30">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            Haven 🇨🇦
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full border border-accent-fire/30">
            <span className="w-2 h-2 rounded-full bg-pink-500" />
            Capsule 🇨🇦
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full border border-accent-fire/30">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Exclucity 🇨🇦
          </div>
          <div className="flex items-center gap-2 bg-drip-charcoal px-4 py-2 rounded-full border border-accent-fire/30">
            <span className="w-2 h-2 rounded-full bg-lime-500" />
            NRML 🇨🇦
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-20"
    >
      <div className="relative inline-block mb-8">
        <ShoppingBag className="w-20 h-20 text-drip-graphite" />
        <Search className="w-8 h-8 text-drip-smoke absolute -bottom-2 -right-2" />
      </div>
      
      <h2 className="font-display text-3xl md:text-4xl mb-4 text-drip-silver">
        NO SNEAKERS FOUND
      </h2>
      
      <p className="text-drip-smoke text-lg max-w-md mx-auto">
        We couldn&apos;t find any listings for &ldquo;<span className="text-drip-white">{query}</span>&rdquo; from verified resellers.
      </p>
      
      <div className="mt-8 text-sm text-drip-smoke">
        <p>Tips:</p>
        <ul className="mt-2 space-y-1">
          <li>• Try using the full sneaker name</li>
          <li>• Include the colorway or style code</li>
          <li>• Search for popular models like &ldquo;Jordan 1&rdquo; or &ldquo;Dunk Low&rdquo;</li>
        </ul>
      </div>
    </motion.div>
  );
}
