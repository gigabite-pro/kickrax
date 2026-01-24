import { Redis } from "@upstash/redis";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const TRENDING_KEY = "trending:products";
const SIX_HOURS_SEC = 6 * 60 * 60;
export const TRENDING_TTL_SECONDS = SIX_HOURS_SEC;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  if (!redis) {
    redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
    console.log("[Redis] Upstash client initialized");
  }
  return redis;
}

export function isRedisConfigured(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

export interface TrendingCachePayload {
  products: unknown[];
  meta: { total: number; timestamp: string };
}

export async function getTrendingCache(): Promise<TrendingCachePayload | null> {
  const client = getRedis();
  if (!client) {
    console.log("[Redis] Not configured (missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN), skip cache");
    return null;
  }

  try {
    console.log("[Redis] Checking trending cache...");
    const raw = await client.get(TRENDING_KEY);
    if (raw == null) {
      console.log("[Redis] Cache miss (key missing or empty)");
      return null;
    }
    // Upstash auto-deserializes JSON: get() returns object when we stored JSON.stringify(...)
    let data: TrendingCachePayload;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw) as TrendingCachePayload;
      } catch {
        console.log("[Redis] Cache miss (invalid JSON string)");
        return null;
      }
    } else if (typeof raw === "object" && raw !== null && Array.isArray((raw as TrendingCachePayload).products)) {
      data = raw as TrendingCachePayload;
    } else {
      console.log("[Redis] Cache miss (invalid payload shape)");
      return null;
    }
    if (!data.meta?.timestamp) {
      console.log("[Redis] Cache miss (missing meta)");
      return null;
    }
    console.log(`[Redis] Cache hit (${data.products.length} products, cached at ${data.meta.timestamp})`);
    return data;
  } catch (err) {
    console.error("[Redis] getTrendingCache error:", err);
    return null;
  }
}

export async function setTrendingCache(payload: TrendingCachePayload): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.set(TRENDING_KEY, JSON.stringify(payload), {
      ex: SIX_HOURS_SEC,
    });
    console.log(`[Redis] Cached trending: ${payload.products.length} products, TTL 6h (${SIX_HOURS_SEC}s)`);
  } catch (err) {
    console.error("[Redis] setTrendingCache error:", err);
  }
}
