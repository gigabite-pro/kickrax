import { NextRequest, NextResponse } from 'next/server';
import { searchAllSources } from '@/lib/scrapers';
import { getCachedSearch, setCachedSearch, isMongoConfigured } from '@/lib/db/mongodb';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Search query is required' },
      { status: 400 }
    );
  }

  if (query.length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters' },
      { status: 400 }
    );
  }

  if (query.length > 100) {
    return NextResponse.json(
      { error: 'Search query is too long' },
      { status: 400 }
    );
  }

  const normalizedQuery = query.trim();

  try {
    // Check MongoDB cache first (unless force refresh)
    // Results are cached for 1 minute to avoid hammering scrapers
    if (!forceRefresh && isMongoConfigured()) {
      const cached = await getCachedSearch(normalizedQuery);
      if (cached && cached.length > 0) {
        return NextResponse.json({
          query: normalizedQuery,
          aggregated: cached,
          meta: {
            totalAggregated: cached.length,
            source: 'cache',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // No cache hit - do live scraping
    console.log(`Live scraping for: ${normalizedQuery}`);
    const startTime = Date.now();
    const results = await searchAllSources(normalizedQuery);
    const duration = Date.now() - startTime;

    console.log(
      `Scraping completed in ${duration}ms. Found ${results.listings.length} listings, ${results.aggregated.length} aggregated`
    );

    // Cache the results for next person (1 minute TTL)
    if (results.aggregated.length > 0 && isMongoConfigured()) {
      // Don't await - save in background
      setCachedSearch(normalizedQuery, results.aggregated).catch((err) =>
        console.error('Error caching:', err)
      );
    }

    return NextResponse.json({
      query: normalizedQuery,
      listings: results.listings,
      aggregated: results.aggregated,
      meta: {
        totalListings: results.listings.length,
        totalAggregated: results.aggregated.length,
        duration,
        source: 'live',
        timestamp: new Date().toISOString(),
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('Search API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to search sneakers',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
