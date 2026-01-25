import { searchStockX } from "./sources/stockx.js";
import { searchGOAT } from "./sources/goat.js";
import { searchFlightClub } from "./sources/flight-club.js";
import { searchKicksCrew } from "./sources/kickscrew.js";
import { searchStadiumGoods } from "./sources/stadiumgoods.js";
import { SCRAPER_REGISTRY } from "./registry.js";
export async function searchAllSources(query) {
    const errors = [];
    const enabledScrapers = SCRAPER_REGISTRY.filter((s) => s.enabled);
    const scraperFunctions = {
        stockx: searchStockX,
        goat: searchGOAT,
        "flight-club": searchFlightClub,
        kickscrew: searchKicksCrew,
        "stadium-goods": searchStadiumGoods,
    };
    const scraperPromises = enabledScrapers.map(async (scraper) => {
        const fn = scraperFunctions[scraper.id];
        if (!fn)
            return null;
        try {
            return await fn(query);
        }
        catch (error) {
            console.error(`${scraper.name} scraper error:`, error);
            return { success: false, listings: [], source: scraper, error: "Failed to fetch" };
        }
    });
    const results = await Promise.allSettled(scraperPromises);
    const allListings = [];
    results.forEach((result, index) => {
        const scraper = enabledScrapers[index];
        if (result.status === "fulfilled" && result.value) {
            const scraperResult = result.value;
            if (scraperResult.success) {
                allListings.push(...scraperResult.listings);
            }
            else if (scraperResult.error) {
                errors.push(`${scraper.name}: ${scraperResult.error}`);
            }
        }
        else {
            errors.push(`${scraper.name}: Failed to fetch data`);
        }
    });
    const aggregated = aggregateListings(allListings);
    return { listings: allListings, aggregated, errors };
}
function aggregateListings(listings) {
    const groups = new Map();
    listings.forEach((listing) => {
        const key = normalizeForGrouping(listing.name, listing.sku, listing.brand);
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(listing);
    });
    const aggregated = [];
    groups.forEach((groupListings, key) => {
        if (groupListings.length === 0)
            return;
        const base = groupListings[0];
        const imageSource = groupListings.find((l) => l.imageUrl && l.imageUrl.length > 0) || base;
        const prices = groupListings.map((l) => l.priceCAD);
        const lowestPrice = Math.min(...prices);
        const highestPrice = Math.max(...prices);
        const averagePrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const bestDeal = groupListings.reduce((best, current) => (current.priceCAD < best.priceCAD ? current : best));
        const sortedListings = [...groupListings].sort((a, b) => a.priceCAD - b.priceCAD);
        aggregated.push({
            id: `agg-${key}`,
            name: base.name,
            brand: base.brand,
            colorway: base.colorway,
            sku: base.sku,
            imageUrl: imageSource.imageUrl,
            retailPrice: base.retailPrice,
            lowestPrice,
            highestPrice,
            averagePrice,
            priceRange: `$${lowestPrice} - $${highestPrice}`,
            listings: sortedListings,
            bestDeal,
        });
    });
    return aggregated.sort((a, b) => {
        const listingDiff = b.listings.length - a.listings.length;
        if (listingDiff !== 0)
            return listingDiff;
        return a.lowestPrice - b.lowestPrice;
    });
}
function normalizeForGrouping(name, sku, brand) {
    if (sku && sku.length > 3) {
        return sku.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    const normalized = name
        .toLowerCase()
        .replace(/size\s*:?\s*\d+\.?\d*/gi, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/ds|deadstock|brand new|bnib|vnds|pads/gi, "")
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .slice(0, 5)
        .join("");
    return `${brand.toLowerCase().replace(/[^a-z]/g, "")}-${normalized}`;
}
//# sourceMappingURL=index.js.map