/**
 * KickRax API Server (Render)
 *
 * Main API server that handles all public endpoints.
 * - Serves cached data when available
 * - Calls Fly.io scraper service when scraping is needed
 * - No Puppeteer/browser logic here
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getCachedTrending, setCachedTrending, isRedisConfigured } from "./cache/redis.js";
import {
    scrapeTrending,
    scrapeSearch,
    scrapeStockXProduct,
    scrapeGoat,
    scrapeKickscrew,
    scrapeFlightclub,
    scrapeStadiumgoods,
    scrapeAllPrices,
    isScraperConfigured,
    getScraperUrl,
} from "./lib/scraper-client.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============================================================================
// HEALTH & STATUS
// ============================================================================

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "kickrax-api",
        timestamp: new Date().toISOString(),
        config: {
            redis: isRedisConfigured(),
            scraper: isScraperConfigured(),
            scraperUrl: isScraperConfigured() ? getScraperUrl() : null,
        },
    });
});

// ============================================================================
// TRENDING API (with Redis cache)
// ============================================================================

/**
 * Get trending sneakers
 * - Returns cached data if available
 * - Calls Fly.io scraper if cache miss
 */
app.get("/api/trending", async (req, res) => {
    const startTime = Date.now();
    const forceRefresh = req.query.refresh === "true";

    try {
        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = await getCachedTrending();
            if (cached) {
                const duration = Date.now() - startTime;
                console.log(`[API] Trending cache HIT (${cached.products.length} products, ${duration}ms)`);

                return res.json({
                    products: cached.products,
                    meta: {
                        total: cached.products.length,
                        timestamp: new Date().toISOString(),
                        cached: true,
                        cachedAt: cached.cachedAt,
                        expiresAt: cached.expiresAt,
                        duration,
                    },
                });
            }
        }

        // Cache miss - call Fly.io scraper
        console.log(`[API] Trending cache MISS, calling scraper...`);
        const products = await scrapeTrending();
        const duration = Date.now() - startTime;

        if (products.length === 0) {
            return res.status(503).json({
                error: "Scraper unavailable",
                message: "Could not fetch trending data. Please try again later.",
            });
        }

        // Cache the results
        await setCachedTrending(products);

        console.log(`[API] Trending scraped and cached (${products.length} products, ${duration}ms)`);

        res.json({
            products,
            meta: {
                total: products.length,
                timestamp: new Date().toISOString(),
                cached: false,
                duration,
            },
        });
    } catch (error) {
        console.error("[API] Trending error:", error);
        res.status(500).json({
            error: "Failed to fetch trending",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// ============================================================================
// SEARCH API
// ============================================================================

/**
 * Search sneakers
 * - Calls Fly.io scraper directly (search results aren't cached)
 */
app.get("/api/search", async (req, res) => {
    const query = req.query.q;

    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    const normalizedQuery = query.trim();
    const startTime = Date.now();

    try {
        console.log(`[API] Searching for: ${normalizedQuery}`);
        const products = await scrapeSearch(normalizedQuery);
        const duration = Date.now() - startTime;

        console.log(`[API] Found ${products.length} products in ${duration}ms`);

        res.json({
            query: normalizedQuery,
            products,
            meta: {
                total: products.length,
                timestamp: new Date().toISOString(),
                duration,
            },
        });
    } catch (error) {
        console.error("[API] Search error:", error);
        res.status(500).json({
            error: "Failed to search",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// ============================================================================
// PRODUCT DETAILS API
// ============================================================================

/**
 * Get StockX product style ID and prices
 */
app.get("/api/product/style", async (req, res) => {
    const url = req.query.url;

    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Getting product data from: ${url}`);
        const productData = await scrapeStockXProduct(url);
        const duration = Date.now() - startTime;

        if (!productData) {
            return res.status(503).json({
                error: "Scraper unavailable",
                message: "Could not fetch product data. Please try again later.",
            });
        }

        console.log(`[API] Style ID: ${productData.styleId}, Sizes: ${productData.sizes.length}, ${duration}ms`);

        res.json({
            url,
            styleId: productData.styleId,
            stockxPrices: productData,
            timestamp: new Date().toISOString(),
            duration,
        });
    } catch (error) {
        console.error("[API] Product style error:", error);
        res.status(500).json({
            error: "Failed to get product data",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// ============================================================================
// PRICE APIs (individual sources)
// ============================================================================

app.get("/api/prices/goat", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await scrapeGoat(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "goat", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "goat", error: "Failed to fetch" });
    }
});

app.get("/api/prices/kickscrew", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await scrapeKickscrew(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "kickscrew", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "kickscrew", error: "Failed to fetch" });
    }
});

app.get("/api/prices/flightclub", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await scrapeFlightclub(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "flightclub", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "flightclub", error: "Failed to fetch" });
    }
});

app.get("/api/prices/stadiumgoods", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await scrapeStadiumgoods(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "stadiumgoods", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "stadiumgoods", error: "Failed to fetch" });
    }
});

app.get("/api/prices/stockx", async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    const startTime = Date.now();
    try {
        const result = await scrapeStockXProduct(url);
        const duration = Date.now() - startTime;
        res.json({
            source: "stockx",
            data: result
                ? {
                      productName: result.productName,
                      productUrl: result.productUrl,
                      imageUrl: result.imageUrl,
                      sizes: result.sizes,
                  }
                : null,
            duration,
        });
    } catch (error) {
        res.status(500).json({ source: "stockx", error: "Failed to fetch" });
    }
});

// ============================================================================
// ALL PRICES API
// ============================================================================

/**
 * Get prices from all sources by SKU
 */
app.get("/api/prices", async (req, res) => {
    const sku = req.query.sku;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching all prices for SKU: ${sku}`);
        const prices = await scrapeAllPrices(sku);
        const duration = Date.now() - startTime;

        console.log(`[API] All prices fetched in ${duration}ms`);

        res.json({
            sku,
            goat: prices.goat,
            kickscrew: prices.kickscrew,
            flightclub: prices.flightclub,
            stadiumgoods: prices.stadiumgoods,
            meta: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("[API] Prices error:", error);
        res.status(500).json({
            error: "Failed to fetch prices",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

/**
 * Legacy endpoint - redirects to /api/prices
 */
app.get("/api/goat/prices", async (req, res) => {
    const sku = req.query.sku;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching all prices for SKU: ${sku}`);
        const prices = await scrapeAllPrices(sku);
        const duration = Date.now() - startTime;

        res.json({
            sku,
            goat: prices.goat,
            kickscrew: prices.kickscrew,
            flightclub: prices.flightclub,
            stadiumgoods: prices.stadiumgoods,
            meta: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("[API] Prices error:", error);
        res.status(500).json({
            error: "Failed to fetch prices",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`🚀 KickRax API running on http://localhost:${PORT}`);
    console.log(`\nConfiguration:`);
    console.log(`  Redis: ${isRedisConfigured() ? "✓ Connected" : "✗ Not configured"}`);
    console.log(`  Scraper: ${isScraperConfigured() ? `✓ ${getScraperUrl()}` : "✗ Not configured"}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /api/health               - Health check`);
    console.log(`  GET /api/trending             - Trending (cached)`);
    console.log(`  GET /api/search?q=...         - Search`);
    console.log(`  GET /api/product/style?url=...  - StockX product`);
    console.log(`  GET /api/prices?sku=...       - All sources`);
    console.log(`  GET /api/prices/goat?sku=...  - GOAT only`);
    console.log(`  GET /api/prices/stockx?url=...  - StockX only`);
});
