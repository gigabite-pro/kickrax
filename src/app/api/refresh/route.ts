import { NextRequest, NextResponse } from 'next/server';
import { searchAllSources } from '@/lib/scrapers';
import { setCachedSearch, isMongoConfigured } from '@/lib/db/mongodb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/refresh
 * Triggers a fresh scrape for a specific query, bypassing cache
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Valid search query is required' },
        { status: 400 }
      );
    }

    const normalizedQuery = query.trim();

    console.log(`Manual refresh for: ${normalizedQuery}`);

    // Perform live scraping
    const startTime = Date.now();
    const results = await searchAllSources(normalizedQuery);
    const duration = Date.now() - startTime;

    console.log(
      `Refresh completed in ${duration}ms. Found ${results.listings.length} listings`
    );

    // Update cache with fresh results
    if (results.aggregated.length > 0 && isMongoConfigured()) {
      await setCachedSearch(normalizedQuery, results.aggregated);
    }

    return NextResponse.json({
      success: true,
      query: normalizedQuery,
      aggregated: results.aggregated,
      meta: {
        totalListings: results.listings.length,
        totalAggregated: results.aggregated.length,
        duration,
        timestamp: new Date().toISOString(),
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('Refresh API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to refresh prices',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
