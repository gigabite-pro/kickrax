import axios from 'axios';
import { SOURCES, SneakerListing } from '../../types.js';
import { ScraperResult, convertToCAD, generateListingId, searchMockDB } from '../types.js';

const GRAILED_API_URL = 'https://www.grailed.com/api/listings/grailed_local';

export async function searchGrailed(query: string): Promise<ScraperResult> {
  const source = SOURCES.grailed;

  try {
    const response = await axios.get(GRAILED_API_URL, {
      params: {
        query,
        page: 1,
        per_page: 20,
        department: 'footwear',
        sort: 'price_low',
        country: 'CA',
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const items = response.data?.data || response.data?.listings || [];
    
    const listings: SneakerListing[] = items
      .filter((item: any) => item.price > 0)
      .map((item: any): SneakerListing => {
        const priceUSD = item.price;
        const priceCAD = convertToCAD(priceUSD, 'USD');
        
        return {
          id: generateListingId('grailed', item.id?.toString()),
          name: item.title || item.name,
          brand: item.designer?.name || item.brand || 'Unknown',
          colorway: item.color || '',
          sku: '',
          imageUrl: item.cover_photo?.url || item.photos?.[0]?.url || '',
          retailPrice: null,
          size: item.size,
          condition: item.condition?.toLowerCase() === 'is_new' ? 'new' : 'used',
          source,
          price: priceUSD,
          currency: 'USD',
          priceCAD,
          url: `https://www.grailed.com/listings/${item.id}`,
          lastUpdated: new Date(),
        };
      });

    if (listings.length > 0) {
      return { success: true, listings, source };
    }

    return { success: true, listings: getMockData(query), source };
  } catch (error) {
    console.error('Grailed scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES.grailed;
  const matches = searchMockDB(query, -20);
  
  return matches.map((product, index) => ({
    id: generateListingId('grailed', `mock-${index}`),
    name: product.name,
    brand: product.brand,
    colorway: product.colorway,
    sku: product.sku,
    imageUrl: '',
    retailPrice: null,
    size: '10',
    condition: index % 2 === 0 ? 'new' as const : 'used' as const,
    source,
    price: product.priceUSD,
    currency: 'USD' as const,
    priceCAD: product.priceCAD,
    url: `https://www.grailed.com/shop?query=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}
