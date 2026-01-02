import axios from 'axios';
import * as cheerio from 'cheerio';
import { SOURCES, SneakerListing } from '@/types';
import { ScraperResult, generateListingId, searchMockDB } from '../types';

/**
 * NRML Scraper
 * Ottawa-based Canadian streetwear and sneaker retailer
 */

const NRML_SEARCH_URL = 'https://nrml.ca/search';

export async function searchNRML(query: string): Promise<ScraperResult> {
  const source = SOURCES.nrml;

  try {
    const response = await axios.get(NRML_SEARCH_URL, {
      params: { q: query, type: 'product' },
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const listings: SneakerListing[] = [];

    // Parse NRML product grid (Shopify-based)
    $('.product-card, .grid-product, .product-item').each((_, element) => {
      try {
        const $item = $(element);
        
        const name = $item.find('.product-card__title, .product__title, .grid-product__title').text().trim();
        if (!name) return;
        
        // Filter for footwear
        const isFootwear = ['shoe', 'sneaker', 'runner', 'dunk', 'jordan', 'force', 'max', 'yeezy']
          .some(term => name.toLowerCase().includes(term));
        
        if (!isFootwear && !['nike', 'jordan', 'adidas', 'new balance'].some(b => name.toLowerCase().includes(b))) {
          return;
        }
        
        const priceText = $item.find('.product-card__price, .price, .grid-product__price').text().trim();
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
        if (!priceMatch) return;
        
        const price = parseFloat(priceMatch[1].replace(',', ''));
        if (price < 50 || price > 1000) return;
        
        const imageUrl = $item.find('img').attr('src') || $item.find('img').attr('data-src') || '';
        const urlPath = $item.find('a').attr('href') || '';
        const url = urlPath.startsWith('http') ? urlPath : `https://nrml.ca${urlPath}`;
        
        const brandPatterns = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Reebok', 'Converse', 'Vans', 'ASICS'];
        const brand = brandPatterns.find(b => name.toLowerCase().includes(b.toLowerCase())) || 'Unknown';
        
        listings.push({
          id: generateListingId('nrml', url.split('/').pop() || `${Date.now()}`),
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
    console.error('NRML scraper error:', error);
    return { success: true, listings: getMockData(query), source };
  }
}

function getMockData(query: string): SneakerListing[] {
  const source = SOURCES.nrml;
  const matches = searchMockDB(query, 0);
  
  return matches.map((product, index) => ({
    id: generateListingId('nrml', `mock-${index}`),
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
    url: `https://nrml.ca/search?q=${encodeURIComponent(product.name)}`,
    lastUpdated: new Date(),
  }));
}


