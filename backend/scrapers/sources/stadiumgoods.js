import { SOURCES } from "../../types.js";
import { generateListingId } from "../types.js";
import { launchBrowser, createPage, checkAbort, sleepWithAbort } from "../browser.js";
import { executeBrowserQL, isBrowserQLConfigured } from "../browserql.js";
import * as cheerio from "cheerio";
/**
 * Scrape Stadium Goods by SKU using an existing page. Does not close page/browser.
 * Uses BrowserQL if configured, otherwise uses the provided page.
 */
export async function scrapeStadiumGoodsBySkuInPage(page, sku, signal) {
    const source = SOURCES["stadium-goods"];
    
    if (isBrowserQLConfigured()) {
        console.log(`[STADIUMGOODS] Using BrowserQL`);
        return await searchStadiumGoodsBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    console.log(`[STADIUMGOODS] Using Puppeteer to search for SKU: ${sku}`);
    try {
        checkAbort(signal, "STADIUMGOODS");
        // Step 1: Search Stadium Goods
        const searchUrl = `https://www.stadiumgoods.com/search?q=${encodeURIComponent(sku)}`;
        try {
            checkAbort(signal, 'STADIUMGOODS');
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
        }
        // Wait for product grid
        try {
            checkAbort(signal, 'STADIUMGOODS');
            await page.waitForSelector('a.tvg_grid_item_VkuMWq_item_link', { timeout: 5000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
            await sleepWithAbort(2000, signal, 'STADIUMGOODS');
        }
        // Find product link
        const productData = await page.evaluate((searchSku) => {
            const skuNormalized = searchSku.toLowerCase().replace(/-/g, '');
            const links = Array.from(document.querySelectorAll('a.tvg_grid_item_VkuMWq_item_link'));
            for (const link of links) {
                const dataName = link.getAttribute("data-name") || "";
                if (dataName.toLowerCase().replace(/-/g, '').includes(skuNormalized)) {
                    return { href: link.getAttribute("href") || "", name: dataName };
                }
            }
            const firstLink = links[0];
            if (firstLink) {
                return { href: firstLink.getAttribute("href") || "", name: firstLink.getAttribute("data-name") || "" };
            }
            return null;
        }, sku);
        if (!productData || !productData.href) {
            console.log("[STADIUMGOODS] No product found");
            return { source, sizes: [], lowestPrice: 0, available: false };
        }
        const productUrl = `https://www.stadiumgoods.com${productData.href}`;
        console.log(`[STADIUMGOODS] Found: ${productUrl}`);
        // Step 2: Navigate to product page
        try {
            checkAbort(signal, 'STADIUMGOODS');
            await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Error && e.message === 'ABORTED')
                throw e;
        }
        // Wait for size list
        try {
            await page.waitForSelector('.ProductForm__select__list', { timeout: 5000 });
        }
        catch (e) {
            console.log("[STADIUMGOODS] Size list not found");
            return { source, sizes: [], lowestPrice: 0, available: false };
        }
        // Extract sizes
        const sizesData = await page.evaluate(() => {
            const sizes = [];
            const buttons = document.querySelectorAll('.ProductForm__select__button.js-product-variant');
            buttons.forEach((button) => {
                const sizeEl = button.querySelector('.ProductForm__select__variant__name');
                const priceEl = button.querySelector('.ProductForm__select__variant__price');
                if (sizeEl) {
                    const size = sizeEl.textContent?.trim() || "";
                    let price = null;
                    if (priceEl) {
                        const priceText = priceEl.textContent?.trim() || "";
                        const priceMatch = priceText.match(/\$?([\d,]+)/);
                        if (priceMatch) {
                            price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                        }
                    }
                    sizes.push({ size, price });
                }
            });
            return sizes;
        });
        // Filter to only available sizes
        const sizes = [];
        for (const s of sizesData) {
            if (s.price !== null) {
                sizes.push({
                    size: s.size,
                    price: s.price,
                    priceCAD: s.price,
                    currency: "USD",
                    url: productUrl,
                    available: true,
                });
            }
        }
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.price)) : 0;
        console.log(`[STADIUMGOODS] Found ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[STADIUMGOODS] Sizes: ${sizes.map(s => `${s.size}=$${s.price}`).join(", ")}`);
        }
        return { source, sizes, lowestPrice, available: sizes.length > 0 };
    }
    catch (error) {
        if (error instanceof Error && error.message === "ABORTED")
            throw error;
        console.error("[STADIUMGOODS] Error:", error);
        return { source, sizes: [], lowestPrice: 0, available: false };
    }
}
/**
 * Search Stadium Goods by SKU using BrowserQL
 */
