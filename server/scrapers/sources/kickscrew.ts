import puppeteer from "puppeteer";
import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, generateListingId, USD_TO_CAD_RATE } from "../types.js";

export interface KickscrewSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

/**
 * Search KicksCrew by SKU and get all size prices from the first result
 */
export async function searchKickscrewBySku(sku: string): Promise<KickscrewSizePricing | null> {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--window-size=1920,1080",
        ],
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

        // Step 1: Search KicksCrew with the SKU
        const searchUrl = `https://www.kickscrew.com/en-CA/search?keyword=${encodeURIComponent(sku)}`;
        console.log(`[KICKSCREW] Searching: ${searchUrl}`);

        await page.goto(searchUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // Wait for search results to load
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Debug: Check page content
        const searchPageDebug = await page.evaluate(() => {
            const html = document.body.innerHTML;
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
            return {
                htmlLength: html.length,
                productLinkCount: productLinks.length,
                firstFewLinks: productLinks.slice(0, 5).map(l => l.getAttribute("href")),
            };
        });
        console.log(`[KICKSCREW] Search page HTML length: ${searchPageDebug.htmlLength}`);
        console.log(`[KICKSCREW] Product links found: ${searchPageDebug.productLinkCount}`);
        if (searchPageDebug.firstFewLinks.length > 0) {
            console.log(`[KICKSCREW] First links:`, searchPageDebug.firstFewLinks);
        }

        // Step 2: Find the first product link
        const productUrl = await page.evaluate(() => {
            // Find product cards/links in search results
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));

            for (const link of productLinks) {
                const href = link.getAttribute("href") || "";
                // Skip non-product links
                if (href.includes("/products/") && !href.includes("/collections/")) {
                    return href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
                }
            }

            return null;
        });

        if (!productUrl) {
            console.log("[KICKSCREW] No product found for SKU:", sku);
            // Debug: Log page title and URL
            const debugInfo = await page.evaluate(() => ({
                title: document.title,
                url: window.location.href,
            }));
            console.log(`[KICKSCREW] Page title: ${debugInfo.title}`);
            console.log(`[KICKSCREW] Current URL: ${debugInfo.url}`);
            return null;
        }

        console.log(`[KICKSCREW] Found product: ${productUrl}`);

        // Step 3: Navigate to the product page
        await page.goto(productUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // Wait for page load
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Debug: Check product page content
        const productPageDebug = await page.evaluate(() => {
            const html = document.body.innerHTML;
            const hasSizeOption = html.includes('data-testid="size-option');
            const hasDataAvailable = html.includes('data-available');
            const sizeElements = document.querySelectorAll('[data-testid^="size-option-"]');
            const h1 = document.querySelector('h1')?.textContent || 'NO H1';
            return {
                htmlLength: html.length,
                hasSizeOption,
                hasDataAvailable,
                sizeElementCount: sizeElements.length,
                h1Title: h1,
                currentUrl: window.location.href,
            };
        });
        console.log(`[KICKSCREW] Product page HTML length: ${productPageDebug.htmlLength}`);
        console.log(`[KICKSCREW] Has size-option in HTML: ${productPageDebug.hasSizeOption}`);
        console.log(`[KICKSCREW] Has data-available in HTML: ${productPageDebug.hasDataAvailable}`);
        console.log(`[KICKSCREW] Size elements found: ${productPageDebug.sizeElementCount}`);
        console.log(`[KICKSCREW] H1 Title: ${productPageDebug.h1Title}`);
        console.log(`[KICKSCREW] Current URL: ${productPageDebug.currentUrl}`);

        // Wait for size list to load
        try {
            await page.waitForSelector('[data-testid^="size-option-"]', { timeout: 10000 });
            console.log("[KICKSCREW] Size options loaded via waitForSelector");
        } catch (e) {
            console.log("[KICKSCREW] Size options not found via waitForSelector, trying to scroll...");
            
            // Try scrolling to trigger lazy loading
            await page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            
            // Check again
            const retryCount = await page.evaluate(() => {
                return document.querySelectorAll('[data-testid^="size-option-"]').length;
            });
            console.log(`[KICKSCREW] After scroll, size elements: ${retryCount}`);
        }

        // Extract sizes and product info using page.evaluate
        const extractedData = await page.evaluate(() => {
            // Get all size option elements
            const sizeItems = Array.from(document.querySelectorAll('[data-testid^="size-option-"]'));
            const sizes: { size: string; price: string | null; available: boolean }[] = [];

            sizeItems.forEach((item) => {
                const isAvailable = item.getAttribute("data-available") === "true";

                // Get size text from the font-semibold div
                const sizeEl = item.querySelector(".font-semibold");
                const sizeText = sizeEl?.textContent?.trim() || "";

                // Get price from the first div child
                const priceEl = item.querySelector(".text-sm:not(.font-semibold), .text-xs");
                let priceText = priceEl?.textContent?.trim() || null;

                // Skip "$--" prices (out of stock indicator)
                if (priceText === "$--" || priceText?.includes("--")) {
                    priceText = null;
                }

                // Extract just the size number from "US(M) 10" format
                const sizeMatch = sizeText.match(/([\d.]+)/);
                const size = sizeMatch ? sizeMatch[1] : sizeText;

                if (size) {
                    sizes.push({
                        size,
                        price: isAvailable ? priceText : null,
                        available: isAvailable,
                    });
                }
            });

            // Get product name
            const productName = document.querySelector("h1")?.textContent?.trim() || "Unknown Product";

            // Get product image
            const imageEl = document.querySelector('img[alt*="product"], img[src*="cdn.kickscrew"]') as HTMLImageElement | null;
            const imageUrl = imageEl?.src || "";

            return { productName, imageUrl, sizes, itemCount: sizeItems.length };
        });

        console.log(`[KICKSCREW] Product: ${extractedData.productName}`);
        console.log(`[KICKSCREW] Size options count: ${extractedData.itemCount}`);

        // Convert extracted sizes to our format
        const sizes: { size: string; price: number; priceCAD: number }[] = [];

        for (const item of extractedData.sizes) {
            if (item.price && item.available) {
                // Parse price like "CA$203" or "CA$1,018"
                const priceMatch = item.price.match(/CA?\$?([\d,]+)/);
                if (priceMatch) {
                    const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""));
                    console.log(`[KICKSCREW] ✓ Size ${item.size}: CA$${priceCAD}`);
                    sizes.push({
                        size: item.size,
                        price: Math.round(priceCAD / USD_TO_CAD_RATE),
                        priceCAD,
                    });
                }
            } else {
                console.log(`[KICKSCREW] ✗ Size ${item.size}: Out of Stock`);
            }
        }

        console.log(`[KICKSCREW] Total sizes extracted: ${sizes.length}`);

        // Sort sizes
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        console.log(`[KICKSCREW] Found ${sizes.length} sizes with prices`);

        return {
            productName: extractedData.productName,
            productUrl,
            imageUrl: extractedData.imageUrl,
            sizes,
        };
    } catch (error) {
        console.error("[KICKSCREW] Scraping error:", error);
        return null;
    } finally {
        await browser.close();
    }
}

/**
 * Legacy search function for backwards compatibility
 */
export async function searchKicksCrew(query: string): Promise<ScraperResult> {
    const source = SOURCES.kickscrew;
    const result = await searchKickscrewBySku(query);

    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }

    const listings: SneakerListing[] = result.sizes.map((sizeData, index) => ({
        id: generateListingId("kickscrew", `${index}`),
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
 * Search KicksCrew by SKU and return SourcePricing format
 */
export async function searchKickscrewBySkuPricing(sku: string): Promise<SourcePricing> {
    const source = SOURCES.kickscrew;
    const result = await searchKickscrewBySku(sku);

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

