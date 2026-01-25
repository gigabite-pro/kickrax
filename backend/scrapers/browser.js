import puppeteer from "puppeteer";
const BROWSERLESS_API_TOKEN = process.env.BROWSERLESS_API_TOKEN;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "wss://production-sfo.browserless.io";
/** Stealth route: "stealth" (default), "chromium/stealth", "chrome/stealth", or "" to disable. */
const BROWSERLESS_STEALTH_ROUTE = process.env.BROWSERLESS_STEALTH_ROUTE ?? "stealth";
/** Comma-separated Chrome flags to remove from stealth defaults, e.g. "--disable-dev-shm-usage". */
const BROWSERLESS_IGNORE_DEFAULT_ARGS = process.env.BROWSERLESS_IGNORE_DEFAULT_ARGS;
/** Use Browserless Unblock API instead of direct connection. Options: "auto" (use when challenges detected), "always", or "never" (default). */
const BROWSERLESS_USE_UNBLOCK = process.env.BROWSERLESS_USE_UNBLOCK || "never";
/**
 * Whether Browserless.io is configured (BROWSERLESS_API_TOKEN set).
 * When true, launchBrowser connects to Browserless instead of local Puppeteer.
 */
export function isBrowserlessConfigured() {
    return !!BROWSERLESS_API_TOKEN;
}
/** Stealth route in use (e.g. "stealth") or empty if disabled. */
export function getBrowserlessStealthRoute() {
    return BROWSERLESS_API_TOKEN ? (BROWSERLESS_STEALTH_ROUTE || "") : "";
}
/**
 * Get Puppeteer launch options that work for both local and Docker environments
 */
export function getPuppeteerOptions() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const isDocker = !!executablePath;
    const args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--no-first-run",
        "--disable-infobars",
    ];
    // Only use single-process in Docker with limited resources
    if (isDocker) {
        args.push("--single-process");
    }
    return {
        headless: true,
        executablePath: executablePath || undefined,
        args,
    };
}
/**
 * Get Browserless HTTP base URL (for REST API calls like /unblock)
 */
function getBrowserlessHttpBase() {
    const wsBase = BROWSERLESS_URL.startsWith("wss://") || BROWSERLESS_URL.startsWith("ws://")
        ? BROWSERLESS_URL.replace(/\/$/, "")
        : `wss://${BROWSERLESS_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    // Convert WebSocket URL to HTTP URL
    return wsBase.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

/**
 * Build Browserless WebSocket endpoint (stealth route + token + optional launch options).
 */
function buildBrowserlessEndpoint() {
    const base = BROWSERLESS_URL.startsWith("wss://") || BROWSERLESS_URL.startsWith("ws://")
        ? BROWSERLESS_URL.replace(/\/$/, "")
        : `wss://${BROWSERLESS_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    const path = BROWSERLESS_STEALTH_ROUTE ? `/${BROWSERLESS_STEALTH_ROUTE.replace(/^\//, "")}` : "";
    const params = new URLSearchParams({ token: BROWSERLESS_API_TOKEN });
    if (BROWSERLESS_IGNORE_DEFAULT_ARGS) {
        const flags = BROWSERLESS_IGNORE_DEFAULT_ARGS.split(",").map((s) => s.trim()).filter(Boolean);
        if (flags.length) params.set("launch", JSON.stringify({ ignoreDefaultArgs: flags }));
    }
    return `${base}${path}?${params.toString()}`;
}

/**
 * Unblock a URL using Browserless Unblock API
 * Returns a browser connected to the unblocked page
 */
