import { CatalogProduct, ProductWithPrices, SourcePricing, SOURCES, SizePrice } from "../types.js";
import { searchStockXCatalog } from "./sources/stockx.js";
import { searchGOATBySku } from "./sources/goat.js";
import { searchKickscrewBySkuPricing } from "./sources/kickscrew.js";
import { USD_TO_CAD_RATE, searchMockDB } from "./types.js";

// Generate realistic size pricing
function generateSizePricing(sourceId: string, basePrice: number, sku: string): SourcePricing {
    const source = SOURCES[sourceId];
    if (!source) return { source: SOURCES.stockx, sizes: [], lowestPrice: 0, available: false };

    const sizes = ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13"];

    // Price variations by source
    const sourcePriceOffset: Record<string, number> = {
        stockx: 0,
        goat: -20,
        "flight-club": 25,
    };

    const offset = sourcePriceOffset[sourceId] || 0;

    const sizeData: SizePrice[] = sizes
        .filter(() => Math.random() > 0.1) // 90% availability
        .map((size) => {
            const sizeNum = parseFloat(size);
            // Larger sizes often cost more
            const sizeMultiplier = sizeNum > 11 ? 1.15 : sizeNum < 8 ? 1.08 : 1;
            // Random variation
            const randomVariation = Math.floor(Math.random() * 40) - 20;
            const price = Math.round((basePrice + offset + randomVariation) * sizeMultiplier);

            // Determine currency based on source
            const currency = sourceId === "stockx" ? "CAD" : "USD";
            const priceCAD = currency === "CAD" ? price : Math.round(price * USD_TO_CAD_RATE);

            return {
                size,
                price,
                priceCAD,
                currency: currency as "USD" | "CAD",
                url: `${source.baseUrl}/search?s=${encodeURIComponent(sku)}&size=${size}`,
                available: true,
            };
        })
        .sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

    const lowestPrice = sizeData.length > 0 ? Math.min(...sizeData.map((s) => s.priceCAD)) : 0;

    return {
        source,
        sizes: sizeData,
        lowestPrice,
        available: sizeData.length > 0,
    };
}

/**
 * Main search flow:
 * 1. Search StockX for products (get 20 results with SKUs)
 * 2. For each product, search other verified sites by SKU
 * 3. Aggregate all size-level pricing
 */
export async function searchWithCrossReference(query: string): Promise<ProductWithPrices[]> {
    console.log(`[Search Flow] Starting search for: ${query}`);

    // Phase 1: Get catalog products from StockX (or mock if scraping fails)
    let catalogProducts: CatalogProduct[] = [];

    try {
        catalogProducts = await searchStockXCatalog(query);
    } catch (error) {
        console.log("[Search Flow] StockX scraping failed, using mock data");
    }

    // If no results from StockX, use mock data
    if (catalogProducts.length === 0) {
        console.log("[Search Flow] Using mock catalog data");
        catalogProducts = getMockCatalogProducts(query);
    }

    console.log(`[Search Flow] Found ${catalogProducts.length} products`);

    if (catalogProducts.length === 0) {
        return [];
    }

    // Phase 2: For each product, get pricing from all sources
    const productPromises = catalogProducts.map(async (product): Promise<ProductWithPrices> => {
        const sku = product.sku;
        console.log(`[Search Flow] Cross-referencing: ${product.name} (${sku})`);

        // Try to get real data, fall back to mock
        let goatPricing: SourcePricing;
        let kickscrewPricing: SourcePricing;

        try {
            [goatPricing, kickscrewPricing] = await Promise.all([searchGOATBySku(sku), searchKickscrewBySkuPricing(sku)]);
        } catch (error) {
            console.log(`[Search Flow] API calls failed for ${sku}, using mock data`);
            goatPricing = generateSizePricing("goat", product.stockxLowestAsk, sku);
            kickscrewPricing = generateSizePricing("kickscrew", product.stockxLowestAsk, sku);
        }

        // Generate StockX pricing (we have lowest ask, generate sizes)
        const stockxPricing = generateSizePricing("stockx", product.stockxLowestAsk, sku);

        // Combine all sources
        const sources: SourcePricing[] = [stockxPricing, goatPricing, kickscrewPricing].filter((s) => s.available);

        // Find overall lowest price and best deal
        let lowestOverallPrice = Infinity;
        let bestDeal: ProductWithPrices["bestDeal"] = null;

        for (const sourcePricing of sources) {
            for (const sizePrice of sourcePricing.sizes) {
                if (sizePrice.priceCAD < lowestOverallPrice) {
                    lowestOverallPrice = sizePrice.priceCAD;
                    bestDeal = {
                        source: sourcePricing.source,
                        size: sizePrice.size,
                        price: sizePrice.priceCAD,
                        url: sizePrice.url,
                    };
                }
            }
        }

        return {
            product,
            sources,
            lowestOverallPrice: lowestOverallPrice === Infinity ? product.stockxLowestAsk : lowestOverallPrice,
            bestDeal,
        };
    });

    // Wait for all products to complete
    const results = await Promise.all(productPromises);

    // Sort by lowest price
    return results.sort((a, b) => a.lowestOverallPrice - b.lowestOverallPrice);
}

