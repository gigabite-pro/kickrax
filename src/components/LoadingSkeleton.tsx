'use client';

import { motion } from 'framer-motion';

export default function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-2xl overflow-hidden"
        >
          {/* Image skeleton */}
          <div className="aspect-square skeleton" />
          
          {/* Content skeleton */}
          <div className="p-5 space-y-4">
            {/* Brand */}
            <div className="skeleton h-4 w-20 rounded" />
            
            {/* Title */}
            <div className="space-y-2">
              <div className="skeleton h-6 w-full rounded" />
              <div className="skeleton h-6 w-3/4 rounded" />
            </div>
            
            {/* SKU */}
            <div className="skeleton h-3 w-24 rounded" />
            
            {/* Price */}
            <div className="skeleton h-8 w-32 rounded" />
            
            {/* Listings */}
            <div className="space-y-2">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}