async function unblockUrl(url, source = "SCRAPER") {
    const httpBase = getBrowserlessHttpBase();
    // Use stealth route for unblock if configured, otherwise use chromium/unblock
    const unblockRoute = BROWSERLESS_STEALTH_ROUTE && BROWSERLESS_STEALTH_ROUTE !== "" 
        ? `${BROWSERLESS_STEALTH_ROUTE}/unblock` 
        : "chromium/unblock";
    const unblockURL = `${httpBase}/${unblockRoute}?token=${BROWSERLESS_API_TOKEN}`;
    
    console.log(`[${source}] 🔓 Unblocking URL via Browserless API: ${url.substring(0, 100)}`);
    
    try {
        const response = await fetch(unblockURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url: url,
                browserWSEndpoint: true,
                cookies: true,
                content: true,
                screenshot: false,
                ttl: 30000, // 30 seconds TTL
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Unblock API failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        const browserWSEndpoint = data.browserWSEndpoint;
        
        if (!browserWSEndpoint) {
            throw new Error("Unblock API did not return browserWSEndpoint");
        }
        
        // Connect to the unblocked browser (add token to endpoint if not present)
        const endpointWithToken = browserWSEndpoint.includes("token=") 
            ? browserWSEndpoint 
            : `${browserWSEndpoint}${browserWSEndpoint.includes("?") ? "&" : "?"}token=${BROWSERLESS_API_TOKEN}`;
        
        const browser = await puppeteer.connect({ browserWSEndpoint: endpointWithToken });
        
        console.log(`[${source}] ✓ Unblocked and connected to browser`);
        
        // Find the page that's already on the target URL
        const pages = await browser.pages();
        const urlHostname = new URL(url).hostname;
        const targetPage = pages.find(p => {
            try {
                return new URL(p.url()).hostname === urlHostname;
            } catch {
                return false;
            }
        }) || pages[0];
        
        if (targetPage) {
            console.log(`[${source}] ✓ Found unblocked page: ${targetPage.url().substring(0, 100)}`);
            // Wait for page to be fully loaded
            await targetPage.waitForLoadState?.().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return { browser, page: targetPage };
    } catch (error) {
        console.error(`[${source}] ❌ Unblock API failed: ${error?.message || error}`);
        throw error;
    }
}

const BROWSERLESS_429_MAX_RETRIES = Number(process.env.BROWSERLESS_429_MAX_RETRIES) || 3;
const BROWSERLESS_429_BACKOFF_MS = Number(process.env.BROWSERLESS_429_BACKOFF_MS) || 10_000;

/**
 * Launch a browser with standard anti-detection settings.
 * When BROWSERLESS_API_TOKEN is set, connects to Browserless.io via /stealth (or configured route).
 * Retries with backoff on 429 (rate limit). Otherwise uses local Puppeteer/Chromium.
 */
export async function launchBrowser() {
    if (BROWSERLESS_API_TOKEN) {
        const endpoint = buildBrowserlessEndpoint();
        const route = BROWSERLESS_STEALTH_ROUTE || "base";
        console.log(`[Browserless] Connecting to ${route} endpoint...`);
        let lastErr;
        for (let attempt = 0; attempt <= BROWSERLESS_429_MAX_RETRIES; attempt++) {
            try {
                const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
                const version = await browser.version().catch(() => "unknown");
                console.log(`[Browserless] ✓ Connected successfully (${version})`);
                return browser;
            }
            catch (e) {
                lastErr = e;
                const msg = e?.message ?? String(e);
                if (attempt < BROWSERLESS_429_MAX_RETRIES && /429|Too Many Requests/i.test(msg)) {
                    const waitMs = BROWSERLESS_429_BACKOFF_MS * (attempt + 1);
                    console.warn(`[Browserless] 429 rate limit, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${BROWSERLESS_429_MAX_RETRIES})`);
                    await new Promise((r) => setTimeout(r, waitMs));
                    continue;
                }
                console.error(`[Browserless] ✗ Connection failed: ${msg}`);
                throw e;
            }
        }
        throw lastErr;
    }
    console.log("[Browser] Launching local Puppeteer/Chromium...");
    const browser = await puppeteer.launch(getPuppeteerOptions());
    const version = await browser.version().catch(() => "unknown");
    console.log(`[Browser] ✓ Launched successfully (${version})`);
    return browser;
}
/**
 * Set up detailed logging and bot detection monitoring for a page
 */
function setupPageLogging(page, source = "SCRAPER") {
    const pageId = Math.random().toString(36).substring(7);
    console.log(`[${source}] Page created (id: ${pageId})`);

    const blockingState = {
        cloudflareChallenge: false,
        captchaLoaded: false,
        blockedPages: [],
        challengeUrls: [],
        errorStatuses: []
    };

    // Track bot detection URLs (only log once per unique URL pattern)
    const seenBotUrls = new Set();

    // Log navigation events
    page.on("request", (req) => {
        const url = req.url();
        const urlKey = url.split("?")[0]; // Normalize to avoid duplicates
        
        if (url.includes("/challenge-platform/") || url.includes("/challenge/")) {
            if (!seenBotUrls.has(urlKey)) {
                seenBotUrls.add(urlKey);
                blockingState.cloudflareChallenge = true;
                blockingState.challengeUrls.push(url);
                console.warn(`[${source}] ⚠️  Cloudflare challenge script: ${url.substring(0, 100)}`);
            }
        } else if (url.includes("hcaptcha.com") || url.includes("recaptcha") || url.includes("/captcha/")) {
            if (!seenBotUrls.has(urlKey)) {
                seenBotUrls.add(urlKey);
                blockingState.captchaLoaded = true;
                console.warn(`[${source}] ⚠️  Captcha system detected: ${url.substring(0, 100)}`);
            }
        }
    });

    // Log response status codes and headers (only log errors and actual challenges)
    page.on("response", async (res) => {
        const status = res.status();
        const url = res.url();
        const headers = res.headers();
        
        // Check for actual blocking indicators (not just CF presence)
        const isChallenge = status === 403 || status === 503 || 
                           url.includes("/challenge-platform/") || 
                           url.includes("/challenge/") ||
                           headers["cf-challenge"] ||
                           headers["cf-browser-verification"];
        
        const isCaptcha = url.includes("hcaptcha.com") || url.includes("recaptcha") || url.includes("/captcha/");
        
        if (status >= 400) {
            blockingState.errorStatuses.push({ status, url: url.substring(0, 80) });
            const logLevel = status >= 500 ? "error" : "warn";
            console[logLevel](`[${source}] Response ${status} ${res.statusText()} | ${url.substring(0, 80)}`);
            
            if (status === 403 || status === 503) {
                const cfRay = headers["cf-ray"];
                console.error(`[${source}] 🚫 BLOCKED: HTTP ${status} | CF-Ray: ${cfRay || "N/A"} | ${url.substring(0, 80)}`);
            }
        }
        
        if (isChallenge) {
            blockingState.cloudflareChallenge = true;
            if (!blockingState.challengeUrls.includes(url)) {
                blockingState.challengeUrls.push(url);
            }
            console.error(`[${source}] 🚫 CLOUDFLARE CHALLENGE: Status ${status} | ${url.substring(0, 80)}`);
        }
        
        if (isCaptcha && status === 200) {
            blockingState.captchaLoaded = true;
            console.warn(`[${source}] ⚠️  Captcha loaded: ${url.substring(0, 80)}`);
        }
    });

    // Log navigation failures (only important ones)
    page.on("requestfailed", (req) => {
        const failure = req.failure();
        const url = req.url();
        // Only log failures to the main domain, not third-party analytics
        if (url.includes("challenge") || url.includes("captcha") || 
            (!url.includes("google.com") && !url.includes("analytics") && !url.includes("monorail"))) {
            console.error(`[${source}] ❌ Request failed: ${req.method()} ${url.substring(0, 80)} | Error: ${failure?.errorText || "Unknown"}`);
        }
    });

    // Log frame navigation (detect redirects to challenge pages)
    page.on("framenavigated", async (frame) => {
        if (frame === page.mainFrame()) {
            const url = frame.url();
            const title = await frame.evaluate(() => document.title).catch(() => "");
            
            // Check for Cloudflare challenge indicators
            if (url.includes("challenge") || url.includes("just-a-sec") || 
                title.includes("Just a moment") || title.includes("Checking your browser")) {
                blockingState.cloudflareChallenge = true;
                blockingState.blockedPages.push({ url, reason: "Cloudflare challenge page" });
                console.error(`[${source}] 🚫 CLOUDFLARE CHALLENGE PAGE! URL: ${url.substring(0, 100)} | Title: "${title}"`);
            }
            
            // Check for other bot detection pages
            const bodyText = await frame.evaluate(() => document.body?.textContent?.substring(0, 200) || "").catch(() => "");
            if (bodyText.includes("Access Denied") || 
                bodyText.includes("Bot detected") ||
                bodyText.includes("Please verify you are human")) {
                blockingState.blockedPages.push({ url, reason: "Bot detection page" });
                console.error(`[${source}] 🚫 BOT DETECTION PAGE: ${url.substring(0, 80)}`);
            }
        }
    });

    // Store blocking state on page for summary later
    page._blockingState = blockingState;
    return pageId;
}

/**
 * Get and log blocking summary for a page
 */
export function logBlockingSummary(page, source = "SCRAPER") {
    const state = page._blockingState;
    if (!state) return;
    
    const issues = [];
    if (state.cloudflareChallenge) issues.push("Cloudflare challenge scripts loaded");
    if (state.captchaLoaded) issues.push("Captcha system detected (hCaptcha/recaptcha)");
    if (state.blockedPages.length > 0) issues.push(`${state.blockedPages.length} blocked page(s)`);
    if (state.errorStatuses.length > 0) {
        const errorCounts = {};
        state.errorStatuses.forEach(e => {
            errorCounts[e.status] = (errorCounts[e.status] || 0) + 1;
        });
        issues.push(`HTTP errors: ${Object.entries(errorCounts).map(([s, c]) => `${s}(${c})`).join(", ")}`);
    }
    
    if (issues.length > 0) {
        console.warn(`[${source}] ⚠️  Bot detection summary: ${issues.join("; ")}`);
    } else {
        console.log(`[${source}] ✓ No blocking detected`);
    }
}

/**
 * Create a new page with standard anti-detection settings and detailed logging
 */
export async function createPage(browser, source = "SCRAPER") {
    const page = await browser.newPage();
    const pageId = setupPageLogging(page, source);
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enhanced anti-detection measures
    await page.evaluateOnNewDocument(() => {
        // Remove webdriver flag
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        
        // Chrome runtime
        window.chrome = {
            runtime: {}
        };
    });
    
    // More realistic user agent (latest Chrome)
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    
    // Set additional headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1',
    });
    
    return page;
}
/**
 * Check if aborted and throw if so
 */
