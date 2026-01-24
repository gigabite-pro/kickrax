import { SourceSlug } from "../types.js";

export interface ScraperConfig {
    id: SourceSlug;
    name: string;
    type: "api" | "html";
    baseUrl: string;
    trustLevel: "verified" | "authenticated" | "marketplace";
    rateLimit: { requests: number; windowMs: number };
    enabled: boolean;
    country: "US" | "CA" | "GLOBAL";
}

export const SCRAPER_REGISTRY: ScraperConfig[] = [
    {
        id: "stockx",
        name: "StockX",
        type: "api",
        baseUrl: "https://stockx.com",
        trustLevel: "authenticated",
        rateLimit: { requests: 10, windowMs: 60000 },
        enabled: true,
        country: "GLOBAL",
    },
    {
        id: "goat",
        name: "GOAT",
        type: "api",
        baseUrl: "https://www.goat.com",
        trustLevel: "authenticated",
        rateLimit: { requests: 10, windowMs: 60000 },
        enabled: true,
        country: "GLOBAL",
    },
    {
        id: "flight-club",
        name: "Flight Club",
        type: "api",
        baseUrl: "https://www.flightclub.com",
        trustLevel: "authenticated",
        rateLimit: { requests: 10, windowMs: 60000 },
        enabled: true,
        country: "US",
    },
    {
        id: "stadium-goods",
        name: "Stadium Goods",
        type: "html",
        baseUrl: "https://www.stadiumgoods.com",
        trustLevel: "authenticated",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "US",
    },
    {
        id: "kickscrew",
        name: "KicksCrew",
        type: "html",
        baseUrl: "https://www.kickscrew.com",
        trustLevel: "authenticated",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "GLOBAL",
    },
];
