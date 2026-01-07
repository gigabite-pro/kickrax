import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <Flame className="w-8 h-8 text-accent-fire group-hover:scale-110 transition-transform" />
            <div className="absolute inset-0 blur-lg bg-accent-fire/30 group-hover:bg-accent-fire/50 transition-colors" />
          </div>
          <span className="font-display text-3xl tracking-wide">
            KICK<span className="text-accent-fire">STAR</span>
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          <Link 
            to="/" 
            className="text-drip-silver hover:text-drip-white transition-colors font-medium"
          >
            Search
          </Link>
          <Link 
            to="/trending" 
            className="text-drip-silver hover:text-drip-white transition-colors font-medium"
          >
            Trending
          </Link>
          <Link 
            to="/about" 
            className="text-drip-silver hover:text-drip-white transition-colors font-medium"
          >
            About
          </Link>
        </nav>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-drip-smoke bg-drip-charcoal px-3 py-1.5 rounded-full border border-drip-graphite">
            🇨🇦 CAD
          </span>
        </div>
      </div>
    </header>
  );
}
