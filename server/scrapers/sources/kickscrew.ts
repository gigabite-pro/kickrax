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
    console.log(`[KICKSCREW] ========== STARTING KICKSCREW SCRAPE ==========`);
    console.log(`[KICKSCREW] SKU: ${sku}`);
    console.log(`[KICKSCREW] Launching browser...`);
    
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
    console.log(`[KICKSCREW] Browser launched`);

    try {
        const page = await browser.newPage();
        console.log(`[KICKSCREW] New page created`);

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
        console.log(`[KICKSCREW] Page configured (viewport, user agent, headers)`);

        // Listen for response to log HTTP status
        page.on('response', response => {
            const url = response.url();
            if (url.includes('kickscrew.com') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg')) {
                console.log(`[KICKSCREW] HTTP ${response.status()} - ${url.substring(0, 80)}`);
            }
        });

        // Step 1: Search KicksCrew with the SKU
        const searchUrl = `https://www.kickscrew.com/en-CA/search?q=${encodeURIComponent(sku)}`;
        console.log(`[KICKSCREW] Step 1: Navigating to search URL...`);
        console.log(`[KICKSCREW] URL: ${searchUrl}`);

        const startTime = Date.now();
        try {
            await page.goto(searchUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            console.log(`[KICKSCREW] Search page loaded in ${Date.now() - startTime}ms`);
        } catch (navError) {
            console.log(`[KICKSCREW] Navigation error after ${Date.now() - startTime}ms: ${navError}`);
            // Try to continue anyway - page might have partially loaded
        }
        
        // Log current URL to see if we got redirected
        const currentUrl = await page.url();
        console.log(`[KICKSCREW] Current URL after navigation: ${currentUrl}`);

        // Wait for search results to load
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Wait for the product grid to appear
        try {
            await page.waitForSelector('ul li a[href*="/products/"]', { timeout: 10000 });
            console.log("[KICKSCREW] Product grid loaded");
        } catch (e) {
            console.log("[KICKSCREW] Product grid not found, checking page...");
        }

        // Debug: Check page content
        const searchPageDebug = await page.evaluate(() => {
            const html = document.body.innerHTML;
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
            const listItems = Array.from(document.querySelectorAll('ul li'));
            return {
                htmlLength: html.length,
                productLinkCount: productLinks.length,
                listItemCount: listItems.length,
                firstFewLinks: productLinks.slice(0, 5).map(l => l.getAttribute("href")),
                pageTitle: document.title,
                currentUrl: window.location.href,
            };
        });
        console.log(`[KICKSCREW] Search page HTML length: ${searchPageDebug.htmlLength}`);
        console.log(`[KICKSCREW] Product links found: ${searchPageDebug.productLinkCount}`);
        console.log(`[KICKSCREW] List items found: ${searchPageDebug.listItemCount}`);
        console.log(`[KICKSCREW] Page title: ${searchPageDebug.pageTitle}`);
        if (searchPageDebug.firstFewLinks.length > 0) {
            console.log(`[KICKSCREW] First links:`, searchPageDebug.firstFewLinks);
        }

        // Step 2: Find product link (prefer one with SKU in URL)
        const skuLower = sku.toLowerCase().replace(/-/g, "");
        
        const productUrl = await page.evaluate((skuLower) => {
            // Find all product links
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));

            // First try to find one with the SKU in the URL
            for (const link of productLinks) {
                const href = link.getAttribute("href") || "";
                const hrefLower = href.toLowerCase().replace(/-/g, "");
                if (hrefLower.includes(skuLower)) {
                    return href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
                }
            }

            // Fallback: get the first product link
            for (const link of productLinks) {
                const href = link.getAttribute("href") || "";
                if (href.includes("/products/") && !href.includes("/collections/")) {
                    return href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
                }
            }

            return null;
        }, skuLower);

        if (!productUrl) {
            console.log("[KICKSCREW] No product found for SKU:", sku);
            console.log(`[KICKSCREW] Current URL: ${searchPageDebug.currentUrl}`);
            return null;
        }

        console.log(`[KICKSCREW] Found product: ${productUrl}`);

        // Step 3: Navigate to the product page
        console.log(`[KICKSCREW] Step 3: Navigating to product page...`);
        const productStartTime = Date.now();
        try {
            await page.goto(productUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            console.log(`[KICKSCREW] Product page loaded in ${Date.now() - productStartTime}ms`);
        } catch (navError) {
            console.log(`[KICKSCREW] Product page navigation error after ${Date.now() - productStartTime}ms: ${navError}`);
            // Try to continue anyway
        }
        
        // Log current URL
        const productCurrentUrl = await page.url();
        console.log(`[KICKSCREW] Product page URL: ${productCurrentUrl}`);

        // Wait for page load
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Get product name first
        const productName = await page.evaluate(() => {
            return document.querySelector('h1')?.textContent?.trim() || 'Unknown Product';
        });
        console.log(`[KICKSCREW] Product: ${productName}`);

        // Step 4: Click on .size-picker to open size dropdown
        console.log(`[KICKSCREW] Step 4: Looking for .size-picker button...`);
        
        try {
            await page.waitForSelector('.size-picker', { timeout: 10000 });
            console.log(`[KICKSCREW] Found .size-picker, clicking...`);
            await page.click('.size-picker');
            await new Promise((resolve) => setTimeout(resolve, 1500));
            console.log(`[KICKSCREW] Clicked .size-picker`);
        } catch (e) {
            console.log(`[KICKSCREW] .size-picker not found, trying alternative selectors...`);
            
            // Try alternative selectors
            const altSelectors = [
                'button[aria-label*="size"]',
                '[class*="size-picker"]',
                '[class*="SizePicker"]',
                'button:has-text("Select Size")',
            ];
            
            for (const selector of altSelectors) {
                try {
                    const el = await page.$(selector);
                    if (el) {
                        console.log(`[KICKSCREW] Found alternative: ${selector}`);
                        await el.click();
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                        break;
                    }
                } catch (err) {
                    // Continue trying
                }
            }
        }

        // Wait for size options to appear after clicking
        console.log(`[KICKSCREW] Step 5: Waiting for size options to appear...`);
        try {
            await page.waitForSelector('[data-testid^="size-option-"]', { timeout: 10000 });
            console.log("[KICKSCREW] Size options appeared!");
        } catch (e) {
            console.log("[KICKSCREW] Size options still not found after clicking");
            
            // Debug: Check what's in the DOM now
            const debugHtml = await page.evaluate(() => {
                const radixContent = document.querySelector('[data-radix-menu-content]');
                return {
                    hasRadixMenu: !!radixContent,
                    radixHtml: radixContent?.innerHTML?.substring(0, 500) || 'NOT FOUND',
                };
            });
            console.log(`[KICKSCREW] Has radix menu: ${debugHtml.hasRadixMenu}`);
            console.log(`[KICKSCREW] Radix content: ${debugHtml.radixHtml}`);
        }
        
        // Check count of size elements
        const sizeCount = await page.evaluate(() => {
            return document.querySelectorAll('[data-testid^="size-option-"]').length;
        });
        console.log(`[KICKSCREW] Size elements found: ${sizeCount}`);

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
        console.log(`[KICKSCREW] ========== KICKSCREW SCRAPE COMPLETE ==========`);

        return {
            productName: extractedData.productName,
            productUrl,
            imageUrl: extractedData.imageUrl,
            sizes,
        };
    } catch (error) {
        console.error("[KICKSCREW] ========== KICKSCREW SCRAPE FAILED ==========");
        console.error("[KICKSCREW] Error:", error);
        return null;
    } finally {
        console.log(`[KICKSCREW] Closing browser...`);
        await browser.close();
        console.log(`[KICKSCREW] Browser closed`);
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

