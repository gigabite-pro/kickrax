import type { Page } from "puppeteer";
import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, generateListingId } from "../types.js";
import { launchBrowser, createPage, AbortSignal, checkAbort, sleepWithAbort } from "../browser.js";

export interface StadiumGoodsSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number }[];
}

/**
 * Scrape Stadium Goods by SKU using an existing page. Does not close page/browser.
 */
export async function scrapeStadiumGoodsBySkuInPage(page: Page, sku: string, signal?: AbortSignal): Promise<SourcePricing> {
    const source = SOURCES["stadium-goods"];
    console.log(`[STADIUMGOODS] Searching for SKU: ${sku}`);

    try {
        checkAbort(signal, "STADIUMGOODS");

        // Step 1: Search Stadium Goods
        const searchUrl = `https://www.stadiumgoods.com/search?q=${encodeURIComponent(sku)}`;

        try {
            checkAbort(signal, 'STADIUMGOODS');
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 20000 });
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
        }

        // Wait for product grid
        try {
            checkAbort(signal, 'STADIUMGOODS');
            await page.waitForSelector('a.tvg_grid_item_VkuMWq_item_link', { timeout: 5000 });
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
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
            
            const firstLink = links[0] as HTMLAnchorElement;
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
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
        }

        // Wait for size list
        try {
            await page.waitForSelector('.ProductForm__select__list', { timeout: 5000 });
        } catch (e) {
            console.log("[STADIUMGOODS] Size list not found");
            return { source, sizes: [], lowestPrice: 0, available: false };
        }

        // Extract sizes
        const sizesData = await page.evaluate(() => {
            const sizes: { size: string; price: number | null }[] = [];
            const buttons = document.querySelectorAll('.ProductForm__select__button.js-product-variant');
            
            buttons.forEach((button) => {
                const sizeEl = button.querySelector('.ProductForm__select__variant__name');
                const priceEl = button.querySelector('.ProductForm__select__variant__price');
                
                if (sizeEl) {
                    const size = sizeEl.textContent?.trim() || "";
                    let price: number | null = null;
                    
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
        const sizes: SizePrice[] = [];
        for (const s of sizesData) {
            if (s.price !== null) {
                sizes.push({
                    size: s.size,
                    price: s.price,
                    priceCAD: s.price,
                    currency: "USD" as const,
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
    } catch (error) {
        if (error instanceof Error && error.message === "ABORTED") throw error;
        console.error("[STADIUMGOODS] Error:", error);
        return { source, sizes: [], lowestPrice: 0, available: false };
    }
}

/**
 * Search Stadium Goods by SKU (standalone: launches and closes browser).
 */
export async function searchStadiumGoodsBySku(sku: string, signal?: AbortSignal): Promise<SourcePricing> {
    const browser = await launchBrowser();
    try {
        const page = await createPage(browser);
        return await scrapeStadiumGoodsBySkuInPage(page, sku, signal);
    } finally {
        await browser.close().catch(() => {});
    }
}

/**
 * Legacy search function for backwards compatibility
 */
export async function searchStadiumGoods(query: string): Promise<ScraperResult> {
    const source = SOURCES["stadium-goods"];
    const result = await searchStadiumGoodsBySku(query);

    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }

    const listings: SneakerListing[] = result.sizes.map((sizeData, index) => ({
        id: generateListingId("stadium-goods", `${index}`),
        name: `Stadium Goods - Size ${sizeData.size}`,
        brand: "Unknown",
        colorway: "",
        sku: "",
        imageUrl: "",
        retailPrice: null,
        condition: "new" as const,
        source,
        price: sizeData.price,
        currency: "USD" as const,
        priceCAD: sizeData.priceCAD,
        url: sizeData.url,
        lastUpdated: new Date(),
    }));

    return { success: true, listings, source };
}
