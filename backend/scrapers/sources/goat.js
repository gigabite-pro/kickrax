import { SOURCES } from "../../types.js";
import { generateListingId, USD_TO_CAD_RATE } from "../types.js";
import { launchBrowser, createPage, checkAbort, sleepWithAbort } from "../browser.js";
import { executeBrowserQL, isBrowserQLConfigured } from "../browserql.js";
import * as cheerio from "cheerio";
/**
 * Scrape GOAT by SKU using an existing page. Does not close page/browser.
 * Uses BrowserQL if configured, otherwise uses the provided page.
 */
export async function scrapeGoatBySkuInPage(page, sku, signal) {
    if (isBrowserQLConfigured()) {
        console.log(`[GOAT] Using BrowserQL`);
        return await searchGoatBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    console.log(`[GOAT] Using Puppeteer to search for SKU: ${sku}`);
    try {
        checkAbort(signal, "GOAT");
        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-CA,en;q=0.9",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        });
        // Step 1: Search GOAT
        const searchUrl = `https://www.goat.com/en-ca/search?query=${encodeURIComponent(sku)}&pageNumber=1`;
        checkAbort(signal, 'GOAT');
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await sleepWithAbort(2000, signal, 'GOAT');
        // Step 2: Find product link
        const skuLower = sku.toLowerCase().replace(/-/g, "");
        const productUrl = await page.evaluate((skuLower) => {
            const links = Array.from(document.querySelectorAll('a[href*="/sneakers/"]'));
            for (const link of links) {
                const href = link.getAttribute("href") || "";
                if (href.toLowerCase().replace(/-/g, "").includes(skuLower)) {
                    return href.startsWith("http") ? href : `https://www.goat.com${href}`;
                }
            }
            const gridCards = Array.from(document.querySelectorAll('[data-qa="grid_cell_product"], [class*="ProductCard"]'));
            for (const card of gridCards) {
                const link = card.querySelector('a[href*="/sneakers/"]');
                if (link) {
                    const href = link.getAttribute("href") || "";
                    return href.startsWith("http") ? href : `https://www.goat.com${href}`;
                }
            }
            const mainContent = document.querySelector('main, [class*="SearchResults"]');
            if (mainContent) {
                const link = mainContent.querySelector('a[href*="/sneakers/"]');
                if (link) {
                    const href = link.getAttribute("href") || "";
                    return href.startsWith("http") ? href : `https://www.goat.com${href}`;
                }
            }
            return null;
        }, skuLower);
        if (!productUrl) {
            console.log("[GOAT] No product found");
            return null;
        }
        console.log(`[GOAT] Found: ${productUrl}`);
        // Step 3: Navigate to product page
        checkAbort(signal, 'GOAT');
        await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await sleepWithAbort(2000, signal, 'GOAT');
        // Scroll to trigger lazy loading
        for (let i = 0; i < 3; i++) {
            checkAbort(signal, 'GOAT');
            await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), 300);
            await sleepWithAbort(300, signal, 'GOAT');
        }
        checkAbort(signal, 'GOAT');
        await page.evaluate(() => {
            const buyBar = document.querySelector('[data-qa="buy_bar_desktop"]');
            if (buyBar)
                buyBar.scrollIntoView({ behavior: "instant", block: "center" });
        });
        await sleepWithAbort(1500, signal, 'GOAT');
        // Try clicking swiper
        try {
            checkAbort(signal, 'GOAT');
            const swiperWrapper = await page.$('[data-qa="buy_bar_desktop"] .swiper-wrapper');
            if (swiperWrapper) {
                await swiperWrapper.click();
                await sleepWithAbort(1000, signal, 'GOAT');
            }
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
        }
        // Wait for size items
        try {
            await page.waitForSelector('[data-qa="buy_bar_item_desktop"]', { timeout: 5000 });
        }
        catch (e) { }
        // Extract sizes
        const extractedData = await page.evaluate(() => {
            const items = document.querySelectorAll('[data-qa="buy_bar_item_desktop"]');
            const sizes = [];
            const seen = new Set();
            items.forEach((item) => {
                const sizeEl = item.querySelector('[data-qa^="buy_bar_size_"]');
                const priceEl = item.querySelector('[data-qa^="buy_bar_price_size_"]');
                const oosEl = item.querySelector('[data-qa="buy_bar_oos"]');
                const sizeText = sizeEl?.textContent?.trim() || "";
                const priceText = priceEl?.textContent?.trim() || null;
                const isOOS = !!oosEl;
                if (sizeText && !seen.has(sizeText)) {
                    seen.add(sizeText);
                    sizes.push({ size: sizeText, price: isOOS ? null : priceText });
                }
            });
            const productName = document.querySelector('h1[data-qa="product_display_name"]')?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "Unknown Product";
            const imageEl = document.querySelector('[data-qa="grid_cell_product_image"] img');
            return { productName, imageUrl: imageEl?.src || "", sizes, itemCount: items.length };
        });
        // Convert to our format
        const sizes = [];
        for (const item of extractedData.sizes) {
            if (item.price) {
                const priceMatch = item.price.match(/C?\$?([\d,]+)/);
                if (priceMatch) {
                    const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""));
                    sizes.push({
                        size: item.size,
                        price: Math.round(priceCAD / USD_TO_CAD_RATE),
                        priceCAD,
                    });
                }
            }
        }
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
        console.log(`[GOAT] Found ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[GOAT] Sizes: ${sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }
        return {
            productName: extractedData.productName,
            productUrl,
            imageUrl: extractedData.imageUrl,
            sizes,
        };
    }
    catch (error) {
        if (error instanceof Error && error.message === "ABORTED")
            throw error;
        console.error("[GOAT] Error:", error);
        return null;
    }
}
/**
 * Search GOAT by SKU using BrowserQL
 */
export async function searchGoatBySkuBrowserQL(sku, signal) {
    if (!isBrowserQLConfigured()) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }

    checkAbort(signal, "GOAT");
    console.log(`[GOAT] Using BrowserQL to search for SKU: ${sku}`);

    const searchUrl = `https://www.goat.com/en-ca/search?query=${encodeURIComponent(sku)}&pageNumber=1`;

    const mutation = `
        mutation ScrapeGOAT($searchUrl: String!) {
            viewport(width: 1366, height: 768) {
                width
                height
                time
            }
            goto(url: $searchUrl, waitUntil: networkIdle) {
                status
            }
            waitForSearch: waitForTimeout(time: 3000) {
                time
            }
            waitForGrid: waitForSelector(selector: "a[class*='GridCellLink__Link'][href*='/sneakers/']", timeout: 10000) {
                time
            }
            waitForLayoutStable: waitForTimeout(time: 3000) {
                time
            }
            clickFirstProduct: click(selector: "a[class*='GridCellLink__Link'][href*='/sneakers/']") {
                x
                y
            }
            waitForNavigation: waitForTimeout(time: 2000) {
                time
            }
            waitForProductPage: waitForTimeout(time: 5000) {
                time
            }
            waitForBuyBar: waitForSelector(selector: "[data-qa='buy_bar_desktop']", timeout: 10000) {
                time
            }
            waitForStability: waitForTimeout(time: 3000) {
                time
            }
            waitForSwiper: waitForSelector(selector: "[data-qa='buy_bar_desktop'] .swiper-wrapper", timeout: 5000) {
                time
            }
            waitForSwiperStable: waitForTimeout(time: 2000) {
                time
            }
            clickSwiper: click(selector: "[data-qa='buy_bar_desktop'] .swiper-wrapper") {
                x
                y
            }
            waitForSizes: waitForTimeout(time: 1500) {
                time
            }
            waitForBuyBarItems: waitForSelector(selector: "[data-qa='buy_bar_item_desktop']", timeout: 5000) {
                time
            }
            sizeTexts: querySelectorAll(selector: "[data-qa^='buy_bar_size_']") {
                text: innerText
            }
            priceTexts: querySelectorAll(selector: "[data-qa^='buy_bar_price_size_']") {
                text: innerText
            }
            oosTexts: querySelectorAll(selector: "[data-qa='buy_bar_oos']") {
                text: innerText
            }
            productName: querySelector(selector: "h1[data-qa='product_display_name'], h1") {
                text: innerText
            }
            productImageSrc: querySelector(selector: "img[alt]") {
                html: outerHTML
            }
            currentUrl: url {
                url
            }
        }
    `;

    try {
        const data = await executeBrowserQL(mutation, { searchUrl });
        checkAbort(signal, "GOAT");

        // Deduplicate sizes and prices
        const uniqueSizes = [...new Set(data.sizeTexts.map(s => s.text))];
        const uniquePrices = [...new Set(data.priceTexts.map(p => p.text))];

        // Match sizes with prices (need to handle OOS items)
        const parsedSizes = uniqueSizes.map(size => {
            // Find matching price by index
            const sizeIndex = data.sizeTexts.findIndex(s => s.text === size);
            const priceText = sizeIndex >= 0 && sizeIndex < data.priceTexts.length 
                ? data.priceTexts[sizeIndex]?.text 
                : null;
            const isOOS = !priceText;
            
            return {
                size: size,
                price: priceText || 'Offer',
                outOfStock: isOOS
            };
        });

        // Process sizes - convert to our format
        const sizes = [];
        for (const item of parsedSizes) {
            if (item.outOfStock) continue; // Skip OOS items
            
            const priceText = item.price;
            const priceMatch = priceText.match(/C?\$?([\d,]+)/);
            if (priceMatch) {
                const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""), 10);
                sizes.push({
                    size: item.size.trim(),
                    price: Math.round(priceCAD / USD_TO_CAD_RATE),
                    priceCAD,
                });
            }
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        // Extract image src
        const imgMatch = data.productImageSrc?.html?.match(/src="([^"]+)"/);
        const imageUrl = imgMatch ? imgMatch[1] : "";
        const productName = data.productName?.text?.trim() || "Unknown Product";
        const productUrl = data.currentUrl?.url || "";

        console.log(`[GOAT] BrowserQL extracted: ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[GOAT] Sizes: ${sizes.map((s) => `${s.size}=$${s.priceCAD}`).join(", ")}`);
        }

        return {
            productName,
            productUrl,
            imageUrl,
            sizes,
        };
    } catch (error) {
        if (error instanceof Error && error.message === "ABORTED") {
            throw error;
        }
        // Only log non-429 errors (429s are expected rate limits)
        if (error?.status !== 429 && !error?.message?.includes("429")) {
            console.error("[GOAT] BrowserQL error:", error);
        }
        throw error;
    }
}

