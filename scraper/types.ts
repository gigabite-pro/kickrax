/**
 * KickRax Backend Types
 */

export interface SneakerListing {
  id: string;
  name: string;
  brand: string;
  colorway: string;
  sku: string;
  imageUrl: string;
  retailPrice: number | null;
  size?: string;
  condition: 'new' | 'used' | 'unknown';
  source: SneakerSource;
  price: number;
  currency: 'CAD' | 'USD';
  priceCAD: number;
  url: string;
  lastUpdated: Date;
}

export interface SneakerSource {
  name: string;
  slug: SourceSlug;
  logo: string;
  baseUrl: string;
  shipsToCanada: boolean;
  trustLevel: 'verified' | 'authenticated' | 'marketplace';
}

export type SourceSlug = 
  | 'stockx' 
  | 'goat' 
  | 'flight-club' 
  | 'stadium-goods'
  | 'kickscrew';

export interface AggregatedSneaker {
  id: string;
  name: string;
  brand: string;
  colorway: string;
  sku: string;
  imageUrl: string;
  retailPrice: number | null;
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  priceRange: string;
  listings: SneakerListing[];
  bestDeal: SneakerListing;
}

// Primary product from StockX catalog
export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  colorway: string;
  sku: string;           // Style ID - the key for cross-referencing
  imageUrl: string;
  retailPrice: number | null;
  stockxUrl: string;
  stockxLowestAsk: number;
}

// Size-level pricing from a source
export interface SizePrice {
  size: string;
  price: number;
  priceCAD: number;
  currency: 'USD' | 'CAD';
  url: string;
  available: boolean;
}

// Product with all sizes from a source
export interface SourcePricing {
  source: SneakerSource;
  sizes: SizePrice[];
  lowestPrice: number;
  available: boolean;
}

// Complete product with all sources and sizes
export interface ProductWithPrices {
  product: CatalogProduct;
  sources: SourcePricing[];
  lowestOverallPrice: number;
  bestDeal: {
    source: SneakerSource;
    size: string;
    price: number;
    url: string;
  } | null;
}

// Search response
export interface SearchResponse {
  query: string;
  products: ProductWithPrices[];
  meta: {
    totalProducts: number;
    sourcesSearched: string[];
    duration: number;
    timestamp: string;
    cached: boolean;
  };
}

export const SOURCES: Record<string, SneakerSource> = {
  stockx: {
    name: 'StockX',
    slug: 'stockx',
    logo: '/sources/stockx.svg',
    baseUrl: 'https://stockx.com',
    shipsToCanada: true,
    trustLevel: 'authenticated',
  },
  goat: {
    name: 'GOAT',
    slug: 'goat',
    logo: '/sources/goat.svg',
    baseUrl: 'https://www.goat.com',
    shipsToCanada: true,
    trustLevel: 'authenticated',
  },
  'flight-club': {
    name: 'Flight Club',
    slug: 'flight-club',
    logo: '/sources/flight-club.svg',
    baseUrl: 'https://www.flightclub.com',
    shipsToCanada: true,
    trustLevel: 'authenticated',
  },
  'stadium-goods': {
    name: 'Stadium Goods',
    slug: 'stadium-goods',
    logo: '/sources/stadium-goods.svg',
    baseUrl: 'https://www.stadiumgoods.com',
    shipsToCanada: true,
    trustLevel: 'authenticated',
  },
  kickscrew: {
    name: 'KicksCrew',
    slug: 'kickscrew',
    logo: '/sources/kickscrew.svg',
    baseUrl: 'https://www.kickscrew.com',
    shipsToCanada: true,
    trustLevel: 'authenticated',
  },
};
