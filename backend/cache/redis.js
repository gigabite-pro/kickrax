import { Redis } from "@upstash/redis";

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
let redis = null;

function getRedis() {
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

/**
 * Get trending products from cache
 * Returns null if not cached or expired
 */
export async function getCachedTrending() {
    const client = getRedis();
    if (!client) return null;

    try {
        const cached = await client.get(TRENDING_CACHE_KEY);
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
export async function setCachedTrending(products) {
    const client = getRedis();
    if (!client) return false;

    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + TRENDING_CACHE_TTL * 1000);

        const cacheData = {
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
export async function invalidateTrendingCache() {
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
export function isRedisConfigured() {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
