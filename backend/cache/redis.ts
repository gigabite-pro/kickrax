import { Redis } from "@upstash/redis";
import { CatalogProduct } from "../types.js";

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
let redis: Redis | null = null;

function getRedis(): Redis | null {
    if (redis) return redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn("[CACHE] Upstash Redis not configured - caching disabled");
        console.warn("[CACHE] Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable");
        return null;
    }

    redis = new Redis({ url, token });
    console.log("[CACHE] Upstash Redis client initialized");
    return redis;
}

// Cache keys
const TRENDING_CACHE_KEY = "kickrax:trending";
const TRENDING_CACHE_TTL = 30 * 60; // 30 minutes in seconds

export interface CachedTrending {
    products: CatalogProduct[];
    cachedAt: string;
    expiresAt: string;
}

/**
 * Get trending products from cache
 * Returns null if not cached or expired
 */
export async function getCachedTrending(): Promise<CachedTrending | null> {
    const client = getRedis();
    if (!client) return null;

    try {
        const cached = await client.get<CachedTrending>(TRENDING_CACHE_KEY);
        if (cached) {
            console.log(`[CACHE] Trending cache HIT (${cached.products.length} products, cached at ${cached.cachedAt})`);
            return cached;
        }
        console.log("[CACHE] Trending cache MISS");
        return null;
    } catch (error) {
        console.error("[CACHE] Error reading trending cache:", error);
        return null;
    }
}

/**
 * Store trending products in cache
 */
export async function setCachedTrending(products: CatalogProduct[]): Promise<boolean> {
    const client = getRedis();
    if (!client) return false;

    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + TRENDING_CACHE_TTL * 1000);

        const cacheData: CachedTrending = {
            products,
            cachedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
        };

        await client.set(TRENDING_CACHE_KEY, cacheData, { ex: TRENDING_CACHE_TTL });
        console.log(`[CACHE] Trending cached (${products.length} products, expires in ${TRENDING_CACHE_TTL / 60} minutes)`);
        return true;
    } catch (error) {
        console.error("[CACHE] Error writing trending cache:", error);
        return false;
    }
}

/**
 * Invalidate trending cache (for manual refresh)
 */
export async function invalidateTrendingCache(): Promise<boolean> {
    const client = getRedis();
    if (!client) return false;

    try {
        await client.del(TRENDING_CACHE_KEY);
        console.log("[CACHE] Trending cache invalidated");
        return true;
    } catch (error) {
        console.error("[CACHE] Error invalidating trending cache:", error);
        return false;
    }
}

/**
 * Check if Redis is available
 */
export function isRedisConfigured(): boolean {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
