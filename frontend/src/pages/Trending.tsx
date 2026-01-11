import Header from '../components/Header';
import { motion } from 'framer-motion';
import { TrendingUp, ExternalLink, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';

const trendingSneakers = [
  {
    name: 'Jordan 1 Retro High OG Chicago Lost and Found',
    brand: 'Jordan',
    sku: 'DZ5485-612',
    avgPrice: 285,
    emoji: '🔴',
  },
  {
    name: 'Nike Dunk Low Retro White Black Panda',
    brand: 'Nike',
    sku: 'DD1391-100',
    avgPrice: 145,
    emoji: '🐼',
  },
  {
    name: 'Adidas Yeezy Boost 350 V2 Onyx',
    brand: 'Adidas',
    sku: 'HQ4540',
    avgPrice: 310,
    emoji: '⚫',
  },
  {
    name: 'New Balance 550 White Green',
    brand: 'New Balance',
    sku: 'BB550WT1',
    avgPrice: 165,
    emoji: '🟢',
  },
  {
    name: 'Jordan 4 Retro Thunder',
    brand: 'Jordan',
    sku: 'DH6927-017',
    avgPrice: 380,
    emoji: '⚡',
  },
  {
    name: 'Nike Air Force 1 Low White',
    brand: 'Nike',
    sku: 'CW2288-111',
    avgPrice: 130,
    emoji: '⚪',
  },
  {
    name: 'Adidas Samba OG White',
    brand: 'Adidas',
    sku: 'B75806',
    avgPrice: 140,
    emoji: '👟',
  },
  {
    name: 'Jordan 11 Retro Cherry',
    brand: 'Jordan',
    sku: 'CT8012-116',
    avgPrice: 320,
    emoji: '🍒',
  },
];

export default function Trending() {
  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Flame className="w-10 h-10 text-accent-fire" />
              <h1 className="font-display text-6xl md:text-7xl">
                TRENDING
              </h1>
            </div>
            <p className="text-drip-silver text-xl max-w-2xl mx-auto">
              The most popular sneakers being searched right now in Canada
            </p>
          </motion.div>

          <div className="space-y-4">
            {trendingSneakers.map((sneaker, index) => (
              <motion.div
                key={sneaker.sku}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  to={`/?search=${encodeURIComponent(sneaker.name)}`}
                  className="glass rounded-xl p-5 flex items-center justify-between gap-4 hover:bg-drip-charcoal/80 transition-colors group block"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{sneaker.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-drip-smoke text-sm">{sneaker.brand}</span>
                        <span className="text-drip-graphite">•</span>
                        <span className="text-drip-smoke text-xs font-mono">{sneaker.sku}</span>
                      </div>
                      <h3 className="text-drip-white font-semibold text-lg group-hover:text-accent-fire transition-colors">
                        {sneaker.name}
                      </h3>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-drip-smoke text-xs">Avg. Price</p>
                      <p className="text-accent-mint font-display text-2xl">
                        ${sneaker.avgPrice}
                      </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-drip-smoke group-hover:text-drip-white transition-colors" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="mt-12 text-center"
          >
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent-fire hover:bg-accent-fire/90 text-drip-white font-semibold px-8 py-4 rounded-xl transition-colors"
            >
              <TrendingUp className="w-5 h-5" />
              Search All Sneakers
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

