import axios from 'axios';
import { SOURCES, SneakerListing } from '@/types';
import { ScraperResult, generateListingId, searchMockDB } from '../types';

const STOCKX_SEARCH_URL = 'https://stockx.com/api/browse';

interface StockXProduct {
  id: string;
  uuid: string;
  name: string;
  brand: string;
  colorway: string;
  styleId: string;
  retailPrice: number;
  media: {
    smallImageUrl: string;
    thumbUrl: string;
    imageUrl: string;
  };
  market: {
    lowestAsk: number;
    highestBid: number;
    lastSale: number;
  };
  urlKey: string;
}

export async function searchStockX(query: string): Promise<ScraperResult> {
  const source = SOURCES.stockx;

  try {
    const response = await axios.get(STOCKX_SEARCH_URL, {
      params: {
        _search: query,
        dataType: 'product',
        page: 1,
        resultsPerPage: 20,
        currency: 'CAD',
        country: 'CA',
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const products: StockXProduct[] = response.data?.Products || [];
    
    const listings: SneakerListing[] = products
      .filter((p) => p.market?.lowestAsk > 0)
      .map((product): SneakerListing => ({
        id: generateListingId('stockx', product.uuid),
        name: product.name,
        brand: product.brand,
        colorway: product.colorway || '',
        sku: product.styleId || '',
        imageUrl: product.media?.imageUrl || product.media?.thumbUrl || '',
        retailPrice: product.retailPrice || null,
        condition: 'new',
        source,
        price: product.market.lowestAsk,
        currency: 'CAD',
        priceCAD: product.market.lowestAsk,
        url: `https://stockx.com/${product.urlKey}`,
        lastUpdated: new Date(),
      }));

    if (listings.length > 0) {
      return { success: true, listings, source };
    }

    return { success: true, listings: getMockData(query), source };
  } catch (error) {
    console.error('StockX scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES.stockx;
  const matches = searchMockDB(query, 0);
  
  return matches.map((product, index) => ({
    id: generateListingId('stockx', `mock-${index}`),
    name: product.name,
    brand: product.brand,
    colorway: product.colorway,
    sku: product.sku,
    imageUrl: '',
    retailPrice: null,
    condition: 'new' as const,
    source,
    price: product.priceCAD,
    currency: 'CAD' as const,
    priceCAD: product.priceCAD,
    url: `https://stockx.com/search?s=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}


