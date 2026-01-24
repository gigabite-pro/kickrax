import { SOURCES } from "../../types.js";
import { generateListingId } from "../types.js";
import { launchBrowser, createPage, checkAbort, sleepWithAbort } from "../browser.js";
/**
 * Scrape Flight Club by SKU using an existing page. Does not close page/browser.
 */
export async function scrapeFlightClubBySkuInPage(page, sku, signal) {
    const source = SOURCES["flight-club"];
    console.log(`[FLIGHTCLUB] Searching for SKU: ${sku}`);
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
 * Search Flight Club by SKU (standalone: launches and closes browser).
 */
export async function searchFlightClubBySku(sku, signal) {
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