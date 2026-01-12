import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Abort signal interface for cancelling scraping
 */
export interface AbortSignal {
    aborted: boolean;
}

/**
 * Get Puppeteer launch options that work for both local and Docker environments
 */
export function getPuppeteerOptions() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    return {
        headless: true,
        executablePath: executablePath || undefined,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage", // Important for Docker
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--no-first-run",
            "--disable-infobars",
            "--disable-features=site-per-process",
            "--single-process", // Reduce memory on low-resource servers
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
        ],
    };
}

/**
 * Launch a browser with standard anti-detection settings
 */
export async function launchBrowser(): Promise<Browser> {
    return puppeteer.launch(getPuppeteerOptions());
}

/**
 * Create a new page with standard anti-detection settings
 */
export async function createPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    
    await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    
    return page;
}

/**
 * Check if aborted and throw if so
 */
export function checkAbort(signal?: AbortSignal, source?: string): void {
    if (signal?.aborted) {
        console.log(`[${source || 'SCRAPER'}] Aborted by user`);
        throw new Error('ABORTED');
    }
}

/**
 * Sleep with abort check
 */
export async function sleepWithAbort(ms: number, signal?: AbortSignal, source?: string): Promise<void> {
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

