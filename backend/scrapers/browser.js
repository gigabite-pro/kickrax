import puppeteer from "puppeteer";
const BROWSERLESS_API_TOKEN = process.env.BROWSERLESS_API_TOKEN;
/**
 * Whether Browserless.io is configured (BROWSERLESS_API_TOKEN set).
 * When true, launchBrowser can connect to Browserless instead of local Puppeteer.
 */
export function isBrowserlessConfigured() {
    return !!BROWSERLESS_API_TOKEN;
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
 * Launch a browser with standard anti-detection settings
 */
export async function launchBrowser() {
    return puppeteer.launch(getPuppeteerOptions());
}
/**
 * Create a new page with standard anti-detection settings
 */
export async function createPage(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
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
//# sourceMappingURL=browser.js.map