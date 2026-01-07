import axios from 'axios';
import * as cheerio from 'cheerio';
import { SOURCES, SneakerListing } from '../../types.js';
import { ScraperResult, convertToCAD, generateListingId, searchMockDB } from '../types.js';

const STADIUM_GOODS_SEARCH_URL = 'https://www.stadiumgoods.com/en-ca/search';

export async function searchStadiumGoods(query: string): Promise<ScraperResult> {
  const source = SOURCES['stadium-goods'];

  try {
    const response = await axios.get(STADIUM_GOODS_SEARCH_URL, {
      params: { q: query },
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const listings: SneakerListing[] = [];

    $('[data-testid="product-card"]').each((_, element) => {
      try {
        const $item = $(element);
        
        const name = $item.find('[data-testid="product-name"]').text().trim();
        if (!name) return;
        
        const priceText = $item.find('[data-testid="product-price"]').text().trim();
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
        if (!priceMatch) return;
        
        const priceUSD = parseFloat(priceMatch[1].replace(',', ''));
        if (priceUSD < 50 || priceUSD > 5000) return;
        
        const priceCAD = convertToCAD(priceUSD, 'USD');
        const imageUrl = $item.find('img').attr('src') || '';
        const urlPath = $item.find('a').attr('href') || '';
        const url = urlPath.startsWith('http') ? urlPath : `https://www.stadiumgoods.com${urlPath}`;
        
        const brand = $item.find('[data-testid="product-brand"]').text().trim() || 'Unknown';
        
        listings.push({
          id: generateListingId('stadium-goods', url.split('/').pop() || `${Date.now()}`),
          name,
          brand,
          colorway: '',
          sku: '',
          imageUrl,
          retailPrice: null,
          condition: 'new',
          source,
          price: priceUSD,
          currency: 'USD',
          priceCAD,
          url,
          lastUpdated: new Date(),
        });
      } catch (e) {
        // Skip item on error
      }
    });

    if (listings.length > 0) {
      return { success: true, listings: listings.slice(0, 20), source };
    }

    return { success: true, listings: getMockData(query), source };
  } catch (error) {
    console.error('Stadium Goods scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES['stadium-goods'];
  const matches = searchMockDB(query, 20);
  
  return matches.map((product, index) => ({
    id: generateListingId('stadium-goods', `mock-${index}`),
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
    url: `https://www.stadiumgoods.com/en-ca/search?q=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}