export function checkAbort(signal, source) {
    if (signal?.aborted) {
        console.log(`[${source || 'SCRAPER'}] Aborted by user`);
        throw new Error('ABORTED');
    }
}
/**
 * Sleep with abort check
 */
export async function sleepWithAbort(ms, signal, source) {
    const checkInterval = 100; // Check every 100ms
    const iterations = Math.ceil(ms / checkInterval);
    for (let i = 0; i < iterations; i++) {
        if (signal?.aborted) {
            console.log(`[${source || 'SCRAPER'}] Aborted during sleep`);
            throw new Error('ABORTED');
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, ms - i * checkInterval)));
    }
}

/**
 * Wait for Cloudflare challenge to complete (if present)
 * Returns true if challenge was detected and waited for, false otherwise
 */
export async function waitForCloudflareChallenge(page, source = "SCRAPER", maxWaitMs = 15000) {
    try {
        const title = await page.title();
        const url = page.url();
        const bodyText = await page.evaluate(() => document.body?.textContent?.substring(0, 500) || "").catch(() => "");
        
        const isChallenge = url.includes("challenge") || 
                           url.includes("just-a-sec") ||
                           title.includes("Just a moment") || 
                           title.includes("Checking your browser") ||
                           bodyText.includes("Please wait while we verify") ||
                           (bodyText.includes("Cloudflare") && bodyText.includes("checking"));
        
        if (!isChallenge) {
            return false;
        }
        
        console.log(`[${source}] ⏳ Cloudflare challenge detected, waiting for completion (max ${maxWaitMs}ms)...`);
        const startTime = Date.now();
        
        // Wait for challenge to complete - check every 500ms
        while (Date.now() - startTime < maxWaitMs) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
                const currentTitle = await page.title();
                const currentUrl = page.url();
                const currentBody = await page.evaluate(() => document.body?.textContent?.substring(0, 500) || "").catch(() => "");
                
                // Check if challenge is gone
                const stillChallenging = currentUrl.includes("challenge") || 
                                        currentUrl.includes("just-a-sec") ||
                                        currentTitle.includes("Just a moment") || 
                                        currentTitle.includes("Checking your browser") ||
                                        currentBody.includes("Please wait while we verify");
                
                if (!stillChallenging) {
                    const waitTime = Date.now() - startTime;
                    console.log(`[${source}] ✓ Cloudflare challenge completed after ${waitTime}ms`);
                    // Wait a bit more for page to fully load
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return true;
                }
            } catch (e) {
                // Continue waiting if evaluation fails
            }
        }
        
        const waitTime = Date.now() - startTime;
        console.warn(`[${source}] ⚠️  Cloudflare challenge still present after ${waitTime}ms`);
        return true; // Challenge was present, even if not resolved
    } catch (e) {
        return false;
    }
}

