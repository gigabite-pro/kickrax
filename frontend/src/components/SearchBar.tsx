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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <motion.div
          animate={{
            boxShadow: isFocused 
              ? '0 0 0 2px rgba(179, 0, 0, 0.3), 0 25px 50px -12px rgba(27, 23, 23, 0.25)'
              : '0 25px 50px -12px rgba(27, 23, 23, 0.2)'
          }}
          className="relative rounded-2xl overflow-hidden backdrop-blur-xl"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search any sneaker... (e.g., Jordan 1 Chicago)"
            className="w-full bg-white/70 backdrop-blur-xl text-noir text-lg px-6 py-5 pl-14 pr-36 rounded-2xl border border-white/50 focus:border-cherry/50 focus:bg-white/80 transition-all placeholder:text-noir/40"
            disabled={isLoading}
          />
          
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-noir/40" />
          
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-cherry hover:bg-cherry-light disabled:bg-noir/20 disabled:cursor-not-allowed text-cotton font-semibold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2"
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
    </div>
  );
}
