import { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { SOURCES, SneakerListing, CatalogProduct } from "../../types.js";
import { ScraperResult, generateListingId } from "../types.js";
import { launchBrowser, createPage, AbortSignal, checkAbort, sleepWithAbort } from "../browser.js";

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
function getImageUrl($tile: cheerio.Cheerio<any>, slug: string): string {
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
 * Fetch StockX catalog (search or trending) using an existing browser.
 * Creates a page, scrapes, closes the page only. Does NOT close the browser.
 */
export async function fetchStockXCatalogInBrowser(
    browser: Browser,
    query?: string,
    sort?: string
): Promise<CatalogProduct[]> {
    let page: Page | null = null;
    const targetCount = 50;

    try {
        let searchUrl = "https://stockx.com/search?category=sneakers";
        if (query) searchUrl += `&s=${encodeURIComponent(query)}`;
        if (sort) searchUrl += `&sort=${encodeURIComponent(sort)}`;

        console.log(`[StockX] Scraping: ${searchUrl} (target: ${targetCount} products)`);
        page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const resourceType = req.resourceType();
            if (["image", "font", "stylesheet", "media"].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setViewport({ width: 1280, height: 800 });
        const chromeVersions = ["120", "121", "122", "123", "124"];
        const randomVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
        await page.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion}.0.0.0 Safari/537.36`);

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            // @ts-ignore
            window.chrome = { runtime: {} };
        });

        await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
        });

        // Wait for product tiles to load
        try {
            await page.waitForSelector('[data-testid="ProductTile"]', { timeout: 8000 });
            console.log("[StockX] Product tiles loaded");
        } catch (e) {
            console.log("[StockX] ProductTile selector not found, trying alternative...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Scroll to trigger lazy loading - reduced iterations for speed
        const scrollIterations = 3;
        console.log(`[StockX] Scrolling ${scrollIterations} times to load products...`);
        
        for (let i = 0; i < scrollIterations; i++) {
            await page.evaluate((scrollIndex) => {
                window.scrollTo(0, (scrollIndex + 1) * window.innerHeight);
            }, i);
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
        
        // Final scroll to bottom
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

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
    } catch (error: unknown) {
        console.error("[StockX] Catalog scrape error:", error instanceof Error ? error.message : error);
        return [];
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

/**
 * Search StockX catalog. Launches browser, fetches, closes browser.
 * Use for trending. For search, use fetchStockXCatalogInBrowser with session.
 */
export async function searchStockXCatalog(query?: string, sort?: string): Promise<CatalogProduct[]> {
    const browser = await launchBrowser();
    try {
        const products = await fetchStockXCatalogInBrowser(browser, query, sort);
        return products;
    } finally {
        await browser.close().catch(() => {});
        console.log("[StockX] Browser closed after catalog fetch");
    }
}

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
 */
export async function getProductStyleId(productUrl: string): Promise<string | null> {
    const data = await getProductDataWithPrices(productUrl);
    return data.styleId;
}

/**
 * Scrape StockX product page (style ID + sizes + image) using an existing page.
 * Does NOT close the page or browser. Caller manages lifecycle.
 */
export async function fetchStockXProductInPage(
    page: Page,
    productUrl: string,
    signal?: AbortSignal
): Promise<StockXProductData> {
    try {
        checkAbort(signal, "STOCKX");
        console.log(`[StockX] Loading product page: ${productUrl}`);

        await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 30000 });

        checkAbort(signal, "STOCKX");
        await page
            .waitForSelector('[data-component="ProductTraits"], [data-testid="product-traits"]', { timeout: 10000 })
            .catch(() => console.log("[StockX] Product traits not found, continuing..."));

        const sizeButton = await page.$('[data-testid="pdp-size-selector"], [data-testid="size-selector-button"], button[aria-haspopup="menu"]');
        if (sizeButton) {
            await sizeButton.click();
            await sleepWithAbort(1000, signal, "STOCKX");
        }

        try {
            await page.waitForSelector('[data-testid="sizes-wrapper"], [data-testid="size-selector-button"]', { timeout: 5000 });
        } catch {
            console.log("[StockX] Size wrapper not found");
        }
        await sleepWithAbort(800, signal, "STOCKX");

        const html = await page.content();
        const $ = cheerio.load(html);

        let styleId: string | null = null;
        $('[data-component="product-trait"], [data-testid="product-detail-trait"]').each((_, el) => {
            const $trait = $(el);
            if ($trait.find("span").first().text().trim().toLowerCase() === "style") {
                styleId = $trait.find("p").text().trim();
                return false;
            }
        });
        if (!styleId) {
            $('[data-component="ProductTraits"] [data-component="product-trait"]').each((_, el) => {
                const $trait = $(el);
                if ($trait.find(".chakra-text").first().text().trim().toLowerCase() === "style") {
                    styleId = $trait.find("p.chakra-text").text().trim();
                    return false;
                }
            });
        }
        if (!styleId) {
            const m = html.match(/Style<\/span>\s*<p[^>]*>([A-Z0-9\-]+)<\/p>/i);
            if (m) styleId = m[1];
        }

        console.log(`[StockX] Style ID: ${styleId || "NOT FOUND"}`);

        const sizes: { size: string; price: number; priceCAD: number }[] = [];
        $('[data-testid="size-selector-button"]').each((_, el) => {
            const $b = $(el);
            const label = $b.find('[data-testid="selector-label"]').text().trim();
            const sm = label.match(/([\d.]+)$/);
            if (!sm) return;
            const priceText = $b.find('[data-testid="selector-secondary-label"]').text().trim();
            const pm = priceText.match(/CA?\$?([\d,]+)/);
            if (!pm) return;
            const priceCAD = parseInt(pm[1].replace(/,/g, ""), 10);
            sizes.push({ size: sm[1], price: priceCAD, priceCAD });
        });
        sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

        const productName = $("h1").first().text().trim() || "Unknown Product";
        let imageUrl = "";
        const $img = $('[data-component="MediaContainer"] img[data-image-type="360"], [data-component="SingleImage"] img');
        if ($img.length) {
            const srcset = $img.attr("srcset") || "";
            for (const line of srcset.split(",")) {
                if (line.includes("3x")) {
                    const u = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                    if (u) {
                        imageUrl = u[1].replace(/&amp;/g, "&");
                        break;
                    }
                }
            }
            if (!imageUrl) {
                for (const line of srcset.split(",")) {
                    if (line.includes("2x")) {
                        const u = line.match(/(https:\/\/images\.stockx\.com\/[^\s]+)/);
                        if (u) {
                            imageUrl = u[1].replace(/&amp;/g, "&");
                            break;
                        }
                    }
                }
            }
            if (!imageUrl) imageUrl = ($img.attr("src") || "").replace(/&amp;/g, "&");
        }
        if (!imageUrl) {
            const $pi = $('img[alt*="product"], img[data-testid="product-image"]').first();
            imageUrl = $pi.attr("src") || "";
        }

        return { styleId, productName, productUrl, imageUrl, sizes };
    } catch (e) {
        if (e instanceof Error && e.message === "ABORTED") throw e;
        console.error("[StockX] Product page error:", e);
        return { styleId: null, productName: "", productUrl, imageUrl: "", sizes: [] };
    }
}

/**
 * Get Style ID AND prices from a StockX product page (standalone: launches and closes browser).
 */
export async function getProductDataWithPrices(productUrl: string, signal?: AbortSignal): Promise<StockXProductData> {
    const browser = await launchBrowser();
    let page: Page | null = null;

    try {
        checkAbort(signal, "STOCKX");
        page = await createPage(browser);
        const data = await fetchStockXProductInPage(page, productUrl, signal);
        return data;
    } catch (error) {
        if (error instanceof Error && error.message === "ABORTED") throw error;
        console.error("[StockX] Error getting product data:", error);
        return { styleId: null, productName: "", productUrl, imageUrl: "", sizes: [] };
    } finally {
        if (page) await page.close().catch(() => {});
        await browser.close().catch(() => {});
        console.log("[StockX] Browser closed after product page");
    }
}
