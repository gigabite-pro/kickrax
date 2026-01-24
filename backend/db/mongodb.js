import { MongoClient } from 'mongodb';
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'kickstar';
const CACHE_TTL_SECONDS = 60;
let cachedClient = null;
let cachedDb = null;
async function connectToDatabase() {
    if (!MONGODB_URI)
        return null;
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db(MONGODB_DB);
        await db.collection('searchCache').createIndex({ createdAt: 1 }, { expireAfterSeconds: CACHE_TTL_SECONDS });
        await db.collection('searchCache').createIndex({ query: 1 });
        cachedClient = client;
        cachedDb = db;
        console.log('Connected to MongoDB');
        return { client, db };
    }
    catch (error) {
        console.error('MongoDB connection error:', error);
        return null;
    }
}
export async function getCachedSearch(query) {
    const connection = await connectToDatabase();
    if (!connection)
        return null;
    try {
        const normalizedQuery = query.toLowerCase().trim();
        const cached = await connection.db
            .collection('searchCache')
            .findOne({ query: normalizedQuery });
        if (cached) {
            console.log(`Cache hit for: ${normalizedQuery}`);
            return cached.results;
        }
        return null;
    }
    catch (error) {
        console.error('Error getting cached search:', error);
        return null;
    }
}
export async function setCachedSearch(query, results) {
    const connection = await connectToDatabase();
    if (!connection)
        return;
    try {
        const normalizedQuery = query.toLowerCase().trim();
        await connection.db.collection('searchCache').updateOne({ query: normalizedQuery }, {
            $set: {
                query: normalizedQuery,
                results,
                createdAt: new Date(),
            },
        }, { upsert: true });
        console.log(`Cached results for: ${normalizedQuery}`);
    }
    catch (error) {
        console.error('Error caching search:', error);
    }
}
export function isMongoConfigured() {
    return !!MONGODB_URI;
}
//# sourceMappingURL=mongodb.js.map