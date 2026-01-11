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
        id: "grailed",
        name: "Grailed",
        type: "api",
        baseUrl: "https://www.grailed.com",
        trustLevel: "verified",
        rateLimit: { requests: 10, windowMs: 60000 },
        enabled: true,
        country: "GLOBAL",
    },
    {
        id: "livestock",
        name: "Livestock",
        type: "html",
        baseUrl: "https://www.deadstock.ca",
        trustLevel: "verified",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "CA",
    },
    {
        id: "haven",
        name: "Haven",
        type: "html",
        baseUrl: "https://havenshop.com",
        trustLevel: "verified",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "CA",
    },
    {
        id: "capsule",
        name: "Capsule Toronto",
        type: "html",
        baseUrl: "https://www.capsuletoronto.com",
        trustLevel: "verified",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "CA",
    },
    {
        id: "exclucity",
        name: "Exclucity",
        type: "html",
        baseUrl: "https://www.exclucity.com",
        trustLevel: "verified",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "CA",
    },
    {
        id: "nrml",
        name: "NRML",
        type: "html",
        baseUrl: "https://nrml.ca",
        trustLevel: "verified",
        rateLimit: { requests: 5, windowMs: 60000 },
        enabled: true,
        country: "CA",
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
