import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';

interface HeaderProps {
  onSearch?: (query: string) => void;
  isLoading?: boolean;
}

export default function Header({ onSearch, isLoading = false }: HeaderProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading && onSearch) {
      onSearch(query.trim());
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-cotton/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="group flex-shrink-0">
          <span className="font-display text-3xl tracking-wider text-noir">
            KICK<span className="text-cherry">RAX</span>
          </span>
        </Link>
        
        {/* Search Bar */}
        {onSearch && (
          <form onSubmit={handleSubmit} className="flex-1 max-w-xl">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-noir" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sneakers..."
                className="w-full bg-white/70 backdrop-blur-sm text-noir text-sm pl-10 pr-20 py-2.5 rounded-lg border border-noir/10 focus:border-cherry/50 focus:bg-white transition-all placeholder:text-noir/40"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="absolute right-1.5 bg-cherry hover:bg-cherry-light disabled:bg-noir/20 disabled:cursor-not-allowed text-cotton text-xs font-semibold px-4 py-1.5 rounded-md transition-all flex items-center gap-1.5"
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </form>
        )}
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-noir bg-cotton-dark px-3 py-1.5 rounded-full border border-noir/10">
            🇨🇦 CAD
          </span>
        </div>
      </div>
    </header>
  );
}
