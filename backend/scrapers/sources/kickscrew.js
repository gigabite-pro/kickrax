import { SOURCES } from "../../types.js";
import { generateListingId, USD_TO_CAD_RATE } from "../types.js";
import { launchBrowser, createPage, checkAbort, sleepWithAbort, logBlockingSummary } from "../browser.js";
import { executeBrowserQL, isBrowserQLConfigured } from "../browserql.js";
import * as cheerio from "cheerio";
/**
 * Scrape KicksCrew by SKU using an existing page. Does not close page/browser.
 * Uses BrowserQL if configured, otherwise uses the provided page.
 */
export async function scrapeKickscrewBySkuInPage(page, sku, signal) {
    if (isBrowserQLConfigured()) {
        console.log(`[KICKSCREW] Using BrowserQL`);
        return await searchKickscrewBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    console.log(`[KICKSCREW] Using Puppeteer to search for SKU: ${sku}`);
    try {
        checkAbort(signal, "KICKSCREW");
        // Step 1: Search KicksCrew
        const searchUrl = `https://www.kickscrew.com/en-CA/search?q=${encodeURIComponent(sku)}`;
        try {
            checkAbort(signal, 'KICKSCREW');
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
            // Continue even if timeout
        }
        await sleepWithAbort(2000, signal, 'KICKSCREW');
        // Wait for product grid
        try {
            await page.waitForSelector('ul li a[href*="/products/"]', { timeout: 5000 });
        }
        catch (e) {
            // Continue
        }
        // Find product link (prefer one with SKU in URL)
        const skuLower = sku.toLowerCase().replace(/-/g, "");
        const productUrl = await page.evaluate((skuLower) => {
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
            for (const link of productLinks) {
                const href = link.getAttribute("href") || "";
                if (href.toLowerCase().replace(/-/g, "").includes(skuLower)) {
                    return href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
                }
            }
            for (const link of productLinks) {
                const href = link.getAttribute("href") || "";
                if (href.includes("/products/") && !href.includes("/collections/")) {
                    return href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
                }
            }
            return null;
        }, skuLower);
        if (!productUrl) {
            console.log("[KICKSCREW] No product found");
            return null;
        }
        console.log(`[KICKSCREW] Found: ${productUrl}`);

        const extractSizesInPage = () => page.evaluate(() => {
            let sizeItems = Array.from(document.querySelectorAll('[data-testid^="size-option-"]'));
            if (sizeItems.length === 0) sizeItems = Array.from(document.querySelectorAll('li[role="menuitem"]'));
            if (sizeItems.length === 0) sizeItems = Array.from(document.querySelectorAll('ol li'));
            const sizes = [];
            sizeItems.forEach((item) => {
                const isAvailable = item.getAttribute("data-available") !== "false";
                const sizeEl = item.querySelector(".font-semibold") || item.querySelector('[class*="size"]');
                const sizeText = sizeEl?.textContent?.trim() || item.textContent?.trim() || "";
                const priceEl = item.querySelector(".text-sm:not(.font-semibold), .text-xs") || item.querySelector('[class*="price"]');
                let priceText = priceEl?.textContent?.trim() || null;
                if (priceText === "$--" || priceText?.includes("--")) priceText = null;
                const sizeMatch = sizeText.match(/([\d.]+)/);
                const size = sizeMatch ? sizeMatch[1] : sizeText;
                if (size && /^\d/.test(size)) sizes.push({ size, price: isAvailable ? priceText : null, available: isAvailable });
            });
            const imageEl = document.querySelector('img[alt*="product"], img[src*="cdn.kickscrew"]');
            return { sizes, imageUrl: imageEl?.src || "", itemCount: sizeItems.length };
        });

        const isDetached = (e) => e instanceof Error && /detached|Target closed|Frame detached|Execution context is not available in detached/i.test(e.message);

        let productName;
        let extractedData;
        try {
            checkAbort(signal, 'KICKSCREW');
            await page.goto(productUrl, { waitUntil: "networkidle0", timeout: 30000 });
            await sleepWithAbort(4000, signal, 'KICKSCREW');
            productName = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || 'Unknown Product');
            console.log(`[KICKSCREW] Product: ${productName}`);

            const sizePickerSelectors = ['.size-picker', 'button[aria-label*="size" i]', 'button[aria-label*="Size" i]', '[data-testid="size-picker"]', 'button:has-text("Select Size")', '.size-selector', '[class*="size-picker"]', '[class*="SizePicker"]'];
            let sizePickerClicked = false;
            for (const selector of sizePickerSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    await page.click(selector);
                    sizePickerClicked = true;
                    console.log(`[KICKSCREW] Clicked size picker: ${selector}`);
                    break;
                } catch (_) {}
            }
            if (!sizePickerClicked) console.log("[KICKSCREW] Size picker not found, trying to extract sizes directly");
            await sleepWithAbort(2000, signal, 'KICKSCREW');
            try { await page.waitForSelector('[data-testid^="size-option-"]', { timeout: 5000 }); } catch (_) {}
            try { await page.waitForSelector('li[role="menuitem"]', { timeout: 3000 }); } catch (_) {}
            extractedData = await extractSizesInPage();
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
            if (!isDetached(e)) throw e;
            console.log("[KICKSCREW] Frame detached, re-loading product page and extracting without size picker");
            try {
                await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
                await sleepWithAbort(2000, signal, 'KICKSCREW');
                productName = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || 'Unknown Product');
                extractedData = await extractSizesInPage();
            } catch (retryErr) {
                if (retryErr instanceof Error && retryErr.message === 'ABORTED') throw retryErr;
                console.error("[KICKSCREW] Retry after detached failed:", retryErr);
                return null;
            }
        }
        if (!extractedData) {
            console.log("[KICKSCREW] No extraction data, skipping");
            return null;
        }
        console.log(`[KICKSCREW] Found ${extractedData.itemCount} size items in DOM`);
        // Convert to our format
        const sizes = [];
        for (const item of extractedData.sizes) {
            if (item.price && item.available) {
                const priceMatch = item.price.match(/CA?\$?([\d,]+)/);
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
        console.log(`[KICKSCREW] Found ${sizes.length} available sizes with prices`);
        // Print all sizes
        if (sizes.length > 0) {
            console.log(`[KICKSCREW] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(', ')}`);
        }
        logBlockingSummary(page, "KICKSCREW");
        return {
            productName,
            productUrl,
            imageUrl: extractedData.imageUrl,
            sizes,
        };
    }
    catch (error) {
        if (error instanceof Error && error.message === "ABORTED")
            throw error;
        console.error("[KICKSCREW] Error:", error);
        logBlockingSummary(page, "KICKSCREW");
        return null;
    }
}
/**
 * Search KicksCrew by SKU using BrowserQL
 */
