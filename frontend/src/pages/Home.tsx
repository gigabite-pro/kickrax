import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import { CatalogProduct } from "../types";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

// Lazy load the 3D component to avoid React version conflicts
const ShoeModel = lazy(() => import("../components/ShoeModel"));

interface StockXProductCardProps {
    product: CatalogProduct;
    index: number;
}

function StockXProductCard({ product, index }: StockXProductCardProps) {
    const navigate = useNavigate();

    const handleClick = () => {
        navigate(`/product/${encodeURIComponent(product.sku)}`, {
            state: { product },
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            onClick={handleClick}
            className="bg-white rounded-2xl overflow-hidden hover-lift group block cursor-pointer border border-noir/5"
        >
            {/* Image */}
            <div className="relative aspect-square bg-cotton-dark p-6 overflow-hidden">
                {product.imageUrl ? (
                    <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 ease-out"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-7xl opacity-30">👟</span>
                    </div>
                )}

                {/* Price badge */}
                {product.stockxLowestAsk > 0 && <div className="absolute bottom-4 left-4 bg-cherry text-cotton text-sm font-bold px-3 py-1.5 rounded-full">CA${product.stockxLowestAsk}</div>}
            </div>

            {/* Info */}
            <div className="p-5 bg-white">
                <p className="text-cherry text-xs font-semibold mb-2 uppercase tracking-wide">{product.brand}</p>
                <h3 className="text-noir font-semibold text-sm leading-snug group-hover:text-cherry transition-colors">{product.name}</h3>
                {product.sku && <p className="text-noir/40 text-xs mt-2 font-mono">{product.sku}</p>}
            </div>
        </motion.div>
    );
}

export default function Home() {
    const [results, setResults] = useState<CatalogProduct[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentQuery, setCurrentQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

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

    const handleSearch = useCallback(async (query: string) => {
        setIsLoading(true);
        setHasSearched(true);
        setCurrentQuery(query);
        setError(null);

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);

            if (!response.ok) {
                throw new Error("Search failed");
            }

            const data = await response.json();
            console.log("Search response:", data);
            console.log("Products:", data.products);
            setResults(data.products || []);
            setDuration(data.meta?.duration || 0);
        } catch (err) {
            console.error("Search error:", err);
            setError("Failed to search. Please try again.");
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    return (
        <main className="min-h-screen pb-20 pattern-bg">
            <Header onSearch={handleSearch} isLoading={isLoading} />

            {/* Hero with 3D Model */}
            <section className="pt-20 pb-12 px-6 relative min-h-screen flex flex-col items-center justify-start">
                <div className="max-w-7xl mx-auto text-center relative w-full">
                    {/* Tagline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-noir/60 text-lg md:text-xl tracking-widest uppercase font-medium mb-4"
                    >
                        Every size. Every source. One search.
                    </motion.p>

                    {/* Main Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="font-display text-6xl md:text-8xl lg:text-[10rem] leading-[0.9] tracking-tight text-noir"
                    >
                        STOP <span className="text-cherry">OVERPAYING</span>
                    </motion.h1>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="font-display text-6xl md:text-8xl lg:text-[10rem] leading-[0.9] tracking-tight text-noir"
                    >
                        FOR <span className="text-cherry">KICKS</span>
                    </motion.h1>

                    {/* 3D Shoe Model - Below text, overlapping */}
                    {!hasSearched && (
                        <div className="relative -mt-24 md:-mt-32 lg:-mt-40">
                            <div className="relative h-[350px] md:h-[420px] lg:h-[500px] pointer-events-none overflow-visible">
                                <Suspense fallback={null}>
                                    <ShoeModel mousePosition={mousePosition} />
                                </Suspense>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Results */}
            <section className="px-6">
                <div className="max-w-7xl mx-auto">
                    {isLoading ? (
                        <div className="mt-8">
                            <div className="flex items-center gap-2 text-noir/60 mb-6">
                                <Clock className="w-5 h-5 animate-pulse" />
                                <span>Searching StockX...</span>
                            </div>
                            <LoadingSkeleton />
                        </div>
                    ) : hasSearched ? (
                        results.length > 0 ? (
                            <div className="mt-8">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 className="text-2xl font-display text-noir">
                                            {results.length} RESULTS FOR "{currentQuery.toUpperCase()}"
                                        </h2>
                                        <p className="text-noir/40 text-sm mt-1">From StockX • {duration}ms</p>
                                    </div>
                                </div>

                                {/* Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {results.map((product, index) => {
                                        console.log("Rendering product:", product.name, product);
                                        return <StockXProductCard key={product.id} product={product} index={index} />;
                                    })}
                                </div>
                            </div>
                        ) : (
                            <EmptyState type="no-results" query={currentQuery} />
                        )
                    ) : (
                        <EmptyState type="initial" />
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
