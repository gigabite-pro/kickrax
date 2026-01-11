import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { searchStockXCatalog, getProductStyleId, getProductDataWithPrices, StockXProductData } from "./scrapers/sources/stockx.js";
import { searchGoatBySku } from "./scrapers/sources/goat.js";
import { searchKickscrewBySku } from "./scrapers/sources/kickscrew.js";
import { searchFlightClubBySku } from "./scrapers/sources/flight-club.js";
import { searchStadiumGoodsBySku } from "./scrapers/sources/stadiumgoods.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Search API - Returns StockX results only
 */
app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    const normalizedQuery = query.trim();
    const startTime = Date.now();

    try {
        console.log(`[API] Searching StockX for: ${normalizedQuery}`);

        // Get products from StockX only
        const products = await searchStockXCatalog(normalizedQuery);
        const duration = Date.now() - startTime;

        console.log(`[API] Found ${products.length} products in ${duration}ms`);

        res.json({
            query: normalizedQuery,
            products,
            meta: {
                total: products.length,
                source: "StockX",
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Search API error:", error);
        res.status(500).json({
            error: "Failed to search",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

/**
 * Get Style ID AND prices from a StockX product page
 */
app.get("/api/product/style", async (req, res) => {
    const url = req.query.url as string;

    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    try {
        console.log(`[API] Getting Style ID and prices from: ${url}`);
        const productData = await getProductDataWithPrices(url);

        console.log(`[API] Style ID: ${productData.styleId}, Sizes: ${productData.sizes.length}`);

        res.json({
            url,
            styleId: productData.styleId,
            stockxPrices: productData,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Style ID API error:", error);
        res.status(500).json({
            error: "Failed to get Style ID",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

/**
 * Search GOAT + KicksCrew + FlightClub by SKU and get all size prices
 */
app.get("/api/goat/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching prices for SKU: ${sku}`);

        // Fetch from all sources in parallel
        const [goatResult, kickscrewResult, flightClubResult, stadiumGoodsResult] = await Promise.all([
            searchGoatBySku(sku),
            searchKickscrewBySku(sku),
            searchFlightClubBySku(sku),
            searchStadiumGoodsBySku(sku),
        ]);

        const duration = Date.now() - startTime;

        // Print all sizes from each source
        console.log(`\n========== RESULTS FOR SKU: ${sku} (${duration}ms) ==========`);

        if (goatResult?.sizes?.length) {
            console.log(`\n[GOAT] ${goatResult.sizes.length} sizes:`);
            console.log(`  ${goatResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[GOAT] No sizes found`);
        }

        if (kickscrewResult?.sizes?.length) {
            console.log(`\n[KICKSCREW] ${kickscrewResult.sizes.length} sizes:`);
            console.log(`  ${kickscrewResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[KICKSCREW] No sizes found`);
        }

        if (flightClubResult?.sizes?.length) {
            console.log(`\n[FLIGHTCLUB] ${flightClubResult.sizes.length} sizes:`);
            console.log(`  ${flightClubResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[FLIGHTCLUB] No sizes found`);
        }

        if (stadiumGoodsResult?.sizes?.length) {
            console.log(`\n[STADIUMGOODS] ${stadiumGoodsResult.sizes.length} sizes:`);
            console.log(`  ${stadiumGoodsResult.sizes.map((s) => `${s.size}=$${s.price}`).join(", ")}`);
        } else {
            console.log(`\n[STADIUMGOODS] No sizes found`);
        }

        console.log(`\n====================================================\n`);

        res.json({
            sku,
            goat: goatResult,
            kickscrew: kickscrewResult,
            flightclub: flightClubResult,
            stadiumgoods: stadiumGoodsResult,
            meta: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Prices API error:", error);
        res.status(500).json({
            error: "Failed to fetch prices",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

/**
 * Individual source endpoints - for progressive loading
 */

// GOAT prices
app.get("/api/prices/goat", async (req, res) => {
    const sku = req.query.sku as string;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await searchGoatBySku(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "goat", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "goat", error: "Failed to fetch" });
    }
});

// KicksCrew prices
app.get("/api/prices/kickscrew", async (req, res) => {
    const sku = req.query.sku as string;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await searchKickscrewBySku(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "kickscrew", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "kickscrew", error: "Failed to fetch" });
    }
});

// Flight Club prices
app.get("/api/prices/flightclub", async (req, res) => {
    const sku = req.query.sku as string;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await searchFlightClubBySku(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "flightclub", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "flightclub", error: "Failed to fetch" });
    }
});

// Stadium Goods prices
app.get("/api/prices/stadiumgoods", async (req, res) => {
    const sku = req.query.sku as string;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();
    try {
        const result = await searchStadiumGoodsBySku(sku);
        const duration = Date.now() - startTime;
        res.json({ source: "stadiumgoods", sku, data: result, duration });
    } catch (error) {
        res.status(500).json({ source: "stadiumgoods", error: "Failed to fetch" });
    }
});

// StockX prices (uses URL instead of SKU since we need to be on the page)
app.get("/api/prices/stockx", async (req, res) => {
    const url = req.query.url as string;
    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    const startTime = Date.now();
    try {
        const result = await getProductDataWithPrices(url);
        const duration = Date.now() - startTime;
        res.json({ 
            source: "stockx", 
            data: {
                productName: result.productName,
                productUrl: result.productUrl,
                imageUrl: result.imageUrl,
                sizes: result.sizes,
            }, 
            duration 
        });
    } catch (error) {
        res.status(500).json({ source: "stockx", error: "Failed to fetch" });
    }
});

/**
 * Get prices from all sources (GOAT + KicksCrew + FlightClub) by SKU
 */
app.get("/api/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching prices from all sources for SKU: ${sku}`);

        // Fetch from all sources in parallel
        const [goatResult, kickscrewResult, flightClubResult, stadiumGoodsResult] = await Promise.all([
            searchGoatBySku(sku),
            searchKickscrewBySku(sku),
            searchFlightClubBySku(sku),
            searchStadiumGoodsBySku(sku),
        ]);

        const duration = Date.now() - startTime;

        // Print all sizes from each source
        console.log(`\n========== ALL SOURCES - SKU: ${sku} (${duration}ms) ==========`);

        if (goatResult?.sizes?.length) {
            console.log(`\n[GOAT] ${goatResult.sizes.length} sizes:`);
            console.log(`  ${goatResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[GOAT] No sizes found`);
        }

        if (kickscrewResult?.sizes?.length) {
            console.log(`\n[KICKSCREW] ${kickscrewResult.sizes.length} sizes:`);
            console.log(`  ${kickscrewResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[KICKSCREW] No sizes found`);
        }

        if (flightClubResult?.sizes?.length) {
            console.log(`\n[FLIGHTCLUB] ${flightClubResult.sizes.length} sizes:`);
            console.log(`  ${flightClubResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`\n[FLIGHTCLUB] No sizes found`);
        }

        if (stadiumGoodsResult?.sizes?.length) {
            console.log(`\n[STADIUMGOODS] ${stadiumGoodsResult.sizes.length} sizes:`);
            console.log(`  ${stadiumGoodsResult.sizes.map((s) => `${s.size}=$${s.price}`).join(", ")}`);
        } else {
            console.log(`\n[STADIUMGOODS] No sizes found`);
        }

        console.log(`\n====================================================\n`);

        res.json({
            sku,
            goat: goatResult,
            kickscrew: kickscrewResult,
            flightclub: flightClubResult,
            stadiumgoods: stadiumGoodsResult,
            meta: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Prices API error:", error);
        res.status(500).json({
            error: "Failed to fetch prices",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /api/search?q=jordan+1        - Search StockX`);
    console.log(`  GET /api/product/style?url=...    - Get Style ID from product page`);
    console.log(`  GET /api/goat/prices?sku=...      - Get GOAT prices by SKU`);
    console.log(`  GET /api/kickscrew/prices?sku=... - Get KicksCrew prices by SKU`);
    console.log(`  GET /api/prices?sku=...           - Get all prices by SKU`);
    console.log(`  GET /api/health                   - Health check`);
});
