/**
 * Scraper Client
 * 
 * HTTP client for calling the Fly.io scraper service.
 * Used by the Render API when scraping is needed (cache miss).
 */

import { CatalogProduct } from "../types.js";

// Scraper service configuration
// Default to localhost for development, set SCRAPER_URL for production
const SCRAPER_URL = process.env.SCRAPER_URL || "http://localhost:3000";
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

// Log scraper configuration on startup
const isLocal = SCRAPER_URL.includes("localhost") || SCRAPER_URL.includes("127.0.0.1");
const isFlyio = SCRAPER_URL.includes("fly.dev");
console.log(`[SCRAPER-CLIENT] Mode: ${isLocal ? "🏠 LOCAL" : isFlyio ? "🚀 FLY.IO" : "🌐 CUSTOM"}`);
console.log(`[SCRAPER-CLIENT] URL: ${SCRAPER_URL}`);

// Timeout for scraper requests (scraping can take a while)
const SCRAPER_TIMEOUT = 60000; // 60 seconds

interface ScraperResponse<T> {
    success: boolean;
    data?: T;
    products?: CatalogProduct[];
    error?: string;
    meta?: {
        duration: number;
        count?: number;
        timestamp: string;
    };
}

/**
 * Call the Fly.io scraper service
 */
async function callScraper<T>(endpoint: string, params?: Record<string, string>): Promise<ScraperResponse<T>> {
    const url = new URL(endpoint, SCRAPER_URL);
    
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (SCRAPER_API_KEY) {
        headers["Authorization"] = `Bearer ${SCRAPER_API_KEY}`;
    }

    console.log(`[SCRAPER-CLIENT] Calling ${url.toString()}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT);

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[SCRAPER-CLIENT] Error ${response.status}: ${errorBody}`);
            return {
                success: false,
                error: `Scraper returned ${response.status}: ${errorBody}`,
            };
        }

        const data = await response.json() as ScraperResponse<T>;
        console.log(`[SCRAPER-CLIENT] Success (${data.meta?.duration || 0}ms)`);
        return data;
    } catch (error) {
        clearTimeout(timeout);
        
        if (error instanceof Error) {
            if (error.name === "AbortError") {
                console.error(`[SCRAPER-CLIENT] Timeout after ${SCRAPER_TIMEOUT}ms`);
                return { success: false, error: "Scraper request timed out" };
            }
            console.error(`[SCRAPER-CLIENT] Error: ${error.message}`);
            return { success: false, error: error.message };
        }
        
        return { success: false, error: "Unknown error" };
    }
}

/**
 * Scrape trending products from StockX
 */
export async function scrapeTrending(): Promise<CatalogProduct[]> {
    const response = await callScraper<CatalogProduct[]>("/scrape/trending");
    
    if (!response.success || !response.products) {
        console.error(`[SCRAPER-CLIENT] Trending scrape failed: ${response.error}`);
        return [];
    }

    return response.products;
}

/**
 * Scrape search results from StockX
 */
export async function scrapeSearch(query: string): Promise<CatalogProduct[]> {
    const response = await callScraper<CatalogProduct[]>("/scrape/search", { q: query });
    
    if (!response.success || !response.products) {
        console.error(`[SCRAPER-CLIENT] Search scrape failed: ${response.error}`);
        return [];
    }

    return response.products;
}

/**
 * Scrape StockX product page
 */
export interface StockXProductData {
    styleId: string | null;
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

export async function scrapeStockXProduct(url: string): Promise<StockXProductData | null> {
    const response = await callScraper<StockXProductData>("/scrape/stockx/product", { url });
    
    if (!response.success || !response.data) {
        console.error(`[SCRAPER-CLIENT] StockX product scrape failed: ${response.error}`);
        return null;
    }

    return response.data;
}

/**
 * Scrape GOAT prices by SKU
 */
export interface SourcePricing {
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

export async function scrapeGoat(sku: string): Promise<SourcePricing | null> {
    const response = await callScraper<SourcePricing>("/scrape/goat", { sku });
    
    if (!response.success) {
        console.error(`[SCRAPER-CLIENT] GOAT scrape failed: ${response.error}`);
        return null;
    }

    return response.data || null;
}

/**
 * Scrape KicksCrew prices by SKU
 */
export async function scrapeKickscrew(sku: string): Promise<SourcePricing | null> {
    const response = await callScraper<SourcePricing>("/scrape/kickscrew", { sku });
    
    if (!response.success) {
        console.error(`[SCRAPER-CLIENT] KicksCrew scrape failed: ${response.error}`);
        return null;
    }

    return response.data || null;
}

/**
 * Scrape FlightClub prices by SKU
 */
export async function scrapeFlightclub(sku: string): Promise<SourcePricing | null> {
    const response = await callScraper<SourcePricing>("/scrape/flightclub", { sku });
    
    if (!response.success) {
        console.error(`[SCRAPER-CLIENT] FlightClub scrape failed: ${response.error}`);
        return null;
    }

    return response.data || null;
}

/**
 * Scrape StadiumGoods prices by SKU
 */
export async function scrapeStadiumgoods(sku: string): Promise<SourcePricing | null> {
    const response = await callScraper<SourcePricing>("/scrape/stadiumgoods", { sku });
    
    if (!response.success) {
        console.error(`[SCRAPER-CLIENT] StadiumGoods scrape failed: ${response.error}`);
        return null;
    }

    return response.data || null;
}

/**
 * Scrape all price sources by SKU
 */
export interface AllPricesData {
    goat: SourcePricing | null;
    kickscrew: SourcePricing | null;
    flightclub: SourcePricing | null;
    stadiumgoods: SourcePricing | null;
}

export async function scrapeAllPrices(sku: string): Promise<AllPricesData> {
    const response = await callScraper<AllPricesData>("/scrape/prices", { sku });
    
    if (!response.success || !response.data) {
        console.error(`[SCRAPER-CLIENT] All prices scrape failed: ${response.error}`);
        return {
            goat: null,
            kickscrew: null,
            flightclub: null,
            stadiumgoods: null,
        };
    }

    return response.data;
}

/**
 * Check if scraper service is configured
 */
export function isScraperConfigured(): boolean {
    return !!process.env.SCRAPER_URL;
}

/**
 * Get scraper service URL (for debugging)
 */
export function getScraperUrl(): string {
    return SCRAPER_URL;
}
