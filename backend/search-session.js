import { launchBrowser } from "./scrapers/browser.js";
const IDLE_TIMEOUT_MS = 30000; // 30 seconds
let sessionBrowser = null;
let idleTimer = null;
let connectingPromise = null; // Lock: if set, a connection is in progress
function clearIdleTimer() {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}
async function releaseBrowser() {
    clearIdleTimer();
    if (sessionBrowser) {
        try {
            await sessionBrowser.close();
        }
        catch (e) {
            console.warn("[SearchSession] Error closing browser:", e);
        }
        sessionBrowser = null;
        console.log("[SearchSession] Browser released");
    }
}
function scheduleIdleClose() {
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
export function getSessionBrowser() {
    return sessionBrowser;
}
/**
 * Acquire a browser for product/prices flow. Cancels idle timer.
 * Returns existing session browser if still open, otherwise launches and stores one.
 * If a connection is in progress, waits for it instead of starting a new one.
 * Call releaseSessionForProduct() when done.
 */
export async function acquireBrowserForProduct() {
    clearIdleTimer();
    if (sessionBrowser && sessionBrowser.isConnected()) {
        return sessionBrowser;
    }
    // If another request is already connecting, wait for it
    if (connectingPromise) {
        await connectingPromise;
        if (sessionBrowser && sessionBrowser.isConnected()) {
            return sessionBrowser;
        }
    }
    // Start connection (others will wait on this promise)
    connectingPromise = (async () => {
        try {
            sessionBrowser = await launchBrowser();
            console.log("[SearchSession] Browser acquired for product/prices");
            return sessionBrowser;
        } finally {
            connectingPromise = null; // Clear lock when done
        }
    })();
    return await connectingPromise;
}
/**
 * Release the session browser (e.g. after product+all-prices flow).
 */
export async function releaseSessionForProduct() {
    await releaseBrowser();
}
/**
 * Get or create the search-session browser, then run fn(browser).
 * Starts the 30s idle timer after fn returns (browser stays open).
 * Use for /api/search: fetch catalog, keep browser, start timer.
 */
export async function withSearchSession(fn) {
    if (!sessionBrowser || !sessionBrowser.isConnected()) {
        // If another request is already connecting, wait for it
        if (connectingPromise) {
            await connectingPromise;
            // Re-check after waiting (connection might have failed)
            if (!sessionBrowser || !sessionBrowser.isConnected()) {
                throw new Error("Failed to acquire browser session");
            }
        } else {
            // Start connection (others will wait on this promise)
            connectingPromise = (async () => {
                try {
                    sessionBrowser = await launchBrowser();
                    console.log("[SearchSession] Browser acquired for search");
                    return sessionBrowser;
                } finally {
                    connectingPromise = null; // Clear lock when done
                }
            })();
            await connectingPromise;
        }
    }
    const result = await fn(sessionBrowser);
    scheduleIdleClose();
    return result;
}
//# sourceMappingURL=search-session.js.map