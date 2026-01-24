import axios from 'axios';
import * as cheerio from 'cheerio';
import { SOURCES } from '../../types.js';
import { generateListingId, searchMockDB } from '../types.js';
const HAVEN_SEARCH_URL = 'https://havenshop.com/search';
export async function searchHaven(query) {
    const source = SOURCES.haven;
    try {
        const response = await axios.get(HAVEN_SEARCH_URL, {
            params: { q: query, type: 'product' },
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept-Language': 'en-CA,en;q=0.9',
            },
            timeout: 15000,
        });
        const $ = cheerio.load(response.data);
        const listings = [];
        $('.product-item, .grid__item').each((_, element) => {
            try {
                const $item = $(element);
                const name = $item.find('.product-item__title, .product__title').text().trim();
                if (!name)
                    return;
                const isFootwear = ['shoe', 'sneaker', 'runner', 'boot', 'slide', 'sandal']
                    .some(term => name.toLowerCase().includes(term)) ||
                    ['nike', 'jordan', 'adidas', 'new balance', 'yeezy', 'puma']
                        .some(brand => name.toLowerCase().includes(brand));
                if (!isFootwear)
                    return;
                const priceText = $item.find('.product-item__price, .product__price').text().trim();
                const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
                if (!priceMatch)
                    return;
                const price = parseFloat(priceMatch[1].replace(',', ''));
                if (price < 50 || price > 2000)
                    return;
                const imageUrl = $item.find('img').attr('src') || $item.find('img').attr('data-src') || '';
                const urlPath = $item.find('a').attr('href') || '';
                const url = urlPath.startsWith('http') ? urlPath : `https://havenshop.com${urlPath}`;
                const brandPatterns = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Reebok', 'Converse', 'Vans', 'ASICS', 'Salomon'];
                const brand = brandPatterns.find(b => name.toLowerCase().includes(b.toLowerCase())) || 'Unknown';
                listings.push({
                    id: generateListingId('haven', url.split('/').pop() || `${Date.now()}`),
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
            }
            catch (e) {
                // Skip item on error
            }
        });
        if (listings.length > 0) {
            return { success: true, listings: listings.slice(0, 15), source };
        }
        return { success: true, listings: getMockData(query), source };
    }
    catch (error) {
        console.error('Haven scraper error:', error);
        return { success: true, listings: getMockData(query), source };
    }
}
function getMockData(query) {
    const source = SOURCES.haven;
    const matches = searchMockDB(query, 10);
    return matches.map((product, index) => ({
        id: generateListingId('haven', `mock-${index}`),
        name: product.name,
        brand: product.brand,
        colorway: product.colorway,
        sku: product.sku,
        imageUrl: '',
        retailPrice: null,
        condition: 'new',
        source,
        price: product.priceCAD,
        currency: 'CAD',
        priceCAD: product.priceCAD,
        url: `https://havenshop.com/search?q=${encodeURIComponent(product.name)}`,
        lastUpdated: new Date(),
    }));
}
//# sourceMappingURL=haven.js.map