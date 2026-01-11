import { motion } from 'framer-motion';
import { Search, ShoppingBag } from 'lucide-react';

interface EmptyStateProps {
  type: 'initial' | 'no-results';
  query?: string;
}

export default function EmptyState({ type, query }: EmptyStateProps) {
  if (type === 'initial') {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-20"
    >
      <div className="relative inline-block mb-8">
        <ShoppingBag className="w-20 h-20 text-noir/20" />
        <Search className="w-8 h-8 text-noir/30 absolute -bottom-2 -right-2" />
      </div>
      
      <h2 className="font-display text-3xl md:text-4xl mb-4 text-noir/60">
        NO SNEAKERS FOUND
      </h2>
      
      <p className="text-noir/40 text-lg max-w-md mx-auto">
        We couldn&apos;t find any listings for &ldquo;<span className="text-noir">{query}</span>&rdquo; from verified resellers.
      </p>
      
      <div className="mt-8 text-sm text-noir/40">
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
