# DripStock 🔥👟

> Canada's Sneaker Price Comparison Platform - Verified Resellers Only

DripStock helps you find the best sneaker prices across verified Canadian resellers. Think of it as Skyscanner for sneakers - without the scammers.

## Features

- **10+ Verified Resellers**: StockX, GOAT, Flight Club, Stadium Goods, Grailed + Canadian stores
- **Canada Focused**: All prices in CAD
- **No Scammers**: Only authenticated/verified platforms (no eBay/Kijiji)
- **Simple Caching**: Results cached for 1 minute to speed up repeat searches
- **Refresh Button**: Force fresh prices anytime

## Data Sources

### Authenticated Platforms
- StockX, GOAT, Flight Club, Stadium Goods, Grailed

### Canadian Retailers
- Livestock (Toronto), Haven (Vancouver), Capsule Toronto, Exclucity, NRML (Ottawa)

## Getting Started

### Quick Start (No Database)
```bash
npm install
npm run dev
```
Works immediately - just does live scraping on each search.

### With Caching (Optional MongoDB)
```bash
# Set environment variable
export MONGODB_URI=mongodb://localhost:27017

npm run dev
```
Caches search results for 1 minute so repeat searches are instant.

## How It Works

1. User searches for "Jordan 1"
2. Check MongoDB cache (if configured)
3. If cached result < 1 minute old → return instantly
4. Otherwise → scrape all 10 sources in parallel
5. Save to cache for next person
6. Return results

## Tech Stack

- **Next.js 14** (App Router)
- **MongoDB** (optional, for caching)
- **Tailwind CSS** + Framer Motion
- **Axios + Cheerio** for scraping

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── search/route.ts    # Main search endpoint
│   │   └── refresh/route.ts   # Force refresh endpoint
│   └── page.tsx               # Home page
├── components/                 # UI components
├── lib/
│   ├── db/mongodb.ts          # Simple cache layer
│   └── scrapers/
│       ├── registry.ts        # Source configuration
│       └── sources/           # 10 scraper files
└── types/index.ts
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | No | MongoDB connection string |
| `MONGODB_DB` | No | Database name (default: dripstock) |

## Why No eBay/Kijiji?

- Too many scammers selling fakes
- No authentication guarantee
- We only include platforms that verify authenticity

---

Built with 🔥 for the Canadian sneaker community.