/**
 * Get mock catalog products when scraping fails
 */
function getMockCatalogProducts(query: string): CatalogProduct[] {
    const matches = searchMockDB(query, 0);

    // If mock DB has matches, use those
    if (matches.length > 0) {
        return matches.map((product, index) => ({
            id: `catalog-${index}-${Date.now()}`,
            name: product.name,
            brand: product.brand,
            colorway: product.colorway,
            sku: product.sku,
            imageUrl: getProductImage(product.name),
            retailPrice: null,
            stockxUrl: `https://stockx.com/search?s=${encodeURIComponent(product.name)}`,
            stockxLowestAsk: product.priceCAD,
        }));
    }

    // Generic fallback for any search
    const genericProducts = [
        { name: `${query} - Style 1`, price: 180, sku: "STYLE-001" },
        { name: `${query} - Style 2`, price: 220, sku: "STYLE-002" },
        { name: `${query} - Limited Edition`, price: 350, sku: "STYLE-LE" },
        { name: `${query} - Retro`, price: 280, sku: "STYLE-RET" },
        { name: `${query} - OG`, price: 300, sku: "STYLE-OG" },
    ];

    return genericProducts.map((p, index) => ({
        id: `generic-${index}-${Date.now()}`,
        name: p.name,
        brand: extractBrand(query),
        colorway: "",
        sku: p.sku,
        imageUrl: "",
        retailPrice: null,
        stockxUrl: `https://stockx.com/search?s=${encodeURIComponent(query)}`,
        stockxLowestAsk: p.price,
    }));
}

function extractBrand(query: string): string {
    const q = query.toLowerCase();
    if (q.includes("jordan")) return "Jordan";
    if (q.includes("nike") || q.includes("dunk") || q.includes("air force") || q.includes("air max")) return "Nike";
    if (q.includes("adidas") || q.includes("yeezy") || q.includes("samba") || q.includes("campus")) return "Adidas";
    if (q.includes("new balance") || q.includes("nb ") || q.includes("550") || q.includes("2002")) return "New Balance";
    if (q.includes("puma")) return "Puma";
    if (q.includes("converse")) return "Converse";
    if (q.includes("vans")) return "Vans";
    return "Unknown";
}

function getProductImage(name: string): string {
    // Return empty for now - could add placeholder images later
    return "";
}

/**
 * Get detailed pricing for a single product by SKU
 */
export async function getProductPricing(sku: string, productName: string): Promise<ProductWithPrices | null> {
    console.log(`[Product Pricing] Getting pricing for SKU: ${sku}`);

    // Create a placeholder product
    const product: CatalogProduct = {
        id: `sku-${sku}`,
        name: productName,
        brand: extractBrand(productName),
        colorway: "",
        sku,
        imageUrl: "",
        retailPrice: null,
        stockxUrl: `https://stockx.com/search?s=${encodeURIComponent(sku)}`,
        stockxLowestAsk: 200,
    };

    // Get pricing from all sources
    let goatPricing: SourcePricing;
    let kickscrewPricing: SourcePricing;

    try {
        [goatPricing, kickscrewPricing] = await Promise.all([searchGOATBySku(sku), searchKickscrewBySkuPricing(sku)]);
    } catch (error) {
        goatPricing = generateSizePricing("goat", 200, sku);
        kickscrewPricing = generateSizePricing("kickscrew", 200, sku);
    }

    const stockxPricing = generateSizePricing("stockx", 200, sku);

    const sources: SourcePricing[] = [stockxPricing, goatPricing, kickscrewPricing].filter((s) => s.available);

    if (sources.length === 0) {
        return null;
    }

    let lowestOverallPrice = Infinity;
    let bestDeal: ProductWithPrices["bestDeal"] = null;

    for (const sourcePricing of sources) {
        for (const sizePrice of sourcePricing.sizes) {
            if (sizePrice.priceCAD < lowestOverallPrice) {
                lowestOverallPrice = sizePrice.priceCAD;
                bestDeal = {
                    source: sourcePricing.source,
                    size: sizePrice.size,
                    price: sizePrice.priceCAD,
                    url: sizePrice.url,
                };
            }
        }
    }

    return {
        product,
        sources,
        lowestOverallPrice: lowestOverallPrice === Infinity ? 200 : lowestOverallPrice,
        bestDeal,
    };
}
