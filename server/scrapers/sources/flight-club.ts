import { SOURCES, SneakerListing, SourcePricing, SizePrice } from "../../types.js";
import { ScraperResult, generateListingId } from "../types.js";
import { launchBrowser, createPage } from "../browser.js";

export interface FlightClubSizePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

interface FlightClubVariant {
    size: number;
    lowestPriceCents?: {
        currency: string;
        amount: number;
    };
}

/**
 * Search Flight Club by SKU and get all size prices
 */
export async function searchFlightClubBySku(sku: string): Promise<SourcePricing> {
    const source = SOURCES["flight-club"];
    console.log(`[FLIGHTCLUB] Searching for SKU: ${sku}`);

    const browser = await launchBrowser();

    try {
        const page = await createPage(browser);

        // Step 1: Search Flight Club
        const searchUrl = `https://www.flightclub.com/catalogsearch/result?query=${encodeURIComponent(sku)}`;

        try {
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 20000 });
        } catch (e) {}

        // Wait for product grid
        try {
            await page.waitForSelector('a[data-qa="ProductItemsUrl"]', { timeout: 5000 });
        } catch (e) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        
        const productData = await page.evaluate(() => {
            const link = document.querySelector('a[data-qa="ProductItemsUrl"]') as HTMLAnchorElement;
            if (link) {
                const href = link.getAttribute("href") || "";
                const nameEl = document.querySelector('[data-qa="ProductItemTitle"]');
                return { href, name: nameEl?.textContent?.trim() || "Unknown Product" };
            }
            return null;
        });

        if (!productData || !productData.href) {
            console.log("[FLIGHTCLUB] No product found");
            await browser.close();
            return { source, sizes: [], lowestPrice: 0, available: false };
        }

        const productTemplateId = productData.href.replace(/^\//, "");
        const productUrl = `https://www.flightclub.com${productData.href}`;
        
        console.log(`[FLIGHTCLUB] Found: ${productUrl}`);

        // Step 2: Navigate to product page
        try {
            await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        } catch (e) {}

        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Step 3: Call API from browser
        const apiUrl = `https://www.flightclub.com/web-api/v1/product_variants?countryCode=CA&productTemplateId=${productTemplateId}&currency=CAD`;

        const apiData = await page.evaluate(async (url: string) => {
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: { "Accept": "application/json", "x-goat-app": "sneakers", "x-goat-sales-channel": "2" },
                    credentials: "include",
                });
                if (!response.ok) return { error: `HTTP ${response.status}`, data: null };
                return { error: null, data: await response.json() };
            } catch (err: any) {
                return { error: err.message, data: null };
            }
        }, apiUrl);

        if (apiData.error) {
            console.log(`[FLIGHTCLUB] API Error: ${apiData.error}`);
            await browser.close();
            return { source, sizes: [], lowestPrice: 0, available: false };
        }

        const rawData = apiData.data;
        const variants: FlightClubVariant[] = Array.isArray(rawData) ? rawData : rawData?.productVariants || [];

        // Use Map to track lowest price per size
        const sizeMap = new Map<string, number>();

        for (const variant of variants) {
            if (variant.lowestPriceCents?.currency === "CAD" && variant.lowestPriceCents?.amount) {
                const priceCAD = Math.round(variant.lowestPriceCents.amount / 100);
                const size = String(variant.size);
                const existing = sizeMap.get(size);
                if (!existing || priceCAD < existing) {
                    sizeMap.set(size, priceCAD);
                }
            }
        }

        const sizes: SizePrice[] = [];
        for (const [size, priceCAD] of Array.from(sizeMap.entries())) {
            sizes.push({
        size,
                price: priceCAD,
                priceCAD,
                currency: "CAD" as const,
                url: `${productUrl}?size=${size}`,
        available: true,
            });
        }

        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        const lowestPrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.priceCAD)) : 0;

        console.log(`[FLIGHTCLUB] Found ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[FLIGHTCLUB] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(', ')}`);
        }

        await browser.close();

        return { source, sizes, lowestPrice, available: sizes.length > 0 };
    } catch (error) {
        console.error("[FLIGHTCLUB] Error:", error);
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
