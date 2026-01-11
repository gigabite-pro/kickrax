import * as cheerio from "cheerio";
import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, convertToCAD, generateListingId, USD_TO_CAD_RATE } from "../types.js";
import { launchBrowser, createPage } from "../browser.js";

export interface GoatSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

/**
 * Search GOAT by SKU and get all size prices from the first result
 */
export async function searchGoatBySku(sku: string): Promise<GoatSizePricing | null> {
    console.log(`[GOAT] Searching for SKU: ${sku}`);

    const browser = await launchBrowser();

    try {
        const page = await createPage(browser);

        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-CA,en;q=0.9",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        });

        // Step 1: Search GOAT
        const searchUrl = `https://www.goat.com/en-ca/search?query=${encodeURIComponent(sku)}&pageNumber=1`;

        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));

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
        await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Scroll to trigger lazy loading
        for (let i = 0; i < 3; i++) {
            await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), 300);
            await new Promise((resolve) => setTimeout(resolve, 300));
        }

        await page.evaluate(() => {
            const buyBar = document.querySelector('[data-qa="buy_bar_desktop"]');
            if (buyBar) buyBar.scrollIntoView({ behavior: "instant", block: "center" });
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Try clicking swiper
        try {
            const swiperWrapper = await page.$('[data-qa="buy_bar_desktop"] .swiper-wrapper');
            if (swiperWrapper) {
                await swiperWrapper.click();
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        } catch (e) {}

        // Wait for size items
        try {
            await page.waitForSelector('[data-qa="buy_bar_item_desktop"]', { timeout: 5000 });
        } catch (e) {}

        // Extract sizes
        const extractedData = await page.evaluate(() => {
            const items = document.querySelectorAll('[data-qa="buy_bar_item_desktop"]');
            const sizes: { size: string; price: string | null }[] = [];
            const seen = new Set<string>();

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
            const imageEl = document.querySelector('[data-qa="grid_cell_product_image"] img') as HTMLImageElement | null;

            return { productName, imageUrl: imageEl?.src || "", sizes, itemCount: items.length };
        });

        // Convert to our format
        const sizes: { size: string; price: number; priceCAD: number }[] = [];

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
    } catch (error) {
        console.error("[GOAT] Error:", error);
        return null;
    } finally {
        await browser.close();
    }
}

/**
 * Legacy search function for backwards compatibility
 */
export async function searchGOAT(query: string): Promise<ScraperResult> {
    const source = SOURCES.goat;
    const result = await searchGoatBySku(query);

    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }

    const listings: SneakerListing[] = result.sizes.map((sizeData, index) => ({
        id: generateListingId("goat", `${index}`),
        name: `${result.productName} - Size ${sizeData.size}`,
        brand: "Unknown",
        colorway: "",
        sku: "",
        imageUrl: result.imageUrl,
        retailPrice: null,
        condition: "new" as const,
        source,
        price: sizeData.price,
        currency: "USD" as const,
        priceCAD: sizeData.priceCAD,
        url: result.productUrl,
        lastUpdated: new Date(),
    }));

    return { success: true, listings, source };
}

/**
 * Search GOAT by SKU and return SourcePricing format
 */
export async function searchGOATBySku(sku: string): Promise<SourcePricing> {
    const source = SOURCES.goat;
    const result = await searchGoatBySku(sku);

    if (!result || result.sizes.length === 0) {
        return { source, sizes: [], lowestPrice: 0, available: false };
    }

    const sizes: SizePrice[] = result.sizes.map((s) => ({
        size: s.size,
        price: s.price,
        priceCAD: s.priceCAD,
        currency: "USD" as const,
        url: `${result.productUrl}?size=${s.size}`,
        available: true,
    }));

    const lowestPrice = Math.min(...sizes.map((s) => s.priceCAD));

    return { source, sizes, lowestPrice, available: true };
}
