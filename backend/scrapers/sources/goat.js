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

    const skuLower = sku.toLowerCase().replace(/-/g, "");
    const searchUrl = `https://www.goat.com/en-ca/search?query=${encodeURIComponent(sku)}&pageNumber=1`;

    // BrowserQL mutation to search and extract product data
    const mutation = `
        mutation ScrapeGOAT($searchUrl: String!, $skuLower: String!) {
            goto(url: $searchUrl, waitUntil: networkIdle) {
                status
            }
            wait1: waitForTimeout(time: 2000) {
                time
            }
            # Extract product links
            productLinks: mapSelector(selector: "a[href*='/sneakers/']", wait: true) {
                href: attribute(name: "href") {
                    value
                }
            }
            # Get HTML for product link matching
            html: html(selector: "body") {
                html
            }
        }
    `;

    try {
        const data = await executeBrowserQL(mutation, { searchUrl, skuLower });
        checkAbort(signal, "GOAT");

        // Find product URL from HTML
        const html = data.html?.html || "";
        const $ = cheerio.load(html);
        let productUrl = null;

        $('a[href*="/sneakers/"]').each((_, el) => {
            const href = $(el).attr("href") || "";
            if (href.toLowerCase().replace(/-/g, "").includes(skuLower)) {
                productUrl = href.startsWith("http") ? href : `https://www.goat.com${href}`;
                return false;
            }
        });

        if (!productUrl) {
            console.log("[GOAT] No product found");
            return null;
        }

        console.log(`[GOAT] Found: ${productUrl}`);

        // Second mutation to get product page data
        const productMutation = `
            mutation ScrapeGOATProduct($productUrl: String!) {
                goto(url: $productUrl, waitUntil: networkIdle) {
                    status
                }
                wait1: waitForTimeout(time: 2000) {
                    time
                }
                wait2: waitForTimeout(time: 1500) {
                    time
                }
                # Click swiper wrapper if present
                clickSwiper: click(selector: "[data-qa='buy_bar_desktop'] .swiper-wrapper") {
                    x
                    y
                }
                wait3: waitForTimeout(time: 1000) {
                    time
                }
                # Wait for size items
                waitForSelector(selector: "[data-qa='buy_bar_item_desktop']", timeout: 5000) {
                    time
                }
                # Extract sizes and prices
                sizes: mapSelector(selector: "[data-qa='buy_bar_item_desktop']", wait: true) {
                    sizeText: mapSelector(selector: "[data-qa^='buy_bar_size_']") {
                        text: innerText
                    }
                    priceText: mapSelector(selector: "[data-qa^='buy_bar_price_size_']") {
                        text: innerText
                    }
                    oosElement: mapSelector(selector: "[data-qa='buy_bar_oos']") {
                        text: innerText
                    }
                }
                # Get product name and image
                productName: mapSelector(selector: "h1[data-qa='product_display_name'], h1") {
                    text: innerText
                }
                productImage: mapSelector(selector: "[data-qa='grid_cell_product_image'] img") {
                    src: attribute(name: "src") {
                        value
                    }
                }
            }
        `;

        const productData = await executeBrowserQL(productMutation, { productUrl });
        checkAbort(signal, "GOAT");

        // Process sizes
        const sizes = [];
        const sizesData = productData.sizes || [];
        const seen = new Set();

        for (const item of sizesData) {
            const sizeText = item.sizeText?.[0]?.text?.trim() || "";
            const priceText = item.priceText?.[0]?.text?.trim() || null;
            const isOOS = (item.oosElement?.length > 0);

            if (sizeText && !seen.has(sizeText) && !isOOS && priceText) {
                seen.add(sizeText);
                const priceMatch = priceText.match(/C?\$?([\d,]+)/);
                if (priceMatch) {
                    const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""));
                    sizes.push({
                        size: sizeText,
                        price: Math.round(priceCAD / USD_TO_CAD_RATE),
                        priceCAD,
                    });
                }
            }
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        const productName = productData.productName?.[0]?.text?.trim() || "Unknown Product";
        const imageUrl = productData.productImage?.[0]?.src?.value || "";

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