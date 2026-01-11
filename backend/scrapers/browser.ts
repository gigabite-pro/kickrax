import puppeteer, { Browser, Page } from "puppeteer";

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