export async function searchStadiumGoodsBySkuBrowserQL(sku, signal) {
    if (!isBrowserQLConfigured()) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }

    checkAbort(signal, "STADIUMGOODS");
    console.log(`[STADIUMGOODS] Using BrowserQL to search for SKU: ${sku}`);

    const searchUrl = `https://www.stadiumgoods.com/search?q=${encodeURIComponent(sku)}`;

    // BrowserQL mutation to search and find product
    const searchMutation = `
        mutation SearchStadiumGoods($searchUrl: String!) {
            goto(url: $searchUrl, waitUntil: networkidle2) {
                status
            }
            waitForSelector(selector: "a.tvg_grid_item_VkuMWq_item_link", timeout: 5000) {
                time
            }
            html: html(selector: "body") {
                content
            }
        }
    `;

    try {
        const searchData = await executeBrowserQL(searchMutation, { searchUrl });
        checkAbort(signal, "STADIUMGOODS");

        // Find product URL from HTML
        const html = searchData.html?.html || "";
        const $ = cheerio.load(html);
        const skuNormalized = sku.toLowerCase().replace(/-/g, '');
        let productUrl = null;
        let productName = "";

        $('a.tvg_grid_item_VkuMWq_item_link').each((_, el) => {
            const $link = $(el);
            const dataName = $link.attr("data-name") || "";
            if (dataName.toLowerCase().replace(/-/g, '').includes(skuNormalized)) {
                const href = $link.attr("href") || "";
                productUrl = `https://www.stadiumgoods.com${href}`;
                productName = dataName;
                return false;
            }
        });

        if (!productUrl) {
            const firstLink = $('a.tvg_grid_item_VkuMWq_item_link').first();
            const href = firstLink.attr("href");
            if (href) {
                productUrl = `https://www.stadiumgoods.com${href}`;
                productName = firstLink.attr("data-name") || "";
            }
        }

        if (!productUrl) {
            console.log("[STADIUMGOODS] No product found");
            return { source: SOURCES["stadium-goods"], sizes: [], lowestPrice: 0, available: false };
        }

        console.log(`[STADIUMGOODS] Found: ${productUrl}`);

        // Second mutation to get product page data
        const productMutation = `
            mutation ScrapeStadiumGoodsProduct($productUrl: String!) {
                goto(url: $productUrl, waitUntil: networkIdle) {
                    status
                }
                waitForSelector(selector: ".ProductForm__select__list", timeout: 5000) {
                    time
                }
                # Extract sizes
                sizes: mapSelector(selector: ".ProductForm__select__button.js-product-variant", wait: true) {
                    sizeText: mapSelector(selector: ".ProductForm__select__variant__name") {
                        text: innerText
                    }
                    priceText: mapSelector(selector: ".ProductForm__select__variant__price") {
                        text: innerText
                    }
                }
            }
        `;

        const productData = await executeBrowserQL(productMutation, { productUrl });
        checkAbort(signal, "STADIUMGOODS");

        // Process sizes
        const sizes = [];
        const sizesData = productData.sizes || [];

        for (const item of sizesData) {
            const sizeText = item.sizeText?.[0]?.text?.trim() || "";
            const priceText = item.priceText?.[0]?.text?.trim() || null;

            if (sizeText && priceText) {
                const priceMatch = priceText.match(/\$?([\d,]+)/);
                if (priceMatch) {
                    const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                    sizes.push({
                        size: sizeText,
                        price: price,
                        priceCAD: price,
                        currency: "USD",
                        url: productUrl,
                        available: true,
                    });
                }
            }
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.price)) : 0;

        console.log(`[STADIUMGOODS] BrowserQL extracted: ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[STADIUMGOODS] Sizes: ${sizes.map(s => `${s.size}=$${s.price}`).join(", ")}`);
        }

        return { source: SOURCES["stadium-goods"], sizes, lowestPrice, available: sizes.length > 0 };
    } catch (error) {
        if (error instanceof Error && error.message === "ABORTED") {
            throw error;
        }
        // Only log non-429 errors (429s are expected rate limits)
        if (error?.status !== 429 && !error?.message?.includes("429")) {
            console.error("[STADIUMGOODS] BrowserQL error:", error);
        }
        throw error;
    }
}

/**
 * Search Stadium Goods by SKU (standalone: launches and closes browser).
 * Uses BrowserQL if configured, otherwise falls back to Puppeteer.
 */
export async function searchStadiumGoodsBySku(sku, signal) {
    // Use BrowserQL if configured
    if (isBrowserQLConfigured()) {
        return await searchStadiumGoodsBySkuBrowserQL(sku, signal);
    }

    // Fallback to Puppeteer only if BrowserQL is not configured
    const browser = await launchBrowser();
    try {
        const page = await createPage(browser);
        return await scrapeStadiumGoodsBySkuInPage(page, sku, signal);
    }
    finally {
        await browser.close().catch(() => { });
    }
}
/**
 * Legacy search function for backwards compatibility
 */
export async function searchStadiumGoods(query) {
    const source = SOURCES["stadium-goods"];
    const result = await searchStadiumGoodsBySku(query);
    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }
    const listings = result.sizes.map((sizeData, index) => ({
        id: generateListingId("stadium-goods", `${index}`),
        name: `Stadium Goods - Size ${sizeData.size}`,
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
//# sourceMappingURL=stadiumgoods.js.map