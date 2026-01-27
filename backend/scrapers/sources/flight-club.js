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

    const searchMutation = `
        mutation SearchFlightClub($searchUrl: String!) {
            goto(url: $searchUrl, waitUntil: networkIdle) {
                status
            }
            waitForSelector(selector: "a[data-qa='ProductItemsUrl']") {
                time
            }
            querySelectorAll(selector: "a[data-qa='ProductItemsUrl']") {
                outerHTML
            }
        }
    `;

    try {
        const response = await executeBrowserQL(searchMutation, { searchUrl });
        checkAbort(signal, "FLIGHTCLUB");

        // Parse product URLs from outerHTML
        const products = response.querySelectorAll || [];
        const hrefs = products.map(product => {
            const match = product.outerHTML?.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }).filter(Boolean);

        if (hrefs.length === 0) {
            console.log("[FLIGHTCLUB] No product found");
            return { source: SOURCES["flight-club"], sizes: [], lowestPrice: 0, available: false };
        }

        // Use first product (or could match by SKU if needed)
        const href = hrefs[0];
        const productTemplateId = href.replace(/^\//, "");
        const productUrl = `https://www.flightclub.com${href}`;
        console.log(`[FLIGHTCLUB] Found product href: ${href}`);
        console.log(`[FLIGHTCLUB] Product URL: ${productUrl}`);
        console.log(`[FLIGHTCLUB] Product template ID: ${productTemplateId}`);

        // URL-encode productTemplateId to ensure it's passed correctly
        const apiUrl = `https://www.flightclub.com/web-api/v1/product_variants?countryCode=CA&productTemplateId=${encodeURIComponent(productTemplateId)}&currency=CAD`;
        console.log(`[FLIGHTCLUB] API URL: ${apiUrl}`);
        console.log(`[FLIGHTCLUB] Using Puppeteer with stealth to navigate directly to API URL...`);

        // Use Puppeteer with stealth route to navigate directly to API URL
        const browser = await launchBrowser();
        let rawData;
        try {
            const page = await createPage(browser, "FLIGHTCLUB");
            checkAbort(signal, "FLIGHTCLUB");

            // Set headers for API request
            await page.setExtraHTTPHeaders({
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
                "x-goat-app": "sneakers",
                "x-goat-sales-channel": "2",
            });

            // Navigate directly to API URL using stealth browser
            console.log(`[FLIGHTCLUB] Navigating to API URL...`);
            const response = await page.goto(apiUrl, { 
                waitUntil: "networkidle2", 
                timeout: 60000 
            });
            checkAbort(signal, "FLIGHTCLUB");

            if (!response || !response.ok()) {
                const status = response?.status() || "unknown";
                const statusText = response?.statusText() || "unknown";
                const responseText = await response?.text().catch(() => "");
                throw new Error(`API request failed: ${status} ${statusText} - ${responseText.substring(0, 200)}`);
            }

            // Extract JSON from response
            rawData = await response.json();

            console.log(`[FLIGHTCLUB] API Response Data:`, JSON.stringify(rawData, null, 2).substring(0, 1000));
            console.log(`[FLIGHTCLUB] API Response Type:`, Array.isArray(rawData) ? "Array" : typeof rawData);

            await page.close().catch(() => {});
        } catch (apiError) {
            console.log(`[FLIGHTCLUB] Puppeteer API call failed:`, apiError.message);
            console.log(`[FLIGHTCLUB] Error stack:`, apiError.stack);
            return { source: SOURCES["flight-club"], sizes: [], lowestPrice: 0, available: false };
        } finally {
            await browser.close().catch(() => {});
        }
        const variants = Array.isArray(rawData) ? rawData : rawData?.productVariants || [];
        console.log(`[FLIGHTCLUB] Extracted ${variants.length} variants from API response`);
        if (variants.length > 0) {
            console.log(`[FLIGHTCLUB] First variant sample:`, JSON.stringify(variants[0], null, 2).substring(0, 500));
        }

        // Process variants
        const sizeMap = new Map();
        for (const variant of variants) {
            console.log(`[FLIGHTCLUB] Processing variant:`, {
                size: variant.size,
                currency: variant.lowestPriceCents?.currency,
                amount: variant.lowestPriceCents?.amount,
            });
            if (variant.lowestPriceCents?.currency === "CAD" && variant.lowestPriceCents?.amount) {
                const priceCAD = Math.round(variant.lowestPriceCents.amount / 100);
                const size = String(variant.size);
                const existing = sizeMap.get(size);
                if (!existing || priceCAD < existing) {
                    sizeMap.set(size, priceCAD);
                    console.log(`[FLIGHTCLUB] Added size ${size} at $${priceCAD} CAD`);
                }
            } else {
                console.log(`[FLIGHTCLUB] Skipping variant - missing price data or wrong currency`);
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

        console.log(`[FLIGHTCLUB] Final result: ${sizes.length} sizes, lowest price: $${lowestPrice} CAD`);
        if (sizes.length > 0) {
            console.log(`[FLIGHTCLUB] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        } else {
            console.log(`[FLIGHTCLUB] No sizes found - check variant processing above`);
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