export async function searchKickscrewBySkuBrowserQL(sku, signal) {
    if (!isBrowserQLConfigured()) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }

    checkAbort(signal, "KICKSCREW");
    console.log(`[KICKSCREW] Using BrowserQL to search for SKU: ${sku}`);

    const searchUrl = `https://www.kickscrew.com/en-CA/search?q=${encodeURIComponent(sku)}`;

    const mutation = `
        mutation SearchKicksCrew($searchUrl: String!) {
            viewport(width: 1366, height: 768) {
                width
                height
                time
            }
            goto(url: $searchUrl, waitUntil: domContentLoaded) {
                status
            }
            waitForSearch: waitForTimeout(time: 2000) {
                time
            }
            waitForProducts: waitForSelector(selector: "a[href*='/products/']", timeout: 10000) {
                time
            }
            waitForLayoutStable: waitForTimeout(time: 3000) {
                time
            }
            clickFirstProduct: click(selector: "a[href*='/products/']") {
                x
                y
            }
            waitForNavigation: waitForTimeout(time: 3000) {
                time
            }
            waitForProductPage: waitForTimeout(time: 15000) {
                time
            }
            waitForSizePicker: waitForSelector(selector: "#size-picker, [data-testid='size-picker-selected-info']", timeout: 20000) {
                time
            }
            waitForPickerStable: waitForTimeout(time: 3000) {
                time
            }
            clickSizePicker: click(selector: "button[aria-haspopup='menu']") {
                x
                y
            }
            waitForSizeMenu: waitForTimeout(time: 3000) {
                time
            }
            waitForSizeOptions: waitForSelector(selector: "li[data-testid^='size-option-']", timeout: 15000) {
                time
            }
            sizeValues: querySelectorAll(selector: "li[data-testid^='size-option-'] .font-semibold") {
                text: innerText
            }
            priceValues: querySelectorAll(selector: "li[data-testid^='size-option-'] .text-sm") {
                text: innerText
            }
            currentUrl: url {
                url
            }
        }
    `;

    try {
        const data = await executeBrowserQL(mutation, { searchUrl });
        checkAbort(signal, "KICKSCREW");

        // Parse sizes using provided function
        function parseKicksCrewSizes(data) {
            return data.sizeValues.map((sizeObj, index) => {
                const size = sizeObj.text.trim().replace('US(M) ', '');
                const priceText = data.priceValues[index]?.text.trim() || null;
                const price = (priceText && priceText !== '$--') ? priceText : null;
                
                return { size, price };
            }).filter(item => item.price); // Only return items with valid prices
        }

        const parsedSizes = parseKicksCrewSizes(data);

        // Convert to our format with price conversion
        const sizes = [];
        for (const item of parsedSizes) {
            const priceMatch = item.price.match(/CA?\$?([\d,]+)/);
            if (priceMatch) {
                const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""), 10);
                sizes.push({
                    size: item.size,
                    price: Math.round(priceCAD / USD_TO_CAD_RATE),
                    priceCAD,
                });
            }
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        const productUrl = data.currentUrl?.url || "";
        const productName = "Unknown Product"; // Not extracted in mutation
        const imageUrl = ""; // Not extracted in mutation

        console.log(`[KICKSCREW] BrowserQL extracted: ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[KICKSCREW] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(', ')}`);
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
            console.error("[KICKSCREW] BrowserQL error:", error);
        }
        throw error;
    }
}

/**
 * Search KicksCrew by SKU (standalone: launches and closes browser).
 * Uses BrowserQL if configured, otherwise falls back to Puppeteer.
 */
export async function searchKickscrewBySku(sku, signal) {
    // Use BrowserQL if configured
    if (isBrowserQLConfigured()) {
        return await searchKickscrewBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    const browser = await launchBrowser();
    try {
        const page = await createPage(browser);
        return await scrapeKickscrewBySkuInPage(page, sku, signal);
    }
    finally {
        await browser.close().catch(() => { });
    }
}
/**
 * Legacy search function for backwards compatibility
 */
export async function searchKicksCrew(query) {
    const source = SOURCES.kickscrew;
    const result = await searchKickscrewBySku(query);
    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }
    const listings = result.sizes.map((sizeData, index) => ({
        id: generateListingId("kickscrew", `${index}`),
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
 * Search KicksCrew by SKU and return SourcePricing format
 */
export async function searchKickscrewBySkuPricing(sku) {
    const source = SOURCES.kickscrew;
    const result = await searchKickscrewBySku(sku);
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
//# sourceMappingURL=kickscrew.js.map