import Header from '../components/Header';
import { motion } from 'framer-motion';
import { Search, DollarSign, Zap, Shield, MapPin, TrendingUp } from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Multi-Platform Search',
    description: 'Search across StockX, GOAT, Flight Club, Stadium Goods, Grailed, and Canadian retailers simultaneously.',
  },
  {
    icon: DollarSign,
    title: 'CAD Pricing',
    description: 'All prices converted to Canadian dollars for easy comparison.',
  },
  {
    icon: Zap,
    title: 'Real-Time Data',
    description: 'Fresh prices fetched on every search, with 1-minute caching for speed.',
  },
  {
    icon: Shield,
    title: 'Verified Sellers Only',
    description: 'We only show listings from authenticated and verified resellers.',
  },
  {
    icon: MapPin,
    title: 'Canada Focused',
    description: 'Built specifically for the Canadian sneaker community.',
  },
  {
    icon: TrendingUp,
    title: 'Smart Comparison',
    description: 'Similar listings grouped together for easy price comparison.',
  },
];

const sources = [
  'StockX',
  'GOAT',
  'Flight Club',
  'Stadium Goods',
  'Grailed',
  'Livestock',
  'Haven',
  'Capsule',
  'Exclucity',
  'NRML',
];

export default function About() {
  return (
    <main className="min-h-screen pb-20">
      <Header />
      
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="font-display text-6xl md:text-7xl mb-6">
              ABOUT <span className="gradient-text">KICKSTAR</span>
            </h1>
            <p className="text-drip-silver text-xl max-w-2xl mx-auto">
              Stop overpaying for sneakers. We built KickStar to help the Canadian sneaker community find the best deals across all major verified reselling platforms.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-8 mb-12"
          >
            <h2 className="font-display text-3xl mb-6">THE PROBLEM</h2>
            <p className="text-drip-silver text-lg leading-relaxed mb-4">
              Finding the best price for a sneaker is exhausting. You have to check StockX, then GOAT, then Flight Club, then local Canadian stores... and by the time you&apos;ve compared everything, the deal might be gone.
            </p>
            <p className="text-drip-silver text-lg leading-relaxed">
              Plus, most platforms show USD prices, leaving Canadian buyers to do mental math on every listing. We fixed that.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl p-8 mb-12"
          >
            <h2 className="font-display text-3xl mb-6">THE SOLUTION</h2>
            <p className="text-drip-silver text-lg leading-relaxed">
              KickStar searches 10+ verified platforms simultaneously and shows you every listing in Canadian dollars. We group similar sneakers together so you can instantly see who has the best price. It&apos;s like Skyscanner or Google Flights, but for sneakers.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="glass rounded-xl p-6"
              >
                <feature.icon className="w-8 h-8 text-accent-fire mb-4" />
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-drip-smoke text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass rounded-2xl p-8"
          >
            <h2 className="font-display text-3xl mb-6">DATA SOURCES</h2>
            <p className="text-drip-silver text-lg leading-relaxed mb-6">
              We aggregate publicly available data from verified resellers:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {sources.map((source) => (
                <div
                  key={source}
                  className="bg-drip-charcoal rounded-lg p-4 text-center font-medium"
                >
                  {source}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

