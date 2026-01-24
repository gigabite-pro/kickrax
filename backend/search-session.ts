import type { Browser } from "puppeteer";
import { launchBrowser } from "./scrapers/browser.js";

const IDLE_TIMEOUT_MS = 30_000; // 30 seconds

let sessionBrowser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer(): void {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}

async function releaseBrowser(): Promise<void> {
    clearIdleTimer();
    if (sessionBrowser) {
        try {
            await sessionBrowser.close();
        } catch (e) {
            console.warn("[SearchSession] Error closing browser:", e);
        }
        sessionBrowser = null;
        console.log("[SearchSession] Browser released");
    }
}

function scheduleIdleClose(): void {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
        idleTimer = null;
        console.log("[SearchSession] 30s idle, closing browser");
        releaseBrowser();
    }, IDLE_TIMEOUT_MS);
}

/**
 * Get the current search-session browser, or null if none.
 */
export function getSessionBrowser(): Browser | null {
    return sessionBrowser;
}

/**
 * Acquire a browser for product/prices flow. Cancels idle timer.
 * Returns existing session browser if still open, otherwise launches and stores one.
 * Call releaseSessionForProduct() when done.
 */
export async function acquireBrowserForProduct(): Promise<Browser> {
    clearIdleTimer();
    if (sessionBrowser && sessionBrowser.isConnected()) {
        return sessionBrowser;
    }
    sessionBrowser = await launchBrowser();
    console.log("[SearchSession] Browser acquired for product/prices");
    return sessionBrowser;
}

/**
 * Release the session browser (e.g. after product+all-prices flow).
 */
export async function releaseSessionForProduct(): Promise<void> {
    await releaseBrowser();
}

/**
 * Get or create the search-session browser, then run fn(browser).
 * Starts the 30s idle timer after fn returns (browser stays open).
 * Use for /api/search: fetch catalog, keep browser, start timer.
 */
export async function withSearchSession<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    if (!sessionBrowser || !sessionBrowser.isConnected()) {
        sessionBrowser = await launchBrowser();
        console.log("[SearchSession] Browser acquired for search");
    }
    const result = await fn(sessionBrowser);
    scheduleIdleClose();
    return result;
}
