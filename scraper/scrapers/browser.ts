import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Abort signal interface for cancelling scraping
 */
export interface AbortSignal {
    aborted: boolean;
}

// Track active browser for cleanup on shutdown
let activeBrowser: Browser | null = null;

/**
 * Get Puppeteer launch options optimized for Fly.io/Docker environments
 * 
 * Flags explanation:
 * --no-sandbox: Required for running as root in Docker
 * --disable-setuid-sandbox: Required for Docker
 * --disable-dev-shm-usage: Use /tmp instead of /dev/shm (avoids OOM in containers)
 * --disable-gpu: No GPU in serverless environments
 * --no-zygote: Disable zygote process (reduces memory, required for single-process mode)
 * --single-process: Run in single process (required for --no-zygote)
 */
export function getPuppeteerOptions() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const isDocker = !!executablePath;
    
    const args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-blink-features=AutomationControlled",
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
 * Tracks the browser instance for cleanup on shutdown
 */
export async function launchBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch(getPuppeteerOptions());
    activeBrowser = browser;
    return browser;
}

/**
 * Close the active browser instance (for graceful shutdown)
 */
export async function closeBrowser(): Promise<void> {
    if (activeBrowser) {
        try {
            await activeBrowser.close();
            console.log("[BROWSER] Active browser closed");
        } catch (error) {
            console.error("[BROWSER] Error closing browser:", error);
        } finally {
            activeBrowser = null;
        }
    }
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
