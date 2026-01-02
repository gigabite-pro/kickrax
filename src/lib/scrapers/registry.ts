import { SourceSlug } from '@/types';

export interface ScraperConfig {
  id: SourceSlug;
  name: string;
  type: 'api' | 'html';
  baseUrl: string;
  trustLevel: 'verified' | 'authenticated' | 'marketplace';
  rateLimit: {
    requests: number;
    windowMs: number;
  };
  enabled: boolean;
  country: 'US' | 'CA' | 'GLOBAL';
}

export const SCRAPER_REGISTRY: ScraperConfig[] = [
  // Major Authenticated Platforms (US-based, ship to Canada)
  {
    id: 'stockx',
    name: 'StockX',
    type: 'api',
    baseUrl: 'https://stockx.com',
    trustLevel: 'authenticated',
    rateLimit: { requests: 10, windowMs: 60000 },
    enabled: true,
    country: 'GLOBAL',
  },
  {
    id: 'goat',
    name: 'GOAT',
    type: 'api',
    baseUrl: 'https://www.goat.com',
    trustLevel: 'authenticated',
    rateLimit: { requests: 10, windowMs: 60000 },
    enabled: true,
    country: 'GLOBAL',
  },
  {
    id: 'flight-club',
    name: 'Flight Club',
    type: 'api',
    baseUrl: 'https://www.flightclub.com',
    trustLevel: 'authenticated',
    rateLimit: { requests: 10, windowMs: 60000 },
    enabled: true,
    country: 'US',
  },
  {
    id: 'stadium-goods',
    name: 'Stadium Goods',
    type: 'html',
    baseUrl: 'https://www.stadiumgoods.com',
    trustLevel: 'authenticated',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'US',
  },
  {
    id: 'grailed',
    name: 'Grailed',
    type: 'api',
    baseUrl: 'https://www.grailed.com',
    trustLevel: 'verified',
    rateLimit: { requests: 10, windowMs: 60000 },
    enabled: true,
    country: 'GLOBAL',
  },
  
  // Canadian Retailers
  {
    id: 'livestock',
    name: 'Livestock',
    type: 'html',
    baseUrl: 'https://www.deadstock.ca',
    trustLevel: 'verified',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'CA',
  },
  {
    id: 'haven',
    name: 'Haven',
    type: 'html',
    baseUrl: 'https://havenshop.com',
    trustLevel: 'verified',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'CA',
  },
  {
    id: 'capsule',
    name: 'Capsule Toronto',
    type: 'html',
    baseUrl: 'https://www.capsuletoronto.com',
    trustLevel: 'verified',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'CA',
  },
  {
    id: 'exclucity',
    name: 'Exclucity',
    type: 'html',
    baseUrl: 'https://www.exclucity.com',
    trustLevel: 'verified',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'CA',
  },
  {
    id: 'nrml',
    name: 'NRML',
    type: 'html',
    baseUrl: 'https://nrml.ca',
    trustLevel: 'verified',
    rateLimit: { requests: 5, windowMs: 60000 },
    enabled: true,
    country: 'CA',
  },
];

export function getEnabledScrapers(): ScraperConfig[] {
  return SCRAPER_REGISTRY.filter(s => s.enabled);
}

export function getScraperById(id: SourceSlug): ScraperConfig | undefined {
  return SCRAPER_REGISTRY.find(s => s.id === id);
}


