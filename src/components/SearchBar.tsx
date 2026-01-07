import { useState, useCallback } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export default function SearchBar({ onSearch, isLoading = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  }, [query, isLoading, onSearch]);

  const popularSearches = [
    'Jordan 1 Retro High OG',
    'Nike Dunk Low Panda',
    'Yeezy Boost 350',
    'New Balance 550',
    'Air Force 1 Low',
  ];

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <motion.div
          animate={{
            boxShadow: isFocused 
              ? '0 0 0 2px rgba(255, 77, 0, 0.5), 0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}
          className="relative rounded-2xl overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent-fire/20 via-transparent to-accent-mint/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search any sneaker... (e.g., Jordan 1 Chicago)"
            className="w-full bg-drip-charcoal/90 backdrop-blur-xl text-drip-white text-lg px-6 py-5 pl-14 pr-32 rounded-2xl border border-drip-graphite focus:border-accent-fire/50 transition-colors placeholder:text-drip-smoke"
            disabled={isLoading}
          />
          
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-drip-silver" />
          
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-accent-fire hover:bg-accent-fire/90 disabled:bg-drip-graphite disabled:cursor-not-allowed text-drip-white font-semibold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Searching</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Find Deals</span>
              </>
            )}
          </button>
        </motion.div>
      </form>
      
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span className="text-drip-smoke text-sm">Popular:</span>
        {popularSearches.map((search) => (
          <button
            key={search}
            onClick={() => {
              setQuery(search);
              onSearch(search);
            }}
            disabled={isLoading}
            className="text-sm text-drip-silver hover:text-drip-white bg-drip-charcoal hover:bg-drip-graphite px-3 py-1.5 rounded-full border border-drip-graphite hover:border-drip-smoke transition-all disabled:opacity-50"
          >
            {search}
          </button>
        ))}
      </div>
    </div>
  );
}
