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
  | 'grailed' 
  | 'flight-club' 
  | 'stadium-goods'
  | 'livestock'
  | 'haven'
  | 'capsule'
  | 'exclucity'
  | 'nrml';

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

// NEW: Primary product from StockX catalog
export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  colorway: string;
  sku: string;
  imageUrl: string;
  retailPrice: number | null;
  stockxUrl: string;
  stockxLowestAsk: number;
}

// NEW: Size-level pricing from a source
export interface SizePrice {
  size: string;
  price: number;
  priceCAD: number;
  currency: 'USD' | 'CAD';
  url: string;
  available: boolean;
}

// NEW: Product with all sizes from a source
export interface SourcePricing {
  source: SneakerSource;
  sizes: SizePrice[];
  lowestPrice: number;
  available: boolean;
}

// NEW: Complete product with all sources and sizes
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

// NEW: Search response
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
  grailed: {
    name: 'Grailed',
    slug: 'grailed',
    logo: '/sources/grailed.svg',
    baseUrl: 'https://www.grailed.com',
    shipsToCanada: true,
    trustLevel: 'verified',
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
  livestock: {
    name: 'Livestock',
    slug: 'livestock',
    logo: '/sources/livestock.svg',
    baseUrl: 'https://www.deadstock.ca',
    shipsToCanada: true,
    trustLevel: 'verified',
  },
  haven: {
    name: 'Haven',
    slug: 'haven',
    logo: '/sources/haven.svg',
    baseUrl: 'https://havenshop.com',
    shipsToCanada: true,
    trustLevel: 'verified',
  },
  capsule: {
    name: 'Capsule Toronto',
    slug: 'capsule',
    logo: '/sources/capsule.svg',
    baseUrl: 'https://www.capsuletoronto.com',
    shipsToCanada: true,
    trustLevel: 'verified',
  },
  exclucity: {
    name: 'Exclucity',
    slug: 'exclucity',
    logo: '/sources/exclucity.svg',
    baseUrl: 'https://www.exclucity.com',
    shipsToCanada: true,
    trustLevel: 'verified',
  },
  nrml: {
    name: 'NRML',
    slug: 'nrml',
    logo: '/sources/nrml.svg',
    baseUrl: 'https://nrml.ca',
    shipsToCanada: true,
    trustLevel: 'verified',
  },
};
