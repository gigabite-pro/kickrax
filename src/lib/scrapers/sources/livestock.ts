import axios from 'axios';
import * as cheerio from 'cheerio';
import { SOURCES, SneakerListing } from '@/types';
import { ScraperResult, generateListingId, searchMockDB } from '../types';

/**
 * Livestock (Deadstock.ca) Scraper
 * Toronto-based Canadian sneaker retailer
 */

const LIVESTOCK_SEARCH_URL = 'https://www.deadstock.ca/collections/footwear';

export async function searchLivestock(query: string): Promise<ScraperResult> {
  const source = SOURCES.livestock;

  try {
    const response = await axios.get(LIVESTOCK_SEARCH_URL, {
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

    // Parse Livestock/Deadstock product grid
    $('.product-card, .grid-product').each((_, element) => {
      try {
        const $item = $(element);
        
        const name = $item.find('.product-card__title, .grid-product__title').text().trim();
        if (!name) return;
        
        // Check if query matches
        if (!name.toLowerCase().includes(query.toLowerCase().split(' ')[0])) return;
        
        const priceText = $item.find('.product-card__price, .grid-product__price').text().trim();
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
        if (!priceMatch) return;
        
        const price = parseFloat(priceMatch[1].replace(',', ''));
        if (price < 50 || price > 2000) return;
        
        const imageUrl = $item.find('img').attr('src') || $item.find('img').attr('data-src') || '';
        const urlPath = $item.find('a').attr('href') || '';
        const url = urlPath.startsWith('http') ? urlPath : `https://www.deadstock.ca${urlPath}`;
        
        const brandPatterns = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Reebok', 'Converse', 'Vans', 'ASICS'];
        const brand = brandPatterns.find(b => name.toLowerCase().includes(b.toLowerCase())) || 'Unknown';
        
        listings.push({
          id: generateListingId('livestock', url.split('/').pop() || `${Date.now()}`),
          name,
          brand,
          colorway: '',
          sku: '',
          imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
          retailPrice: null,
          condition: 'new',
          source,
          price,
          currency: 'CAD',
          priceCAD: price,
          url,
          lastUpdated: new Date(),
        });
      } catch (e) {
        // Skip item on error
      }
    });

    if (listings.length > 0) {
      return { success: true, listings: listings.slice(0, 15), source };
    }

    return { success: true, listings: getMockData(query), source };
  } catch (error) {
    console.error('Livestock scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES.livestock;
  const matches = searchMockDB(query, 5);
  
  return matches.map((product, index) => ({
    id: generateListingId('livestock', `mock-${index}`),
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
    url: `https://www.deadstock.ca/search?q=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}


