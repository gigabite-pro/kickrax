import "./load-env.js";
import express from "express";
import cors from "cors";
import { searchStockXCatalog, fetchStockXCatalogInBrowser, fetchStockXProductInPage, getProductDataWithPrices } from "./scrapers/sources/stockx.js";
import { searchGoatBySku, scrapeGoatBySkuInPage } from "./scrapers/sources/goat.js";
import { searchKickscrewBySku, scrapeKickscrewBySkuInPage } from "./scrapers/sources/kickscrew.js";
import { searchFlightClubBySku, scrapeFlightClubBySkuInPage } from "./scrapers/sources/flight-club.js";
import { searchStadiumGoodsBySku, scrapeStadiumGoodsBySkuInPage } from "./scrapers/sources/stadiumgoods.js";
import { withSearchSession, acquireBrowserForProduct, releaseSessionForProduct } from "./search-session.js";
import { createPage, isBrowserlessConfigured, getBrowserlessStealthRoute } from "./scrapers/browser.js";
import { isBrowserQLConfigured } from "./scrapers/browserql.js";
import { getTrendingCache, setTrendingCache, isRedisConfigured } from "./db/redis.js";
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

/** Extract a short message from Error, ErrorEvent (e.g. ws), or unknown. */
function toErrorMessage(err) {
    if (err instanceof Error) return err.message;
    const inner = err?.error ?? err?.cause;
    if (inner instanceof Error) return inner.message;
    if (typeof err?.message === "string") return err.message;
    return String(err);
}
// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
/**
 * Search API - Returns StockX results only (max 50 products).
 * Uses session browser; keeps it open 30s for potential product click.
 */
