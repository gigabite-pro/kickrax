import puppeteer from "puppeteer";
import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, generateListingId } from "../types.js";

export interface FlightClubSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

interface FlightClubVariant {
    size: number;
    sizeOption?: {
        presentation: string;
        value: number;
    };
    shoeCondition?: string;
    boxCondition?: string;
    lowestPriceCents?: {
        currency: string;
        amount: number;
        amountUsdCents?: number;
    };
}

interface FlightClubApiResponse {
    productTemplateExternalId?: string;
    productVariants?: FlightClubVariant[];
}

/**
 * Search Flight Club by SKU and get all size prices
 */
export async function searchFlightClubBySku(sku: string): Promise<SourcePricing> {
    const source = SOURCES["flight-club"];
    console.log(`[FLIGHTCLUB] ========== STARTING FLIGHTCLUB SCRAPE ==========`);
    console.log(`[FLIGHTCLUB] SKU: ${sku}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
        ],
    });
    console.log(`[FLIGHTCLUB] Browser launched`);

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        );

        // Step 1: Search Flight Club
        const searchUrl = `https://www.flightclub.com/catalogsearch/result?query=${encodeURIComponent(sku)}`;
        console.log(`[FLIGHTCLUB] Step 1: Searching: ${searchUrl}`);

        try {
            await page.goto(searchUrl, {
                waitUntil: "networkidle2",
                timeout: 30000,
            });
            console.log(`[FLIGHTCLUB] Search page loaded`);
        } catch (navError) {
            console.log(`[FLIGHTCLUB] Navigation error: ${navError}`);
        }

        // Wait for product grid to load
        console.log(`[FLIGHTCLUB] Step 2: Waiting for product grid...`);
        try {
            await page.waitForSelector('a[data-qa="ProductItemsUrl"]', { timeout: 10000 });
            console.log(`[FLIGHTCLUB] Product grid found`);
        } catch (e) {
            console.log(`[FLIGHTCLUB] Product grid not found, waiting more...`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        
        const productData = await page.evaluate(() => {
            // Look for product links with data-qa="ProductItemsUrl"
            const link = document.querySelector('a[data-qa="ProductItemsUrl"]') as HTMLAnchorElement;
            if (link) {
                const href = link.getAttribute("href") || "";
                const nameEl = document.querySelector('[data-qa="ProductItemTitle"]');
                const name = nameEl?.textContent?.trim() || "Unknown Product";
                const imgEl = link.querySelector("img") as HTMLImageElement;
                const imageUrl = imgEl?.src || "";
                return { href, name, imageUrl };
            }
            return null;
        });

        if (!productData || !productData.href) {
            console.log(`[FLIGHTCLUB] No product found for SKU: ${sku}`);
            await browser.close();
            return { source, sizes: [], lowestPrice: 0, available: false };
        }

        // Extract productTemplateId from href (remove leading /)
        const productTemplateId = productData.href.replace(/^\//, "");
        const productUrl = `https://www.flightclub.com${productData.href}`;
        
        console.log(`[FLIGHTCLUB] Found product: ${productData.name}`);
        console.log(`[FLIGHTCLUB] Product URL: ${productUrl}`);
        console.log(`[FLIGHTCLUB] Product Template ID: ${productTemplateId}`);

        // Step 3: Navigate to product page to get cookies
        console.log(`[FLIGHTCLUB] Step 3: Navigating to product page...`);
        try {
            await page.goto(productUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            console.log(`[FLIGHTCLUB] Product page loaded`);
        } catch (navError) {
            console.log(`[FLIGHTCLUB] Product page nav error (continuing): ${navError}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Step 4: Call Flight Club API from within the browser context
        const apiUrl = `https://www.flightclub.com/web-api/v1/product_variants?countryCode=CA&productTemplateId=${productTemplateId}&currency=CAD`;
        console.log(`[FLIGHTCLUB] Step 4: Calling API from browser: ${apiUrl}`);

        const apiData = await page.evaluate(async (url: string) => {
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "x-goat-app": "sneakers",
                        "x-goat-sales-channel": "2",
                    },
                    credentials: "include",
                });
                
                if (!response.ok) {
                    return { error: `HTTP ${response.status}`, data: null };
                }
                
                const data = await response.json();
                return { error: null, data };
            } catch (err: any) {
                return { error: err.message, data: null };
            }
        }, apiUrl);

        if (apiData.error) {
            console.log(`[FLIGHTCLUB] API Error: ${apiData.error}`);
            await browser.close();
            return { source, sizes: [], lowestPrice: 0, available: false };
        }

        // API returns an array directly or object with productVariants
        const rawData = apiData.data;
        const variants: FlightClubVariant[] = Array.isArray(rawData) 
            ? rawData 
            : (rawData as FlightClubApiResponse)?.productVariants || [];
        
        console.log(`[FLIGHTCLUB] Found ${variants.length} variants`);

        // Use Map to track lowest price per size
        const sizeMap = new Map<string, number>();

        for (const variant of variants) {
            // Only use if currency is CAD
            if (variant.lowestPriceCents?.currency === "CAD" && variant.lowestPriceCents?.amount) {
                const priceCAD = Math.round(variant.lowestPriceCents.amount / 100);
                const size = String(variant.size);
                const existing = sizeMap.get(size);

                // Keep only the lowest price for each size
                if (!existing || priceCAD < existing) {
                    sizeMap.set(size, priceCAD);
                    console.log(`[FLIGHTCLUB] Size ${size}: CA$${priceCAD}`);
                }
            }
        }

        // Convert map to array
        const sizes: SizePrice[] = [];
        for (const [size, priceCAD] of sizeMap) {
            sizes.push({
                size,
                price: priceCAD,
                priceCAD,
                currency: "CAD" as const,
                url: `${productUrl}?size=${size}`,
                available: true,
            });
        }

        // Sort by size
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.priceCAD)) : 0;

        console.log(`[FLIGHTCLUB] Total sizes with prices: ${sizes.length}`);
        console.log(`[FLIGHTCLUB] Lowest price: CA$${lowestPrice}`);
        console.log(`[FLIGHTCLUB] ========== FLIGHTCLUB SCRAPE COMPLETE ==========`);

        await browser.close();

        return {
            source,
            sizes,
            lowestPrice,
            available: sizes.length > 0,
        };
    } catch (error) {
        console.error(`[FLIGHTCLUB] ========== FLIGHTCLUB SCRAPE FAILED ==========`);
        console.error(`[FLIGHTCLUB] Error:`, error);
        await browser.close();
        return { source, sizes: [], lowestPrice: 0, available: false };
    }
}

/**
 * Legacy search function for backwards compatibility
 */
export async function searchFlightClub(query: string): Promise<ScraperResult> {
    const source = SOURCES["flight-club"];
    const result = await searchFlightClubBySku(query);

    if (!result || result.sizes.length === 0) {
        return { success: false, listings: [], source, error: "No results found" };
    }

    const listings: SneakerListing[] = result.sizes.map((sizeData, index) => ({
        id: generateListingId("flight-club", `${index}`),
        name: `Flight Club - Size ${sizeData.size}`,
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
