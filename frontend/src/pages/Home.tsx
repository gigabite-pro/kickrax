import { useState, useCallback, useEffect, lazy, Suspense, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import { CatalogProduct } from "../types";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTrending } from "../context/TrendingContext";
import { useSearch } from "../context/SearchContext";

// Lazy load the 3D component to avoid React version conflicts
const ShoeModel = lazy(() => import("../components/ShoeModel"));

// Max items to show for stagger animation grouping
const STAGGER_GROUP_SIZE = 10;

interface StockXProductCardProps {
    product: CatalogProduct;
    index: number;
}

function StockXProductCard({ product, index }: StockXProductCardProps) {
    const navigate = useNavigate();
    const [imageLoaded, setImageLoaded] = useState(false);

    const handleClick = () => {
        navigate(`/product/${encodeURIComponent(product.sku)}`, {
            state: { product },
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: index * 0.04,
                duration: 0.4,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            onClick={handleClick}
            className="bg-white rounded-xl sm:rounded-2xl overflow-hidden hover-lift group block cursor-pointer border border-noir/5"
        >
            {/* Image */}
            <div className="relative aspect-square bg-white p-2 sm:p-4 overflow-hidden">
                {/* Loading skeleton */}
                {!imageLoaded && product.imageUrl && <div className="absolute inset-0 skeleton" />}

                {product.imageUrl ? (
                    <img
                        src={product.imageUrl}
                        alt={product.name}
                        className={`w-full h-full object-contain group-hover:scale-110 transition-all duration-700 ease-out ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        loading="lazy"
                        onLoad={() => setImageLoaded(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl sm:text-6xl opacity-30">👟</span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-2.5 sm:p-4 bg-white border-t border-noir/10 shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.1)]">
                <p className="text-cherry text-[10px] sm:text-xs font-semibold mb-1 sm:mb-1.5 uppercase tracking-wide">{product.brand}</p>
                <h3 className="text-noir font-semibold text-xs sm:text-sm leading-snug group-hover:text-cherry transition-colors line-clamp-2">{product.name}</h3>
                {product.sku && <p className="text-noir/40 text-[10px] sm:text-xs mt-1 sm:mt-1.5 font-mono truncate">{product.sku}</p>}
            </div>
        </motion.div>
    );
}

export default function Home() {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const trendingRef = useRef<HTMLElement>(null);

    // Use context for search and trending data persistence
    const { results, isLoading, hasSearched, currentQuery, error, search } = useSearch();
    const { trending, trendingLoading, fetchTrending } = useTrending();

    // Fetch trending on page load
    useEffect(() => {
        fetchTrending();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Track mouse position for 3D model movement
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Normalize mouse position to -1 to 1 range
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * 2 - 1;
            setMousePosition({ x, y });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    // Scroll to trending section
    const scrollToTrending = useCallback(() => {
        trendingRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    // Update page title for SEO
    useEffect(() => {
        if (hasSearched && currentQuery) {
            document.title = `${currentQuery} - Search Results | KickRax`;
        } else {
            document.title = "KickRax | Compare Sneaker Prices Across StockX, GOAT & More";
        }
    }, [hasSearched, currentQuery]);

    const handleSearch = (query: string) => {
        search(query);
    };

    // If not searched yet, show hero with 100vh no scroll
    if (!hasSearched) {
        return (
            <main className="min-h-screen pattern-bg">
                <Header onSearch={handleSearch} isLoading={isLoading} />

                {/* Hero with 3D Model */}
                <section className="h-screen min-h-[600px] pt-28 md:pt-20 px-4 sm:px-6 relative flex flex-col items-center justify-center overflow-hidden">
                    <div className="max-w-7xl mx-auto text-center relative w-full">
                        {/* Tagline */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-noir/60 text-xs sm:text-lg md:text-lg lg:text-xl tracking-widest uppercase font-medium mb-2 sm:mb-3 md:mb-4"
                        >
                            Every size. Every source. One search.
                        </motion.p>

                        {/* Main Headline */}
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            className="font-display text-[4.5rem] sm:text-7xl md:text-7xl lg:text-8xl xl:text-[10rem] leading-[0.8] sm:leading-[0.85] tracking-tight text-noir"
                        >
                            STOP <span className="text-cherry">OVERPAYING</span>
                        </motion.h1>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="font-display text-[4.5rem] sm:text-7xl md:text-7xl lg:text-8xl xl:text-[10rem] leading-[0.8] sm:leading-[0.85] tracking-tight text-noir"
                        >
                            FOR <span className="text-cherry">KICKS</span>
                        </motion.h1>

                        {/* 3D Shoe Model - Below text, overlapping */}
                        <div className="relative -mt-6 sm:-mt-20 md:-mt-24 lg:-mt-32 xl:-mt-40">
                            <div className="relative h-[320px] sm:h-[350px] md:h-[350px] lg:h-[420px] xl:h-[500px] pointer-events-auto overflow-visible">
                                <Suspense fallback={null}>
                                    <ShoeModel mousePosition={mousePosition} />
                                </Suspense>
                            </div>
                        </div>
                    </div>

                    {/* Scroll down arrow */}
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        onClick={scrollToTrending}
                        className="absolute bottom-12 sm:bottom-10 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full border border-noir/30 bg-white/50 backdrop-blur-sm flex items-center justify-center hover:border-cherry hover:bg-cherry/10 transition-colors group z-10"
                    >
                        <motion.div animate={{ y: ["-1.5px", "2px", "-1.5px"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
                            <ChevronDown className="w-5 h-5 text-noir/60 group-hover:text-cherry" strokeWidth={2} />
                        </motion.div>
                    </motion.button>
                </section>

                {/* Trending Section */}
                <section ref={trendingRef} className="min-h-screen px-4 sm:px-6 pt-16 sm:pt-20 pb-10 sm:pb-16 scroll-mt-24 sm:scroll-mt-28">
                    <div className="max-w-7xl mx-auto">
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-2xl sm:text-3xl md:text-4xl font-display text-noir mb-6 sm:mb-8"
                        >
                            TRENDING <span className="text-cherry">NOW</span>
                        </motion.h2>

                        {trendingLoading ? (
                            <LoadingSkeleton />
                        ) : trending.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
                                {trending.map((product, index) => (
                                    <StockXProductCard key={product.id} product={product} index={index % STAGGER_GROUP_SIZE} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-noir/40">
                                <p>No trending sneakers found</p>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        );
    }

    // After search, show scrollable results
    return (
        <main className="min-h-screen pattern-bg">
            <Header onSearch={handleSearch} isLoading={isLoading} />

            {/* Results */}
            <section className="px-4 sm:px-6 pt-32 md:pt-24 pb-8 sm:pb-12">
                <div className="max-w-7xl mx-auto">
                    {isLoading ? (
                        <LoadingSkeleton />
                    ) : results.length > 0 ? (
                        <div>
                            {/* Header */}
                            <div className="mb-4 sm:mb-6">
                                <h2 className="text-lg sm:text-2xl font-display text-noir">RESULTS FOR "{currentQuery.toUpperCase()}"</h2>
                            </div>

                            {/* Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
                                {results.map((product, index) => (
                                    <StockXProductCard key={product.id} product={product} index={index % STAGGER_GROUP_SIZE} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <EmptyState type="no-results" query={currentQuery} />
                    )}

                    {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-4 bg-cherry/10 border border-cherry/30 rounded-xl text-center">
                            <p className="text-cherry">{error}</p>
                        </motion.div>
                    )}
                </div>
            </section>
        </main>
    );
}
