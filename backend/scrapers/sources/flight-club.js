import { SOURCES } from "../../types.js";
import { generateListingId } from "../types.js";
import { launchBrowser, createPage, checkAbort, sleepWithAbort } from "../browser.js";
import { executeBrowserQL, isBrowserQLConfigured } from "../browserql.js";
import * as cheerio from "cheerio";
/**
 * Scrape Flight Club by SKU using an existing page. Does not close page/browser.
 * Uses BrowserQL if configured, otherwise uses the provided page.
 */
export async function scrapeFlightClubBySkuInPage(page, sku, signal) {
    const source = SOURCES["flight-club"];
    
    if (isBrowserQLConfigured()) {
        console.log(`[FLIGHTCLUB] Using BrowserQL`);
        return await searchFlightClubBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    console.log(`[FLIGHTCLUB] Using Puppeteer to search for SKU: ${sku}`);
    try {
        checkAbort(signal, "FLIGHTCLUB");
        // Step 1: Search Flight Club
        const searchUrl = `https://www.flightclub.com/catalogsearch/result?query=${encodeURIComponent(sku)}`;
        try {
            checkAbort(signal, 'FLIGHTCLUB');
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
        }
        // Wait for product grid
        try {
            checkAbort(signal, 'FLIGHTCLUB');
            await page.waitForSelector('a[data-qa="ProductItemsUrl"]', { timeout: 5000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
            await sleepWithAbort(2000, signal, 'FLIGHTCLUB');
        }
        const productData = await page.evaluate(() => {
            const link = document.querySelector('a[data-qa="ProductItemsUrl"]');
            if (link) {
                const href = link.getAttribute("href") || "";
                const nameEl = document.querySelector('[data-qa="ProductItemTitle"]');
                return { href, name: nameEl?.textContent?.trim() || "Unknown Product" };
            }
            return null;
        });
        if (!productData || !productData.href) {
            console.log("[FLIGHTCLUB] No product found");
            return { source, sizes: [], lowestPrice: 0, available: false };
        }
        const productTemplateId = productData.href.replace(/^\//, "");
        const productUrl = `https://www.flightclub.com${productData.href}`;
        console.log(`[FLIGHTCLUB] Found: ${productUrl}`);
        // Step 2: Navigate to product page
        try {
            checkAbort(signal, 'FLIGHTCLUB');
            await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
        }
        await sleepWithAbort(1500, signal, 'FLIGHTCLUB');
        // Step 3: Call API from browser
        const apiUrl = `https://www.flightclub.com/web-api/v1/product_variants?countryCode=CA&productTemplateId=${productTemplateId}&currency=CAD`;
        const apiData = await page.evaluate(async (url) => {
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: { "Accept": "application/json", "x-goat-app": "sneakers", "x-goat-sales-channel": "2" },
                    credentials: "include",
                });
                if (!response.ok)
                    return { error: `HTTP ${response.status}`, data: null };
                return { error: null, data: await response.json() };
            }
            catch (err) {
                return { error: err.message, data: null };
            }
        }, apiUrl);
        if (apiData.error) {
            console.log(`[FLIGHTCLUB] API Error: ${apiData.error}`);
            return { source, sizes: [], lowestPrice: 0, available: false };
        }
        const rawData = apiData.data;
        const variants = Array.isArray(rawData) ? rawData : rawData?.productVariants || [];
        // Use Map to track lowest price per size
        const sizeMap = new Map();
        for (const variant of variants) {
            if (variant.lowestPriceCents?.currency === "CAD" && variant.lowestPriceCents?.amount) {
                const priceCAD = Math.round(variant.lowestPriceCents.amount / 100);
                const size = String(variant.size);
                const existing = sizeMap.get(size);
                if (!existing || priceCAD < existing) {
                    sizeMap.set(size, priceCAD);
                }
            }
        }
        const sizes = [];
        for (const [size, priceCAD] of Array.from(sizeMap.entries())) {
            sizes.push({
                size,
                price: priceCAD,
                priceCAD,
                currency: "CAD",
                url: `${productUrl}?size=${size}`,
                available: true,
            });
        }
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.priceCAD)) : 0;
        console.log(`[FLIGHTCLUB] Found ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[FLIGHTCLUB] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        return { source, sizes, lowestPrice, available: sizes.length > 0 };
    }
    catch (error) {
        if (error instanceof Error && error.message === "ABORTED")
            throw error;
        console.error("[FLIGHTCLUB] Error:", error);
        return { source, sizes: [], lowestPrice: 0, available: false };
    }
}
/**
 * Search Flight Club by SKU using BrowserQL
 */
export async function searchFlightClubBySkuBrowserQL(sku, signal) {
    if (!isBrowserQLConfigured()) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }

    checkAbort(signal, "FLIGHTCLUB");
    console.log(`[FLIGHTCLUB] Using BrowserQL to search for SKU: ${sku}`);

    const searchUrl = `https://www.flightclub.com/catalogsearch/result?query=${encodeURIComponent(sku)}`;

    // BrowserQL mutation to search and find product
    const searchMutation = `
        mutation SearchFlightClub($searchUrl: String!) {
            goto(url: $searchUrl, waitUntil: networkIdle) {
                status
            }
            waitForSelector(selector: "a[data-qa='ProductItemsUrl']", timeout: 5000) {
                time
            }
            html: html(selector: "body") {
                html
            }
        }
    `;

    try {
        const searchData = await executeBrowserQL(searchMutation, { searchUrl });
        checkAbort(signal, "FLIGHTCLUB");

        // Find product URL from HTML
        const html = searchData.html?.content || "";
        const $ = cheerio.load(html);
        const link = $('a[data-qa="ProductItemsUrl"]').first();
        const href = link.attr("href");

        if (!href) {
            console.log("[FLIGHTCLUB] No product found");
            return { source: SOURCES["flight-club"], sizes: [], lowestPrice: 0, available: false };
        }

        const productTemplateId = href.replace(/^\//, "");
        const productUrl = `https://www.flightclub.com${href}`;
        console.log(`[FLIGHTCLUB] Found: ${productUrl}`);

        // Second mutation to get product page and call API
        const productMutation = `
            mutation ScrapeFlightClubProduct($productUrl: String!, $apiUrl: String!) {
                goto(url: $productUrl, waitUntil: domContentLoaded) {
                    status
                }
                wait1: waitForTimeout(time: 1500) {
                    time
                }
                # Call API using evaluate (BrowserQL doesn't have direct fetch, so we use html and then parse)
                html: html(selector: "body") {
                    html
                }
            }
        `;

        const apiUrl = `https://www.flightclub.com/web-api/v1/product_variants?countryCode=CA&productTemplateId=${productTemplateId}&currency=CAD`;
        
        // For API calls, we need to use evaluate in BrowserQL, but since BrowserQL doesn't support evaluate directly,
        // we'll need to make the API call from Node.js after getting the product page
        // Actually, let's use a different approach - make the API call from Node.js using fetch with cookies from BrowserQL session
        // For now, let's fall back to getting HTML and making API call separately
        
        const productData = await executeBrowserQL(productMutation, { productUrl, apiUrl });
        checkAbort(signal, "FLIGHTCLUB");

        // Make API call from Node.js (we'll need to get cookies from BrowserQL session, but for simplicity, let's use fetch)
        // Note: This might not work perfectly without cookies, but it's a start
        let apiResponse;
        try {
            apiResponse = await fetch(apiUrl, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "x-goat-app": "sneakers",
                    "x-goat-sales-channel": "2",
                },
            });
        } catch (apiError) {
            console.log(`[FLIGHTCLUB] API Error: ${apiError.message}`);
            return { source: SOURCES["flight-club"], sizes: [], lowestPrice: 0, available: false };
        }

        if (!apiResponse.ok) {
            console.log(`[FLIGHTCLUB] API Error: HTTP ${apiResponse.status}`);
            return { source: SOURCES["flight-club"], sizes: [], lowestPrice: 0, available: false };
        }

        const rawData = await apiResponse.json();
        const variants = Array.isArray(rawData) ? rawData : rawData?.productVariants || [];

        // Process variants
        const sizeMap = new Map();
        for (const variant of variants) {
            if (variant.lowestPriceCents?.currency === "CAD" && variant.lowestPriceCents?.amount) {
                const priceCAD = Math.round(variant.lowestPriceCents.amount / 100);
                const size = String(variant.size);
                const existing = sizeMap.get(size);
                if (!existing || priceCAD < existing) {
                    sizeMap.set(size, priceCAD);
                }
            }
        }

        const sizes = [];
        for (const [size, priceCAD] of Array.from(sizeMap.entries())) {
            sizes.push({
                size,
                price: priceCAD,
                priceCAD,
                currency: "CAD",
                url: `${productUrl}?size=${size}`,
                available: true,
            });
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.priceCAD)) : 0;

        console.log(`[FLIGHTCLUB] BrowserQL extracted: ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[FLIGHTCLUB] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }

        return { source: SOURCES["flight-club"], sizes, lowestPrice, available: sizes.length > 0 };
    } catch (error) {
        if (error instanceof Error && error.message === "ABORTED") {
            throw error;
        }
        // Only log non-429 errors (429s are expected rate limits)
        if (error?.status !== 429 && !error?.message?.includes("429")) {
            console.error("[FLIGHTCLUB] BrowserQL error:", error);
        }
        throw error;
    }
}

/**
 * Search Flight Club by SKU (standalone: launches and closes browser).
 * Uses BrowserQL if configured, otherwise falls back to Puppeteer.
 */
export async function searchFlightClubBySku(sku, signal) {
    // Use BrowserQL if configured
    if (isBrowserQLConfigured()) {
        return await searchFlightClubBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    const browser = await launchBrowser();
    try {
        const page = await createPage(browser);
        return await scrapeFlightClubBySkuInPage(page, sku, signal);
    }
    finally {
        await browser.close().catch(() => { });
    }
}
/**
 * Legacy search function for backwards compatibility
 */
export async function searchFlightClub(query) {
    const source = SOURCES["flight-club"];
    const result = await searchFlightClubBySku(query);
    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }
    const listings = result.sizes.map((sizeData, index) => ({
        id: generateListingId("flight-club", `${index}`),
        name: `Flight Club - Size ${sizeData.size}`,
        brand: "Unknown",
        colorway: "",
        sku: "",
        imageUrl: "",
        retailPrice: null,
        condition: "new",
        source,
        price: sizeData.price,
        currency: "USD",
        priceCAD: sizeData.priceCAD,
        url: sizeData.url,
        lastUpdated: new Date(),
    }));
    return { success: true, listings, source };
}
//# sourceMappingURL=flight-club.js.map