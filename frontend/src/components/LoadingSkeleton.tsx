import { motion } from 'framer-motion';

export default function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          className="bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-noir/5"
        >
          {/* Image skeleton */}
          <div className="aspect-square skeleton" />
          
          {/* Content skeleton */}
          <div className="p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
            {/* Brand */}
            <div className="skeleton h-2.5 sm:h-3 w-10 sm:w-14 rounded" />
            
            {/* Title */}
            <div className="space-y-1 sm:space-y-1.5">
              <div className="skeleton h-3 sm:h-4 w-full rounded" />
              <div className="skeleton h-3 sm:h-4 w-3/4 rounded" />
            </div>
            
            {/* SKU */}
            <div className="skeleton h-2.5 sm:h-3 w-16 sm:w-20 rounded" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
