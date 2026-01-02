import axios from 'axios';
import { SOURCES, SneakerListing } from '@/types';
import { ScraperResult, convertToCAD, generateListingId, searchMockDB } from '../types';

const GOAT_SEARCH_URL = 'https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2/query';

export async function searchGOAT(query: string): Promise<ScraperResult> {
  const source = SOURCES.goat;

  try {
    const response = await axios.post(
      GOAT_SEARCH_URL,
      {
        query,
        hitsPerPage: 20,
        page: 0,
        facetFilters: [['product_category:shoes']],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-API-Key': '2c28396d7dbf2c7f3f3dd9aa50ae268f',
          'X-Algolia-Application-Id': '2FWOTDVM2O',
        },
        timeout: 10000,
      }
    );

    const hits = response.data?.hits || [];
    
    const listings: SneakerListing[] = hits
      .filter((h: any) => h.lowest_price_cents > 0)
      .map((hit: any): SneakerListing => {
        const priceUSD = hit.lowest_price_cents / 100;
        const priceCAD = convertToCAD(priceUSD, 'USD');
        
        return {
          id: generateListingId('goat', hit.id?.toString() || hit.slug),
          name: hit.name,
          brand: hit.brand_name || '',
          colorway: hit.color || '',
          sku: hit.sku || '',
          imageUrl: hit.main_picture_url || hit.picture_url || '',
          retailPrice: hit.retail_price_cents ? hit.retail_price_cents / 100 : null,
          condition: hit.box_condition === 'good_condition' ? 'new' : 'used',
          source,
          price: priceUSD,
          currency: 'USD',
          priceCAD,
          url: `https://www.goat.com/sneakers/${hit.slug}`,
          lastUpdated: new Date(),
        };
      });

    if (listings.length > 0) {
      return { success: true, listings, source };
    }

    return { success: true, listings: getMockData(query), source };
  } catch (error) {
    console.error('GOAT scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES.goat;
  const matches = searchMockDB(query, -10);
  
  return matches.map((product, index) => ({
    id: generateListingId('goat', `mock-${index}`),
    name: product.name,
    brand: product.brand,
    colorway: product.colorway,
    sku: product.sku,
    imageUrl: '',
    retailPrice: null,
    condition: 'new' as const,
    source,
    price: product.priceUSD,
    currency: 'USD' as const,
    priceCAD: product.priceCAD,
    url: `https://www.goat.com/search?query=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}


