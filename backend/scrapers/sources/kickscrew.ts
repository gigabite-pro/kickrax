import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, generateListingId, USD_TO_CAD_RATE } from "../types.js";
import { launchBrowser, createPage, AbortSignal, checkAbort, sleepWithAbort } from "../browser.js";

export interface KickscrewSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

/**
 * Search KicksCrew by SKU and get all size prices from the first result
 */
export async function searchKickscrewBySku(sku: string, signal?: AbortSignal): Promise<KickscrewSizePricing | null> {
    console.log(`[KICKSCREW] Searching for SKU: ${sku}`);
    
    const browser = await launchBrowser();

    try {
        checkAbort(signal, 'KICKSCREW');
        const page = await createPage(browser);

        // Step 1: Search KicksCrew
        const searchUrl = `https://www.kickscrew.com/en-CA/search?q=${encodeURIComponent(sku)}`;
        
        try {
            checkAbort(signal, 'KICKSCREW');
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
            // Continue even if timeout
        }
        
        await sleepWithAbort(2000, signal, 'KICKSCREW');

        // Wait for product grid
        try {
            await page.waitForSelector('ul li a[href*="/products/"]', { timeout: 5000 });
        } catch (e) {
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

        // Step 2: Navigate to product page
        try {
            checkAbort(signal, 'KICKSCREW');
            await page.goto(productUrl, { waitUntil: "networkidle0", timeout: 30000 });
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
            // Continue even if timeout
        }
        
        // Wait for page to fully render
        await sleepWithAbort(4000, signal, 'KICKSCREW');

        // Get product name
        const productName = await page.evaluate(() => {
            return document.querySelector('h1')?.textContent?.trim() || 'Unknown Product';
        });

        console.log(`[KICKSCREW] Product: ${productName}`);

        // Try multiple selectors for size picker
        const sizePickerSelectors = [
            '.size-picker',
            'button[aria-label*="size" i]',
            'button[aria-label*="Size" i]',
            '[data-testid="size-picker"]',
            'button:has-text("Select Size")',
            '.size-selector',
            '[class*="size-picker"]',
            '[class*="SizePicker"]',
        ];

        let sizePickerClicked = false;
        for (const selector of sizePickerSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                await page.click(selector);
                sizePickerClicked = true;
                console.log(`[KICKSCREW] Clicked size picker: ${selector}`);
                break;
            } catch (e) {
                // Try next selector
            }
        }

        if (!sizePickerClicked) {
            // Try clicking by evaluating directly
            const clicked = await page.evaluate(() => {
                // Look for any button that might be a size picker
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const btn of buttons) {
                    const text = btn.textContent?.toLowerCase() || '';
                    const aria = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    const className = btn.className?.toLowerCase() || '';
                    if (text.includes('size') || aria.includes('size') || className.includes('size')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            if (clicked) {
                sizePickerClicked = true;
                console.log(`[KICKSCREW] Clicked size picker via evaluate`);
            }
        }

        if (!sizePickerClicked) {
            console.log("[KICKSCREW] Size picker not found, trying to extract sizes directly");
        }

        // Wait for dropdown to appear
        await sleepWithAbort(2000, signal, 'KICKSCREW');

        // Wait for size options
        try {
            await page.waitForSelector('[data-testid^="size-option-"]', { timeout: 5000 });
        } catch (e) {
            // Try alternative size option selectors
            try {
                await page.waitForSelector('li[role="menuitem"]', { timeout: 3000 });
            } catch (e2) {
                // Continue anyway
            }
        }

        // Extract sizes
        const extractedData = await page.evaluate(() => {
            // Try primary selector
            let sizeItems = Array.from(document.querySelectorAll('[data-testid^="size-option-"]'));
            
            // If no items found, try alternative selectors
            if (sizeItems.length === 0) {
                sizeItems = Array.from(document.querySelectorAll('li[role="menuitem"]'));
            }
            if (sizeItems.length === 0) {
                sizeItems = Array.from(document.querySelectorAll('ol li'));
            }
            
            const sizes: { size: string; price: string | null; available: boolean }[] = [];

            sizeItems.forEach((item) => {
                const isAvailable = item.getAttribute("data-available") !== "false";
                const sizeEl = item.querySelector(".font-semibold") || item.querySelector('[class*="size"]');
                const sizeText = sizeEl?.textContent?.trim() || item.textContent?.trim() || "";
                const priceEl = item.querySelector(".text-sm:not(.font-semibold), .text-xs") || item.querySelector('[class*="price"]');
                let priceText = priceEl?.textContent?.trim() || null;

                if (priceText === "$--" || priceText?.includes("--")) {
                    priceText = null;
                }

                const sizeMatch = sizeText.match(/([\d.]+)/);
                const size = sizeMatch ? sizeMatch[1] : sizeText;

                if (size && /^\d/.test(size)) {
                    sizes.push({ size, price: isAvailable ? priceText : null, available: isAvailable });
                }
            });

            const imageEl = document.querySelector('img[alt*="product"], img[src*="cdn.kickscrew"]') as HTMLImageElement | null;
            return { sizes, imageUrl: imageEl?.src || "", itemCount: sizeItems.length };
        });

        console.log(`[KICKSCREW] Found ${extractedData.itemCount} size items in DOM`);

        // Convert to our format
        const sizes: { size: string; price: number; priceCAD: number }[] = [];

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

        return {
            productName,
            productUrl,
            imageUrl: extractedData.imageUrl,
            sizes,
        };
    } catch (error) {
        if (error instanceof Error && error.message === 'ABORTED') {
            console.log('[KICKSCREW] Scraping aborted, closing browser');
        } else {
            console.error("[KICKSCREW] Error:", error);
        }
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
