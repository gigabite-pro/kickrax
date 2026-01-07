import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, convertToCAD, generateListingId, USD_TO_CAD_RATE } from "../types.js";

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
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled", "--disable-infobars", "--window-size=1920,1080"],
    });

    try {
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Hide webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            // @ts-ignore
            window.chrome = { runtime: {} };
        });

        await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        // Set extra headers
        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-CA,en;q=0.9",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        });

        // Step 1: Search GOAT with the SKU
        const searchUrl = `https://www.goat.com/en-ca/search?query=${encodeURIComponent(sku)}&pageNumber=1`;
        console.log(`[GOAT] Searching: ${searchUrl}`);

        await page.goto(searchUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // Wait for search results to load
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Step 2: Find product link that matches the SKU
        // GOAT URLs often include the SKU: /sneakers/product-name-IH2309-500
        const skuLower = sku.toLowerCase().replace(/-/g, "");

        const productUrl = await page.evaluate((skuLower) => {
            // Find all product links in the search grid
            const links = Array.from(document.querySelectorAll('a[href*="/sneakers/"]'));

            for (const link of links) {
                const href = link.getAttribute("href") || "";
                const hrefLower = href.toLowerCase().replace(/-/g, "");

                // Check if this link contains the SKU
                if (hrefLower.includes(skuLower)) {
                    return href.startsWith("http") ? href : `https://www.goat.com${href}`;
                }
            }

            // Fallback: Find product cards in the grid (not nav links)
            const gridCards = Array.from(document.querySelectorAll('[data-qa="grid_cell_product"], [class*="ProductCard"], [class*="GridCell"]'));
            for (const card of gridCards) {
                const link = card.querySelector('a[href*="/sneakers/"]');
                if (link) {
                    const href = link.getAttribute("href") || "";
                    return href.startsWith("http") ? href : `https://www.goat.com${href}`;
                }
            }

            // Last fallback: first sneaker link that's not in nav
            const mainContent = document.querySelector('main, [class*="SearchResults"], [class*="Grid"]');
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
            console.log("[GOAT] No product found for SKU:", sku);
            return null;
        }

        console.log(`[GOAT] Found product: ${productUrl}`);

        // Step 3: Navigate to the product page
        await page.goto(productUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // Wait for initial page load
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Scroll down the page gradually to trigger lazy loading
        for (let i = 0; i < 3; i++) {
            await page.evaluate((scrollAmount) => {
                window.scrollBy(0, scrollAmount);
            }, 300);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Scroll to buy bar
        await page.evaluate(() => {
            const buyBar = document.querySelector('[data-qa="buy_bar_desktop"]');
            if (buyBar) {
                buyBar.scrollIntoView({ behavior: "instant", block: "center" });
            }
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Mouse move over buy bar area to trigger hover states
        try {
            const buyBar = await page.$('[data-qa="buy_bar_desktop"]');
            if (buyBar) {
                const box = await buyBar.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    console.log("[GOAT] Hovering over buy bar...");
                }
            }
        } catch (e) {
            console.log("[GOAT] Hover failed");
        }

        // Try clicking inside the swiper area
        try {
            const swiperWrapper = await page.$('[data-qa="buy_bar_desktop"] .swiper-wrapper, [data-qa="buy_bar_desktop"] [class*="Swiper"]');
            if (swiperWrapper) {
                console.log("[GOAT] Found swiper, clicking...");
                await swiperWrapper.click();
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        } catch (e) {
            // Ignore
        }

        // Try clicking navigation arrows
        try {
            const arrows = await page.$$('[data-qa="buy_bar_desktop"] button, [class*="Arrow"], [class*="swiper-button"]');
            for (const arrow of arrows.slice(0, 2)) {
                await arrow.click().catch(() => {});
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
            if (arrows.length > 0) console.log("[GOAT] Clicked swiper arrows");
        } catch (e) {
            // Ignore
        }

        // Wait longer for dynamic content
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Wait for swiper slides to appear
        try {
            await page.waitForSelector('[data-qa="buy_bar_item_desktop"]', { timeout: 10000 });
            console.log("[GOAT] buy_bar_item_desktop elements loaded");
        } catch (e) {
            console.log("[GOAT] buy_bar_item_desktop not found via waitForSelector");

            // Debug: log what's inside buy_bar_desktop
            const buyBarContent = await page.evaluate(() => {
                const buyBar = document.querySelector('[data-qa="buy_bar_desktop"]');
                return buyBar ? buyBar.innerHTML.substring(0, 1000) : "NOT FOUND";
            });
            console.log("[GOAT] buy_bar_desktop content:", buyBarContent.substring(0, 500));
        }

        // Extract sizes directly using page.evaluate (bypasses cheerio issues)
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
                    sizes.push({
                        size: sizeText,
                        price: isOOS ? null : priceText,
                    });
                }
            });

            // Get product info
            const productName = document.querySelector('h1[data-qa="product_display_name"]')?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "Unknown Product";

            const imageEl = document.querySelector('[data-qa="grid_cell_product_image"] img') as HTMLImageElement | null;
            const imageUrl = imageEl?.src || "";

            return { productName, imageUrl, sizes, itemCount: items.length };
        });

        console.log(`[GOAT] Product: ${extractedData.productName}`);
        console.log(`[GOAT] buy_bar_item_desktop count: ${extractedData.itemCount}`);

        // Convert extracted sizes to our format
        const sizes: { size: string; price: number; priceCAD: number }[] = [];

        for (const item of extractedData.sizes) {
            if (item.price) {
                const priceMatch = item.price.match(/C?\$?([\d,]+)/);
                if (priceMatch) {
                    const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""));
                    console.log(`[GOAT] ✓ Size ${item.size}: C$${priceCAD}`);
                    sizes.push({
                        size: item.size,
                        price: Math.round(priceCAD / USD_TO_CAD_RATE),
                        priceCAD,
                    });
                }
            } else {
                console.log(`[GOAT] ✗ Size ${item.size}: Out of Stock`);
            }
        }

        const productName = extractedData.productName;
        const imageUrl = extractedData.imageUrl;

        console.log(`[GOAT] Total unique sizes extracted: ${sizes.length}`);

        // Sort sizes
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        console.log(`[GOAT] Found ${sizes.length} sizes with prices`);

        return {
            productName,
            productUrl,
            imageUrl,
            sizes,
        };
    } catch (error) {
        console.error("[GOAT] Scraping error:", error);
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
        return {
            source,
            sizes: [],
            lowestPrice: 0,
            available: false,
        };
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

    return {
        source,
        sizes,
        lowestPrice,
        available: true,
    };
}