app.get("/api/search", async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }
    const normalizedQuery = query.trim();
    const startTime = Date.now();
    try {
        console.log(`[API] Searching StockX for: ${normalizedQuery}`);
        const products = await withSearchSession((browser) => fetchStockXCatalogInBrowser(browser, normalizedQuery));
        const duration = Date.now() - startTime;
        console.log(`[API] Found ${products.length} products in ${duration}ms (browser kept open 30s for product click)`);
        res.json({
            query: normalizedQuery,
            products,
            meta: {
                total: products.length,
                timestamp: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        console.error("[API] Search error:", error instanceof Error ? error.message : error);
        res.status(500).json({
            error: "Failed to search",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * Trending API - Returns most active sneakers from StockX.
 * Uses Redis cache (6h TTL) when configured: hit → return cached; miss → fetch, store, return.
 */
app.get("/api/trending", async (req, res) => {
    const startTime = Date.now();
    try {
        console.log(`[API] GET /api/trending`);
        if (isRedisConfigured()) {
            const cached = await getTrendingCache();
            if (cached) {
                const duration = Date.now() - startTime;
                console.log(`[API] Trending served from cache: ${cached.products.length} products in ${duration}ms`);
                return res.json({
                    ...cached,
                    meta: { ...cached.meta, cached: true },
                });
            }
            console.log(`[API] Trending cache miss, fetching from StockX...`);
        }
        else {
            console.log(`[API] Redis not configured, fetching trending from StockX...`);
        }
        const products = await searchStockXCatalog(undefined, "most-active");
        const fetchDuration = Date.now() - startTime;
        console.log(`[API] StockX trending: ${products.length} products in ${fetchDuration}ms`);
        const payload = {
            products,
            meta: {
                total: products.length,
                timestamp: new Date().toISOString(),
                cached: false,
            },
        };
        await setTrendingCache({
            products: payload.products,
            meta: { total: payload.meta.total, timestamp: payload.meta.timestamp },
        });
        const totalDuration = Date.now() - startTime;
        console.log(`[API] Trending response sent: ${products.length} products, total ${totalDuration}ms`);
        res.json(payload);
    }
    catch (error) {
        console.error("[API] Trending error:", error instanceof Error ? error.message : error);
        res.status(500).json({
            error: "Failed to fetch trending",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * Get Style ID AND prices from a StockX product page
 */
app.get("/api/product/style", async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[API] Style ID request aborted for: ${url}`);
        }
    });
    try {
        console.log(`[API] Getting Style ID and prices from: ${url}`);
        const productData = await getProductDataWithPrices(url, signal);
        if (signal.aborted)
            return;
        console.log(`[API] Style ID: ${productData.styleId}, Sizes: ${productData.sizes.length}`);
        res.json({
            url,
            styleId: productData.styleId,
            stockxPrices: productData,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        if (signal.aborted)
            return;
        console.error("[API] Style ID error:", error instanceof Error ? error.message : error);
        res.status(500).json({
            error: "Failed to get Style ID",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * All-in-one: StockX product page + GOAT/KicksCrew/FlightClub/StadiumGoods.
 * Uses ONE browser, 5 tabs. Streams SSE events as each source completes so the
 * UI can show prices as soon as any one source returns.
 */
app.get("/api/product/all-prices", async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }
    const signal = { aborted: false };
    req.on("close", () => {
        if (!res.writableEnded)
            signal.aborted = true;
    });
    const startTime = Date.now();
    const writeEvent = (event, data) => {
        if (res.writableEnded || signal.aborted)
            return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();

        const runAndEmit = async (source, fn) => {
            try {
                const data = await fn();
                if (signal.aborted) return;
                const payload = {};
                if (source === "flightclub") {
                    const d = data;
                    const sizes = d?.sizes ?? [];
                    payload[source] = sizes.length
                        ? { productName: "", productUrl: sizes[0]?.url ?? "", imageUrl: "", sizes: sizes.map((s) => ({ size: s.size, price: s.price, priceCAD: s.priceCAD })) }
                        : null;
                } else if (source === "stadiumgoods") {
                    const d = data;
                    const sizes = d?.sizes ?? [];
                    payload[source] = sizes.length
                        ? { productName: "", productUrl: sizes[0]?.url ?? "", imageUrl: "", sizes: sizes.map((s) => ({ size: s.size, price: s.price, priceCAD: s.priceCAD })) }
                        : null;
                } else {
                    payload[source] = data;
                }
                writeEvent("update", payload);
                console.log(`[API] All-prices: ${source} streamed`);
            } catch (e) {
                if (signal.aborted) return;
                writeEvent("update", { [source]: null });
            }
        };

        if (isBrowserQLConfigured()) {
            // BrowserQL: simple POST only, no browser
            const stockxData = await fetchStockXProductInPage(null, url, signal);
            const styleId = stockxData?.styleId ?? "";
            if (signal.aborted) return;
            writeEvent("update", {
                styleId: stockxData.styleId,
                stockx: {
                    productName: stockxData.productName,
                    productUrl: stockxData.productUrl,
                    imageUrl: stockxData.imageUrl,
                    sizes: stockxData.sizes,
                },
            });
            console.log(`[API] All-prices: StockX streamed (${stockxData?.sizes?.length ?? 0} sizes)`);
            const sku = styleId.trim().length >= 3 ? styleId : "";
            await runAndEmit("goat", () => scrapeGoatBySkuInPage(null, sku, signal));
            await runAndEmit("flightclub", () => scrapeFlightClubBySkuInPage(null, sku, signal));
            await runAndEmit("stadiumgoods", () => scrapeStadiumGoodsBySkuInPage(null, sku, signal));
            await runAndEmit("kickscrew", () => scrapeKickscrewBySkuInPage(null, sku, signal));
        } else {
            // Puppeteer: browser + tabs
            const browser = await acquireBrowserForProduct();
            const page1 = await createPage(browser, "STOCKX");
            const stockxData = await fetchStockXProductInPage(page1, url, signal);
            await page1.close().catch(() => {});
            const styleId = stockxData?.styleId ?? "";
            if (signal.aborted) return;
            writeEvent("update", {
                styleId: stockxData.styleId,
                stockx: {
                    productName: stockxData.productName,
                    productUrl: stockxData.productUrl,
                    imageUrl: stockxData.imageUrl,
                    sizes: stockxData.sizes,
                },
            });
            console.log(`[API] All-prices: StockX streamed (${stockxData?.sizes?.length ?? 0} sizes)`);
            const sku = styleId.trim().length >= 3 ? styleId : "";
            const runInTab = async (fn, source) => {
                const p = await createPage(browser, source);
                try {
                    return await fn(p);
                } finally {
                    await p.close().catch(() => {});
                }
            };
            await runAndEmit("goat", () => runInTab((p) => scrapeGoatBySkuInPage(p, sku, signal), "GOAT"));
            await runAndEmit("flightclub", () => runInTab((p) => scrapeFlightClubBySkuInPage(p, sku, signal), "FLIGHTCLUB"));
            await runAndEmit("stadiumgoods", () => runInTab((p) => scrapeStadiumGoodsBySkuInPage(p, sku, signal), "STADIUMGOODS"));
            await runAndEmit("kickscrew", () => runInTab((p) => scrapeKickscrewBySkuInPage(p, sku, signal), "KICKSCREW"));
        }

        if (signal.aborted) return;
        const duration = Date.now() - startTime;
        console.log(`[API] All-prices done in ${duration}ms`);
        writeEvent("done", { duration, timestamp: new Date().toISOString() });
    }
    catch (error) {
        if (!signal.aborted) {
            const msg = toErrorMessage(error);
            console.error("[API] All-prices error:", msg);
            const friendly = /429|Too Many Requests/i.test(msg)
                ? "Browserless rate limit (429). Please retry in a minute."
                : msg;
            writeEvent("error", { message: friendly });
        }
    }
    finally {
        if (!isBrowserQLConfigured()) await releaseSessionForProduct();
        if (!res.writableEnded) res.end();
    }
});
/**
 * Search GOAT + KicksCrew + FlightClub by SKU and get all size prices
 */
app.get("/api/goat/prices", async (req, res) => {
    const sku = req.query.sku;
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
        }
        else {
            console.log(`\n[GOAT] No sizes found`);
        }
        if (kickscrewResult?.sizes?.length) {
            console.log(`\n[KICKSCREW] ${kickscrewResult.sizes.length} sizes:`);
            console.log(`  ${kickscrewResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        else {
            console.log(`\n[KICKSCREW] No sizes found`);
        }
        if (flightClubResult?.sizes?.length) {
            console.log(`\n[FLIGHTCLUB] ${flightClubResult.sizes.length} sizes:`);
            console.log(`  ${flightClubResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        else {
            console.log(`\n[FLIGHTCLUB] No sizes found`);
        }
        if (stadiumGoodsResult?.sizes?.length) {
            console.log(`\n[STADIUMGOODS] ${stadiumGoodsResult.sizes.length} sizes:`);
            console.log(`  ${stadiumGoodsResult.sizes.map((s) => `${s.size}=$${s.price}`).join(", ")}`);
        }
        else {
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
    }
    catch (error) {
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
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[GOAT] Request aborted for SKU: ${sku}`);
        }
    });
    const startTime = Date.now();
    try {
        const result = await searchGoatBySku(sku, signal);
        if (signal.aborted)
            return;
        const duration = Date.now() - startTime;
        res.json({ source: "goat", sku, data: result, duration });
    }
    catch (error) {
        if (!signal.aborted)
            res.status(500).json({ source: "goat", error: "Failed to fetch" });
    }
});
// KicksCrew prices
app.get("/api/prices/kickscrew", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[KICKSCREW] Request aborted for SKU: ${sku}`);
        }
    });
    const startTime = Date.now();
    try {
        const result = await searchKickscrewBySku(sku, signal);
        if (signal.aborted)
            return;
        const duration = Date.now() - startTime;
        res.json({ source: "kickscrew", sku, data: result, duration });
    }
    catch (error) {
        if (!signal.aborted)
            res.status(500).json({ source: "kickscrew", error: "Failed to fetch" });
    }
});
// Flight Club prices
app.get("/api/prices/flightclub", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[FLIGHTCLUB] Request aborted for SKU: ${sku}`);
        }
    });
    const startTime = Date.now();
    try {
        const result = await searchFlightClubBySku(sku, signal);
        if (signal.aborted)
            return;
        const duration = Date.now() - startTime;
        res.json({ source: "flightclub", sku, data: result, duration });
    }
    catch (error) {
        if (!signal.aborted)
            res.status(500).json({ source: "flightclub", error: "Failed to fetch" });
    }
});
// Stadium Goods prices
app.get("/api/prices/stadiumgoods", async (req, res) => {
    const sku = req.query.sku;
    if (!sku || sku.trim().length < 3) {
        return res.status(400).json({ error: "Valid SKU required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[STADIUMGOODS] Request aborted for SKU: ${sku}`);
        }
    });
    const startTime = Date.now();
    try {
        const result = await searchStadiumGoodsBySku(sku, signal);
        if (signal.aborted)
            return;
        const duration = Date.now() - startTime;
        res.json({ source: "stadiumgoods", sku, data: result, duration });
    }
    catch (error) {
        if (!signal.aborted)
            res.status(500).json({ source: "stadiumgoods", error: "Failed to fetch" });
    }
});
// StockX prices (uses URL instead of SKU since we need to be on the page)
app.get("/api/prices/stockx", async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes("stockx.com")) {
        return res.status(400).json({ error: "Valid StockX URL required" });
    }
    const signal = { aborted: false };
    req.on('close', () => {
        if (!res.writableEnded) {
            signal.aborted = true;
            console.log(`[STOCKX] Request aborted for URL: ${url}`);
        }
    });
    const startTime = Date.now();
    try {
        const result = await getProductDataWithPrices(url, signal);
        if (signal.aborted)
            return;
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
    }
    catch (error) {
        if (!signal.aborted)
            res.status(500).json({ source: "stockx", error: "Failed to fetch" });
    }
});
/**
 * Get prices from all sources (GOAT + KicksCrew + FlightClub) by SKU
 */
app.get("/api/prices", async (req, res) => {
    const sku = req.query.sku;
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
        }
        else {
            console.log(`\n[GOAT] No sizes found`);
        }
        if (kickscrewResult?.sizes?.length) {
            console.log(`\n[KICKSCREW] ${kickscrewResult.sizes.length} sizes:`);
            console.log(`  ${kickscrewResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        else {
            console.log(`\n[KICKSCREW] No sizes found`);
        }
        if (flightClubResult?.sizes?.length) {
            console.log(`\n[FLIGHTCLUB] ${flightClubResult.sizes.length} sizes:`);
            console.log(`  ${flightClubResult.sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        else {
            console.log(`\n[FLIGHTCLUB] No sizes found`);
        }
        if (stadiumGoodsResult?.sizes?.length) {
            console.log(`\n[STADIUMGOODS] ${stadiumGoodsResult.sizes.length} sizes:`);
            console.log(`  ${stadiumGoodsResult.sizes.map((s) => `${s.size}=$${s.price}`).join(", ")}`);
        }
        else {
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
    }
    catch (error) {
        console.error("Prices API error:", error);
        res.status(500).json({
            error: "Failed to fetch prices",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`\nConfig:`);
    console.log(`  Redis (trending cache): ${isRedisConfigured() ? "✓ configured" : "✗ not configured"}`);
    const bl = isBrowserlessConfigured();
    const blRoute = getBrowserlessStealthRoute();
    console.log(`  Browserless (scraping): ${bl ? (blRoute ? `✓ configured (stealth: /${blRoute})` : "✓ configured") : "✗ not configured"}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /api/search?q=jordan+1        - Search StockX`);
    console.log(`  GET /api/product/style?url=...    - Get Style ID from product page`);
    console.log(`  GET /api/product/all-prices?url=... - StockX + GOAT + KicksCrew + FC + SG (1 browser, 5 tabs)`);
    console.log(`  GET /api/goat/prices?sku=...      - Get GOAT prices by SKU`);
    console.log(`  GET /api/kickscrew/prices?sku=... - Get KicksCrew prices by SKU`);
    console.log(`  GET /api/prices?sku=...           - Get all prices by SKU`);
    console.log(`  GET /api/health                   - Health check`);
});
//# sourceMappingURL=index.js.map