/**
 * Navigate to URL with detailed logging and Cloudflare challenge handling
 * Supports Browserless Unblock API when enabled
 */
export async function navigateWithLogging(page, url, options = {}, source = "SCRAPER") {
    const startTime = Date.now();
    console.log(`[${source}] Navigating to: ${url.substring(0, 100)}`);
    
    // Check if we should use Unblock API
    const useUnblock = BROWSERLESS_USE_UNBLOCK === "always" || 
                      (BROWSERLESS_USE_UNBLOCK === "auto" && BROWSERLESS_API_TOKEN);
    
    // If unblock is enabled and we have Browserless, try unblock first
    if (useUnblock && BROWSERLESS_API_TOKEN && !page.browser().isConnected()) {
        // This is a new navigation, we can use unblock
        // But we need the browser instance, so we'll handle it differently
        // For now, we'll use unblock on retry if challenge is detected
    }
    
    try {
        // Use networkidle2 for better challenge detection (waits for network to settle)
        const waitUntil = options.waitUntil || "networkidle2";
        const timeout = options.timeout || 45000; // Longer timeout for challenges
        
        const response = await page.goto(url, {
            waitUntil,
            timeout,
        });
        
        const duration = Date.now() - startTime;
        const status = response?.status();
        const finalUrl = page.url();
        const redirected = finalUrl !== url;
        
        console.log(`[${source}] Navigation: ${status || "N/A"} | ${duration}ms | ${finalUrl.substring(0, 100)}`);
        
        if (redirected && (finalUrl.includes("challenge") || finalUrl.includes("captcha"))) {
            console.error(`[${source}] 🚫 Redirected to challenge page: ${finalUrl.substring(0, 100)}`);
            
            // If unblock is enabled and we got a challenge, try unblock API
            if (useUnblock && BROWSERLESS_API_TOKEN) {
                console.log(`[${source}] 🔄 Retrying with Unblock API...`);
                try {
                    const { browser: unblockBrowser, page: unblockPage } = await unblockUrl(url, source);
                    
                    // Setup logging on the new page
                    if (unblockPage) {
                        setupPageLogging(unblockPage, source);
                        // Page is already loaded by unblock API, just wait a bit
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        logBlockingSummary(unblockPage, source);
                        // Return a mock response since page is already loaded
                        return { status: () => 200, url: () => unblockPage.url() };
                    }
                } catch (unblockError) {
                    console.error(`[${source}] ⚠️  Unblock API failed, continuing with normal navigation: ${unblockError?.message}`);
                }
            }
        } else if (redirected) {
            console.warn(`[${source}] ⚠️  Redirected: ${url.substring(0, 60)} → ${finalUrl.substring(0, 60)}`);
        }
        
        if (status && status >= 400) {
            console.error(`[${source}] ❌ HTTP ${status} error on navigation`);
        }
        
        // Wait for Cloudflare challenge if present
        const hadChallenge = await waitForCloudflareChallenge(page, source, 15000);
        
        // If challenge persists and unblock is enabled, try unblock API
        if (hadChallenge && useUnblock && BROWSERLESS_API_TOKEN) {
            try {
                const title = await page.title().catch(() => "");
                const bodyText = await page.evaluate(() => document.body?.textContent?.substring(0, 300) || "").catch(() => "");
                
                if (title.includes("Just a moment") || title.includes("Checking your browser") ||
                    bodyText.includes("Please wait while we verify")) {
                    console.log(`[${source}] 🔄 Challenge still present, trying Unblock API...`);
                    const { browser: unblockBrowser, page: unblockPage } = await unblockUrl(url, source);
                    
                    if (unblockPage) {
                        setupPageLogging(unblockPage, source);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        // Page is already loaded by unblock API
                        logBlockingSummary(unblockPage, source);
                        return { status: () => 200, url: () => unblockPage.url() };
                    }
                }
            } catch (unblockError) {
                console.error(`[${source}] ⚠️  Unblock API failed: ${unblockError?.message}`);
            }
        }
        
        // Additional wait for page to stabilize after challenge
        if (hadChallenge) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            // Normal wait for scripts to load
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Check page title/content for bot detection
        try {
            const title = await page.title();
            const bodyText = await page.evaluate(() => document.body?.textContent?.substring(0, 300) || "").catch(() => "");
            
            if (title.includes("Just a moment") || title.includes("Checking your browser") || 
                bodyText.includes("Please wait while we verify") ||
                (bodyText.includes("Cloudflare") && bodyText.includes("checking"))) {
                console.error(`[${source}] 🚫 CLOUDFLARE CHALLENGE PAGE: Title="${title}" | Body preview: ${bodyText.substring(0, 100)}`);
                if (page._blockingState) {
                    page._blockingState.cloudflareChallenge = true;
                    page._blockingState.blockedPages.push({ url: finalUrl, reason: "Cloudflare challenge page content" });
                }
            }
            
            if (bodyText.includes("Access Denied") || bodyText.includes("Bot detected") ||
                bodyText.includes("403 Forbidden") || bodyText.includes("Blocked")) {
                console.error(`[${source}] 🚫 BLOCKED PAGE: Title="${title}"`);
                if (page._blockingState) {
                    page._blockingState.blockedPages.push({ url: finalUrl, reason: "Blocked page content" });
                }
            }
        } catch (e) {
            // Ignore evaluation errors
        }
        
        // Log blocking summary after navigation
        logBlockingSummary(page, source);
        
        return response;
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${source}] ❌ Navigation failed after ${duration}ms: ${error?.message || error}`);
        throw error;
    }
}

/**
 * Navigate using Unblock API (always uses unblock, regardless of challenge detection)
 * Use this for sites that consistently block
 * Returns { browser, page, response } where page is already loaded and unblocked
 */
export async function navigateWithUnblock(url, options = {}, source = "SCRAPER") {
    if (!BROWSERLESS_API_TOKEN) {
        throw new Error("BROWSERLESS_API_TOKEN required for Unblock API");
    }
    
    console.log(`[${source}] 🔓 Navigating with Unblock API: ${url.substring(0, 100)}`);
    
    const { browser, page } = await unblockUrl(url, source);
    
    if (!page) {
        throw new Error("Unblock API did not return a page");
    }
    
    // Setup logging
    setupPageLogging(page, source);
    
    // Wait for page to be ready (it's already loaded by unblock API)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Optionally reload to ensure fresh content
    const waitUntil = options.waitUntil || "networkidle2";
    const timeout = options.timeout || 45000;
    const response = await page.reload({ waitUntil, timeout }).catch(() => null);
    
    logBlockingSummary(page, source);
    
    return { browser, page, response };
}
//# sourceMappingURL=browser.js.map