/**
 * Search GOAT by SKU (standalone: launches and closes browser).
 * Uses BrowserQL if configured, otherwise falls back to Puppeteer.
 */
export async function searchGoatBySku(sku, signal) {
    // Use BrowserQL if configured
    if (isBrowserQLConfigured()) {
        return await searchGoatBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    const browser = await launchBrowser();
    try {
        const page = await createPage(browser);
        return await scrapeGoatBySkuInPage(page, sku, signal);
    }
    finally {
        await browser.close().catch(() => { });
    }
}
/**
 * Legacy search function for backwards compatibility
 */
export async function searchGOAT(query) {
    const source = SOURCES.goat;
    const result = await searchGoatBySku(query);
    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }
    const listings = result.sizes.map((sizeData, index) => ({
        id: generateListingId("goat", `${index}`),
        name: `${result.productName} - Size ${sizeData.size}`,
        brand: "Unknown",
        colorway: "",
        sku: "",
        imageUrl: result.imageUrl,
        retailPrice: null,
        condition: "new",
        source,
        price: sizeData.price,
        currency: "USD",
        priceCAD: sizeData.priceCAD,
        url: result.productUrl,
        lastUpdated: new Date(),
    }));
    return { success: true, listings, source };
}
/**
 * Search GOAT by SKU and return SourcePricing format
 */
export async function searchGOATBySku(sku) {
    const source = SOURCES.goat;
    const result = await searchGoatBySku(sku);
    if (!result || result.sizes.length === 0) {
        return { source, sizes: [], lowestPrice: 0, available: false };
    }
    const sizes = result.sizes.map((s) => ({
        size: s.size,
        price: s.price,
        priceCAD: s.priceCAD,
        currency: "USD",
        url: `${result.productUrl}?size=${s.size}`,
        available: true,
    }));
    const lowestPrice = Math.min(...sizes.map((s) => s.priceCAD));
    return { source, sizes, lowestPrice, available: true };
}
//# sourceMappingURL=goat.js.map