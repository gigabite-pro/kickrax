import { MongoClient, Db } from 'mongodb';
import { AggregatedSneaker } from '@/types';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'kickstar';
const CACHE_TTL_SECONDS = 60; // 1 minute cache

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

interface CachedSearch {
  query: string;
  results: AggregatedSneaker[];
  createdAt: Date;
}

async function connectToDatabase(): Promise<{ client: MongoClient; db: Db } | null> {
  // If no MongoDB URI configured, return null (works without DB)
  if (!MONGODB_URI) {
    return null;
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);

    // Create TTL index for automatic expiration
    await db.collection('searchCache').createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: CACHE_TTL_SECONDS }
    );
    
    // Create index on query for fast lookups
    await db.collection('searchCache').createIndex({ query: 1 });

    cachedClient = client;
    cachedDb = db;

    console.log('Connected to MongoDB');
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null;
  }
}

/**
 * Get cached search results if they exist and are fresh (< 1 minute old)
 */
export async function getCachedSearch(query: string): Promise<AggregatedSneaker[] | null> {
  const connection = await connectToDatabase();
  if (!connection) return null;

  try {
    const normalizedQuery = query.toLowerCase().trim();
    const cached = await connection.db
      .collection<CachedSearch>('searchCache')
      .findOne({ query: normalizedQuery });

    if (cached) {
      console.log(`Cache hit for: ${normalizedQuery}`);
      return cached.results;
    }

    return null;
  } catch (error) {
    console.error('Error getting cached search:', error);
    return null;
  }
}

/**
 * Save search results to cache
 */
export async function setCachedSearch(
  query: string,
  results: AggregatedSneaker[]
): Promise<void> {
  const connection = await connectToDatabase();
  if (!connection) return;

  try {
    const normalizedQuery = query.toLowerCase().trim();
    
    await connection.db.collection<CachedSearch>('searchCache').updateOne(
      { query: normalizedQuery },
      {
        $set: {
          query: normalizedQuery,
          results,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`Cached results for: ${normalizedQuery}`);
  } catch (error) {
    console.error('Error caching search:', error);
  }
}

/**
 * Check if MongoDB is configured and available
 */
export function isMongoConfigured(): boolean {
  return !!MONGODB_URI;
}
