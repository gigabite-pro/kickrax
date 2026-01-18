/**
 * KickRax Scraper Service (Fly.io)
 *
 * Puppeteer-based scraping service.
 * - One request = one scrape = VM exits
 * - Called by backend API when cache miss occurs
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { searchStockXCatalog, getProductDataWithPrices } from "./scrapers/sources/stockx.js";
import { searchGoatBySku } from "./scrapers/sources/goat.js";
import { searchKickscrewBySku } from "./scrapers/sources/kickscrew.js";
import { searchFlightClubBySku } from "./scrapers/sources/flight-club.js";
import { searchStadiumGoodsBySku } from "./scrapers/sources/stadiumgoods.js";
import { closeBrowser } from "./scrapers/browser.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Global lock - prevents concurrent requests within this VM
let isRunning = false;
let isShuttingDown = false;

// Optional API key for securing the scraper endpoint
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

app.use(cors());
app.use(express.json());

// Auth middleware
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.path === "/health") {
        return next();
    }

    if (SCRAPER_API_KEY) {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${SCRAPER_API_KEY}`) {
            console.log(`[AUTH] Unauthorized request to ${req.path}`);
            return res.status(401).json({ error: "Unauthorized" });
        }
    }

    next();
}

// Lock middleware - ensures one request per VM
function lockMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.path === "/health") {
        return next();
    }

    if (isRunning || isShuttingDown) {
        console.log(`[LOCK] Rejecting request - VM busy`);
        return res.status(429).json({
            error: "VM busy",
            message: "This scraper is already processing a request.",
        });
    }

    isRunning = true;
    console.log(`[SCRAPER] Lock acquired for ${req.path}`);
    next();
}

app.use(authMiddleware);
app.use(lockMiddleware);

// Helper to exit after response
function exitAfterResponse(res: express.Response) {
    res.on("finish", () => {
        console.log(`[SCRAPER] Response sent, exiting...`);
        setTimeout(() => process.exit(0), 100);
    });
}

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "kickrax-scraper",
        timestamp: new Date().toISOString(),
    });
});

// Scrape trending
app.get("/scrape/trending", async (req, res) => {
    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping trending from StockX...`);
        const products = await searchStockXCatalog(undefined, "most-active");
        const duration = Date.now() - startTime;

        console.log(`[SCRAPER] Found ${products.length} trending products in ${duration}ms`);

        res.json({
            success: true,
            products,
            meta: { count: products.length, duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] Trending scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape search
app.get("/scrape/search", async (req, res) => {
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
        isRunning = false;
        return res.status(400).json({ error: "Query required (min 2 chars)" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Searching StockX for: ${query}`);
        const products = await searchStockXCatalog(query);
        const duration = Date.now() - startTime;

        console.log(`[SCRAPER] Found ${products.length} products in ${duration}ms`);

        res.json({
            success: true,
            query,
            products,
            meta: { count: products.length, duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] Search scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape StockX product
app.get("/scrape/stockx/product", async (req, res) => {
    const url = req.query.url as string;

    if (!url || !url.includes("stockx.com")) {
        isRunning = false;
        return res.status(400).json({ error: "Valid StockX URL required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping StockX product: ${url}`);
        const productData = await getProductDataWithPrices(url);
        const duration = Date.now() - startTime;

        console.log(`[SCRAPER] Got ${productData.sizes.length} sizes in ${duration}ms`);

        res.json({
            success: true,
            data: productData,
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] StockX product scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape GOAT
app.get("/scrape/goat", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        isRunning = false;
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping GOAT for SKU: ${sku}`);
        const result = await searchGoatBySku(sku);
        const duration = Date.now() - startTime;

        res.json({
            success: true,
            data: result,
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] GOAT scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape KicksCrew
app.get("/scrape/kickscrew", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        isRunning = false;
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping KicksCrew for SKU: ${sku}`);
        const result = await searchKickscrewBySku(sku);
        const duration = Date.now() - startTime;

        res.json({
            success: true,
            data: result,
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] KicksCrew scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape FlightClub
app.get("/scrape/flightclub", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        isRunning = false;
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping FlightClub for SKU: ${sku}`);
        const result = await searchFlightClubBySku(sku);
        const duration = Date.now() - startTime;

        res.json({
            success: true,
            data: result,
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] FlightClub scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape StadiumGoods
app.get("/scrape/stadiumgoods", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        isRunning = false;
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping StadiumGoods for SKU: ${sku}`);
        const result = await searchStadiumGoodsBySku(sku);
        const duration = Date.now() - startTime;

        res.json({
            success: true,
            data: result,
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] StadiumGoods scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Scrape all prices
app.get("/scrape/prices", async (req, res) => {
    const sku = req.query.sku as string;

    if (!sku || sku.trim().length < 3) {
        isRunning = false;
        return res.status(400).json({ error: "Valid SKU required" });
    }

    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] Scraping all sources for SKU: ${sku}`);

        const [goat, kickscrew, flightclub, stadiumgoods] = await Promise.all([
            searchGoatBySku(sku).catch(() => null),
            searchKickscrewBySku(sku).catch(() => null),
            searchFlightClubBySku(sku).catch(() => null),
            searchStadiumGoodsBySku(sku).catch(() => null),
        ]);

        const duration = Date.now() - startTime;
        console.log(`[SCRAPER] All sources scraped in ${duration}ms`);

        res.json({
            success: true,
            sku,
            data: { goat, kickscrew, flightclub, stadiumgoods },
            meta: { duration, timestamp: new Date().toISOString() },
        });
        exitAfterResponse(res);
    } catch (error) {
        console.error("[SCRAPER] Prices scrape error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        exitAfterResponse(res);
    }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
    console.log(`[SCRAPER] Received ${signal}, shutting down...`);
    isShuttingDown = true;

    try {
        await closeBrowser();
    } catch (error) {
        console.error(`[SCRAPER] Error closing browser:`, error);
    }

    process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", async (error) => {
    console.error("[SCRAPER] Uncaught exception:", error);
    await closeBrowser().catch(() => {});
    process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
    console.error("[SCRAPER] Unhandled rejection:", reason);
    await closeBrowser().catch(() => {});
    process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`[SCRAPER] 🚀 KickRax Scraper running on port ${PORT}`);
});

server.keepAliveTimeout = 0;
server.headersTimeout = 0;
