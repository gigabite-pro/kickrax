import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { searchStockXCatalog, getProductStyleId } from "./scrapers/sources/stockx.js";
import { searchGoatBySku } from "./scrapers/sources/goat.js";
import { searchKickscrewBySku } from "./scrapers/sources/kickscrew.js";

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
 * Get Style ID from a StockX product page
 */
app.get("/api/product/style", async (req, res) => {
    const url = req.query.url as string;

    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    try {
        console.log(`[API] Getting Style ID from: ${url}`);
        const styleId = await getProductStyleId(url);
        
        console.log(`[API] Style ID: ${styleId}`);

        res.json({
            url,
            styleId,
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
 * Search GOAT + KicksCrew by SKU and get all size prices
 */
app.get("/api/goat/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching prices for SKU: ${sku}`);

        // Fetch from both sources in parallel
        const [goatResult, kickscrewResult] = await Promise.all([
            searchGoatBySku(sku),
            searchKickscrewBySku(sku),
        ]);

        const duration = Date.now() - startTime;

        // Print GOAT sizes to console
        if (goatResult && goatResult.sizes.length > 0) {
            console.log(`[API] GOAT found ${goatResult.sizes.length} sizes`);
            console.log("\n=================================");
            console.log(`GOAT PRICES FOR: ${goatResult.productName}`);
            console.log(`URL: ${goatResult.productUrl}`);
            console.log("=================================");
            goatResult.sizes.forEach((s) => {
                console.log(`  Size ${s.size}: CA$${s.priceCAD} (US$${s.price})`);
            });
            console.log("=================================\n");
        } else {
            console.log(`[API] GOAT: No sizes found`);
        }

        // Print KicksCrew sizes to console
        if (kickscrewResult && kickscrewResult.sizes.length > 0) {
            console.log(`[API] KicksCrew found ${kickscrewResult.sizes.length} sizes`);
            console.log("\n=================================");
            console.log(`KICKSCREW PRICES FOR: ${kickscrewResult.productName}`);
            console.log(`URL: ${kickscrewResult.productUrl}`);
            console.log("=================================");
            kickscrewResult.sizes.forEach((s) => {
                console.log(`  Size ${s.size}: CA$${s.priceCAD} (US$${s.price})`);
            });
            console.log("=================================\n");
        } else {
            console.log(`[API] KicksCrew: No sizes found`);
        }

        console.log(`[API] Total time: ${duration}ms`);

        res.json({
            sku,
            goat: goatResult,
            kickscrew: kickscrewResult,
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
 * Search KicksCrew by SKU and get all size prices
 */
app.get("/api/kickscrew/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Searching KicksCrew for SKU: ${sku}`);
        const result = await searchKickscrewBySku(sku);
        const duration = Date.now() - startTime;

        if (!result) {
            return res.status(404).json({
                error: "Product not found on KicksCrew",
                sku,
            });
        }

        console.log(`[API] KicksCrew found ${result.sizes.length} sizes in ${duration}ms`);

        // Print sizes to console
        console.log("\n=================================");
        console.log(`KICKSCREW PRICES FOR: ${result.productName}`);
        console.log(`URL: ${result.productUrl}`);
        console.log("=================================");
        result.sizes.forEach((s) => {
            console.log(`  Size ${s.size}: CA$${s.priceCAD} (US$${s.price})`);
        });
        console.log("=================================\n");

        res.json({
            sku,
            product: result,
            meta: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("KicksCrew API error:", error);
        res.status(500).json({
            error: "Failed to search KicksCrew",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

/**
 * Get prices from all sources (GOAT + KicksCrew) by SKU
 */
app.get("/api/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required (at least 3 characters)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[API] Fetching prices from all sources for SKU: ${sku}`);

        // Fetch from both sources in parallel
        const [goatResult, kickscrewResult] = await Promise.all([
            searchGoatBySku(sku),
            searchKickscrewBySku(sku),
        ]);

        const duration = Date.now() - startTime;

        // Print GOAT sizes to console
        if (goatResult && goatResult.sizes.length > 0) {
            console.log("\n=================================");
            console.log(`GOAT PRICES FOR: ${goatResult.productName}`);
            console.log("=================================");
            goatResult.sizes.forEach((s) => {
                console.log(`  Size ${s.size}: CA$${s.priceCAD}`);
            });
        }

        // Print KicksCrew sizes to console
        if (kickscrewResult && kickscrewResult.sizes.length > 0) {
            console.log("\n=================================");
            console.log(`KICKSCREW PRICES FOR: ${kickscrewResult.productName}`);
            console.log("=================================");
            kickscrewResult.sizes.forEach((s) => {
                console.log(`  Size ${s.size}: CA$${s.priceCAD}`);
            });
        }
        console.log("=================================\n");

        res.json({
            sku,
            goat: goatResult,
            kickscrew: kickscrewResult,
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
