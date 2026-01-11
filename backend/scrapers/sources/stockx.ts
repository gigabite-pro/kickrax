import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { SOURCES, SneakerListing, CatalogProduct } from "../../types.js";
import { ScraperResult, generateListingId } from "../types.js";
import { launchBrowser, createPage, getPuppeteerOptions, AbortSignal, checkAbort, sleepWithAbort } from "../browser.js";

// Keep browser instance alive for performance
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log("[StockX] Launching browser...");
    browser = await puppeteer.launch(getPuppeteerOptions());

    return browser;
}

/**
 * Generate StockX image URL from product slug
 * Pattern: https://images.stockx.com/360/{Product-Name}/Images/{Product-Name}/Lv2/img01.jpg?w=576&q=60&dpr=1&updated_at=1714998206&h=384
 */
function generateStockXImageUrl(slug: string): string {
    // Convert slug to proper format - capitalize first letter of each word
    const productName = slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("-");

    // Use the 360 view pattern with img01.jpg
    return `https://images.stockx.com/360/${productName}/Images/${productName}/Lv2/img01.jpg?w=576&q=41&dpr=3&h=384`;
}

/**
 * Extract image URL from DOM, or generate it
 * Prioritizes highest quality images (3x from srcset)
 */
function getImageUrl($tile: cheerio.Cheerio<cheerio.AnyNode>, slug: string): string {
    const $img = $tile.find("img").first();

    // Priority 1: Try srcset - extract 3x version (highest quality)
    const srcset = $img.attr("srcset") || "";
    if (srcset) {
        const srcsetLines = srcset.split(",");
        // Try 3x first (best quality)
        for (const line of srcsetLines) {
            if (line.includes("3x")) {
                const urlMatch = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                if (urlMatch) {
                    return urlMatch[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
                }
            }
        }
        // Try 2x
        for (const line of srcsetLines) {
            if (line.includes("2x")) {
                const urlMatch = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                if (urlMatch) {
                    return urlMatch[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
                }
            }
        }
    }

    // Priority 2: Try src attribute and upgrade quality params
    const src = $img.attr("src") || "";
    if (src && src.includes("images.stockx.com")) {
        // Upgrade quality: increase dpr to 3 and quality to 80
        let upgradedUrl = src.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
        upgradedUrl = upgradedUrl.replace(/dpr=\d/, "dpr=3").replace(/q=\d+/, "q=80");
        return upgradedUrl;
    }

    // Priority 3: Try data-src (lazy loading)
    const dataSrc = $img.attr("data-src") || $img.attr("data-lazy-src") || "";
    if (dataSrc && dataSrc.includes("images.stockx.com")) {
        let upgradedUrl = dataSrc.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
        upgradedUrl = upgradedUrl.replace(/dpr=\d/, "dpr=3").replace(/q=\d+/, "q=80");
        return upgradedUrl;
    }

    // Fallback: Generate URL from slug using the 360 view pattern (already high quality)
    return generateStockXImageUrl(slug);
}

/**
 * Search StockX by scraping the HTML search results page using Puppeteer
 * URL: https://stockx.com/search?s=jordan+1
 * @param query - Search query (optional for trending)
 * @param sort - Sort option (e.g., 'most-active' for trending)
 */
export async function searchStockXCatalog(query?: string, sort?: string): Promise<CatalogProduct[]> {
    let page: Page | null = null;
    const targetCount = 50; // Fixed limit of 50 products

    try {
        // Build URL with optional query and sort
        let searchUrl = 'https://stockx.com/search?category=sneakers';
        if (query) searchUrl += `&s=${encodeURIComponent(query)}`;
        if (sort) searchUrl += `&sort=${encodeURIComponent(sort)}`;
        
        console.log(`[StockX] Scraping with Puppeteer: ${searchUrl} (target: ${targetCount} products)`);

        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // Set realistic viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

        // Navigate to search page
        await page.goto(searchUrl, {
            waitUntil: "networkidle2", // Wait for network to be idle
            timeout: 30000,
        });

        // Wait for product tiles to load
        try {
            await page.waitForSelector('[data-testid="ProductTile"]', { timeout: 10000 });
            console.log("[StockX] Product tiles loaded");
        } catch (e) {
            console.log("[StockX] ProductTile selector not found, trying alternative...");
            // Wait a bit more for content to render
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Scroll multiple times to trigger lazy loading of more products
        const scrollIterations = 5;
        console.log(`[StockX] Scrolling ${scrollIterations} times to load products...`);
        
        for (let i = 0; i < scrollIterations; i++) {
            await page.evaluate((scrollIndex) => {
                window.scrollTo(0, (scrollIndex + 1) * window.innerHeight);
            }, i);
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
        
        // Final scroll to bottom
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Scroll back up to ensure all images are loaded
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Get the rendered HTML
        const html = await page.content();
        const $ = cheerio.load(html);
        const products: CatalogProduct[] = [];

        console.log(`[StockX] HTML loaded (${html.length} bytes), parsing products...`);

        // Extract products using exact selectors from DOM
        $('[data-testid="ProductTile"]').each((index, element) => {
            if (products.length >= targetCount) return false; // Stop at target

            try {
                const $tile = $(element);

                // Get product link
                const $link = $tile.find('[data-testid="productTile-ProductSwitcherLink"]');
                const href = $link.attr("href") || "";

                if (!href) return;

                const url = `https://stockx.com${href}`;
                const slug = href.replace("/", "").split("?")[0];

                // Get product name - exact selector from DOM
                const name = $tile.find('[data-testid="product-tile-title"]').text().trim() || $tile.find("p").first().text().trim() || formatSlugToName(slug);

                if (!name || name.length < 3) return;

                // Get image URL - try DOM first, then generate
                const imageUrl = getImageUrl($tile, slug);

                // Get price - exact selector from DOM
                const priceText =
                    $tile.find('[data-testid="product-tile-lowest-ask-amount"]').text().trim() ||
                    $tile.find('[data-testid="product-tile-lowest-ask-amount"]').attr("aria-label")?.replace("Lowest Ask ", "").trim() ||
                    "";

                // Parse price - handles "CA$163" or "$163" format
                let price = 0;
                if (priceText) {
                    // Remove currency symbols and parse
                    const priceMatch = priceText.match(/[\d,]+/);
                    if (priceMatch) {
                        price = parseInt(priceMatch[0].replace(/,/g, ""));
                    }
                }

                // Extract brand from name
                const brand = extractBrand(name);

                // Use slug as SKU identifier
                const sku = slug.toUpperCase().replace(/-/g, " ").substring(0, 30);

                products.push({
                    id: `stockx-${index}-${Date.now()}`,
                    name: name.substring(0, 150), // Limit length
                    brand,
                    colorway: "",
                    sku,
                    imageUrl,
                    retailPrice: null,
                    stockxUrl: url,
                    stockxLowestAsk: price,
                });

                console.log(`[StockX] Found: ${name} - CA$${price || "N/A"} - Image: ${imageUrl.substring(0, 80)}...`);
            } catch (e) {
                console.error(`[StockX] Error parsing tile ${index}:`, e);
            }
        });

        // Method 2: If no products found, try alternative selectors
        if (products.length === 0) {
            console.log("[StockX] Trying alternative selectors...");

            // Look for any product links in the results container
            $('#product-results a[href^="/"], [data-component="brand-tile"] a[href^="/"]').each((index, element) => {
                if (products.length >= targetCount) return false;

                try {
                    const $link = $(element);
                    const href = $link.attr("href") || "";

                    if (!href || href === "/" || href.includes("#")) return;

                    const url = `https://stockx.com${href}`;
                    const slug = href.replace("/", "").split("?")[0];

                    // Get name from link text or nearby elements
                    const $parent = $link.closest('[data-testid="ProductTile"], [data-component="brand-tile"], .product-tile');
                    const name =
                        $parent.find('[data-testid="product-tile-title"]').text().trim() ||
                        $link.text().trim() ||
                        $parent.find('p, h3, [class*="name"]').first().text().trim() ||
                        formatSlugToName(slug);

                    if (!name || name.length < 3) return;

                    // Get image URL
                    const imageUrl = getImageUrl($parent.length ? $parent : $link, slug);

                    // Get price
                    const priceText =
                        $parent.find('[data-testid="product-tile-lowest-ask-amount"]').text().trim() ||
                        $parent.find('[data-testid="product-tile-lowest-ask-amount"]').attr("aria-label")?.replace("Lowest Ask ", "").trim() ||
                        "";

                    let price = 0;
                    if (priceText) {
                        const priceMatch = priceText.match(/[\d,]+/);
                        if (priceMatch) {
                            price = parseInt(priceMatch[0].replace(/,/g, ""));
                        }
                    }

                    const brand = extractBrand(name);
                    const sku = slug.toUpperCase().replace(/-/g, " ").substring(0, 30);

                    products.push({
                        id: `stockx-alt-${index}-${Date.now()}`,
                        name: name.substring(0, 150),
                        brand,
                        colorway: "",
                        sku,
                        imageUrl,
                        retailPrice: null,
                        stockxUrl: url,
                        stockxLowestAsk: price,
                    });
                } catch (e) {
                    // Skip
                }
            });
        }

        console.log(`[StockX] Extracted ${products.length} products from HTML`);

        return products;
    } catch (error: any) {
        console.error("[StockX] Puppeteer scraping error:", error.message);
        return [];
    } finally {
        // Close page but keep browser alive
        if (page) {
            await page.close().catch(() => {});
        }
    }
}

// Cleanup browser on process exit
process.on("SIGINT", async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

process.on("SIGTERM", async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

function formatSlugToName(slug: string): string {
    return slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function extractBrand(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("jordan") || n.includes("air jordan")) return "Jordan";
    if (n.includes("nike") || n.includes("dunk") || n.includes("air force") || n.includes("air max")) return "Nike";
    if (n.includes("adidas") || n.includes("yeezy") || n.includes("samba") || n.includes("campus")) return "Adidas";
    if (n.includes("new balance") || n.includes("550") || n.includes("2002")) return "New Balance";
    if (n.includes("puma")) return "Puma";
    if (n.includes("converse")) return "Converse";
    if (n.includes("vans")) return "Vans";
    if (n.includes("asics")) return "ASICS";
    return "Sneaker";
}

/**
 * Legacy search function for backwards compatibility
 */
export async function searchStockX(query: string): Promise<ScraperResult> {
    const source = SOURCES.stockx;
    const catalogProducts = await searchStockXCatalog(query);

    const listings: SneakerListing[] = catalogProducts.map((product, index) => ({
        id: generateListingId("stockx", `${index}`),
        name: product.name,
        brand: product.brand,
        colorway: product.colorway,
        sku: product.sku,
        imageUrl: product.imageUrl,
        retailPrice: product.retailPrice,
        condition: "new" as const,
        source,
        price: product.stockxLowestAsk,
        currency: "CAD" as const,
        priceCAD: product.stockxLowestAsk,
        url: product.stockxUrl,
        lastUpdated: new Date(),
    }));

    return { success: true, listings, source };
}

export interface StockXProductData {
    styleId: string | null;
    productName: string;
    productUrl: string;
    imageUrl: string;
    sizes: { size: string; price: number; priceCAD: number }[];
}

/**
 * Get Style ID from a StockX product page
 * Scrapes the Product Details section for the Style value
 */
export async function getProductStyleId(productUrl: string): Promise<string | null> {
    const data = await getProductDataWithPrices(productUrl);
    return data.styleId;
}

/**
 * Get Style ID AND prices from a StockX product page
 * Scrapes both the Style value and all size prices
 */
export async function getProductDataWithPrices(productUrl: string, signal?: AbortSignal): Promise<StockXProductData> {
    const browser = await launchBrowser();

    try {
        checkAbort(signal, 'STOCKX');
        const page = await createPage(browser);

        console.log(`[StockX] Loading product page: ${productUrl}`);

        checkAbort(signal, 'STOCKX');
        await page.goto(productUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        checkAbort(signal, 'STOCKX');
        // Wait for the product traits section to load
        await page
            .waitForSelector('[data-component="ProductTraits"], [data-testid="product-traits"]', {
                timeout: 10000,
            })
            .catch(() => console.log("[StockX] Product traits section not found with selector, trying alternative..."));

        // Click on size selector to open the dropdown
        try {
            checkAbort(signal, 'STOCKX');
            const sizeButton = await page.$('[data-testid="pdp-size-selector"], [data-testid="size-selector-button"], button[aria-haspopup="menu"]');
            if (sizeButton) {
                await sizeButton.click();
                await sleepWithAbort(1000, signal, 'STOCKX');
            }
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
            console.log("[StockX] Could not click size selector");
        }

        // Wait for sizes to load
        try {
            checkAbort(signal, 'STOCKX');
            await page.waitForSelector('[data-testid="sizes-wrapper"], [data-testid="size-selector-button"]', { timeout: 5000 });
        } catch (e) {
            if (e instanceof Error && e.message === 'ABORTED') throw e;
            console.log("[StockX] Size wrapper not found");
        }

        // Get the page HTML
        const html = await page.content();
        const $ = cheerio.load(html);

        // Extract Style ID
        let styleId: string | null = null;

        $('[data-component="product-trait"], [data-testid="product-detail-trait"]').each((_, element) => {
            const $trait = $(element);
            const label = $trait.find("span").first().text().trim().toLowerCase();

            if (label === "style") {
                styleId = $trait.find("p").text().trim();
                return false;
            }
        });

        if (!styleId) {
            $('[data-component="ProductTraits"] [data-component="product-trait"]').each((_, element) => {
                const $trait = $(element);
                const label = $trait.find(".chakra-text").first().text().trim().toLowerCase();

                if (label === "style") {
                    styleId = $trait.find("p.chakra-text").text().trim();
                    return false;
                }
            });
        }

        if (!styleId) {
            const styleMatch = html.match(/Style<\/span>\s*<p[^>]*>([A-Z0-9\-]+)<\/p>/i);
            if (styleMatch) {
                styleId = styleMatch[1];
            }
        }

        console.log(`[StockX] Extracted Style ID: ${styleId || "NOT FOUND"}`);

        // Extract sizes and prices from the size selector
        const sizes: { size: string; price: number; priceCAD: number }[] = [];
        
        $('[data-testid="size-selector-button"]').each((_, element) => {
            const $button = $(element);
            
            // Get size label - "US M 8.5" -> "8.5"
            const sizeLabel = $button.find('[data-testid="selector-label"]').text().trim();
            const sizeMatch = sizeLabel.match(/([\d.]+)$/);
            if (!sizeMatch) return;
            
            const size = sizeMatch[1];
            
            // Get price - "CA$336" -> 336
            const priceText = $button.find('[data-testid="selector-secondary-label"]').text().trim();
            const priceMatch = priceText.match(/CA?\$?([\d,]+)/);
            if (!priceMatch) return;
            
            const priceCAD = parseInt(priceMatch[1].replace(/,/g, ""));
            
            sizes.push({
                size,
                price: priceCAD, // StockX shows CAD prices directly
                priceCAD,
            });
        });

        // Sort by size
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        console.log(`[STOCKX] Found ${sizes.length} sizes`);
        if (sizes.length > 0) {
            console.log(`[STOCKX] Sizes: ${sizes.map(s => `${s.size}=$${s.priceCAD}`).join(', ')}`);
        }

        // Get product name
        const productName = $('h1').first().text().trim() || 'Unknown Product';
        
        // Get HD image from the 360 view component
        let imageUrl = '';
        
        // Priority 1: Get from 360 view image (highest quality)
        const $threeSixtyImg = $('[data-component="MediaContainer"] img[data-image-type="360"], [data-component="SingleImage"] img');
        if ($threeSixtyImg.length) {
            // Try to get 3x version from srcset (highest quality)
            const srcset = $threeSixtyImg.attr('srcset') || '';
            if (srcset) {
                const srcsetLines = srcset.split(',');
                // Look for 3x version first
                for (const line of srcsetLines) {
                    if (line.includes('3x')) {
                        const urlMatch = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                        if (urlMatch) {
                            imageUrl = urlMatch[1].replace(/&amp;/g, '&');
                            break;
                        }
                    }
                }
                // Fall back to 2x
                if (!imageUrl) {
                    for (const line of srcsetLines) {
                        if (line.includes('2x')) {
                            const urlMatch = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                            if (urlMatch) {
                                imageUrl = urlMatch[1].replace(/&amp;/g, '&');
                                break;
                            }
                        }
                    }
                }
            }
            // Fall back to src attribute
            if (!imageUrl) {
                imageUrl = $threeSixtyImg.attr('src') || '';
                imageUrl = imageUrl.replace(/&amp;/g, '&');
            }
        }
        
        // Priority 2: Try any product image
        if (!imageUrl) {
            const $productImg = $('img[alt*="product"], img[data-testid="product-image"]').first();
            imageUrl = $productImg.attr('src') || '';
        }
        
        console.log(`[StockX] HD Image URL: ${imageUrl.substring(0, 100)}...`);

        return {
            styleId,
            productName,
            productUrl,
            imageUrl,
            sizes,
        };
    } catch (error) {
        if (error instanceof Error && error.message === 'ABORTED') {
            console.log('[STOCKX] Scraping aborted, closing browser');
        } else {
            console.error("[StockX] Error getting product data:", error);
        }
        return {
            styleId: null,
            productName: '',
            productUrl,
            imageUrl: '',
            sizes: [],
        };
    } finally {
        await browser.close();
    }
}
