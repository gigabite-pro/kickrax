import "../load-env.js";

const BROWSERLESS_API_TOKEN = process.env.BROWSERLESS_API_TOKEN;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "https://production-sfo.browserless.io";
const BROWSERQL_PROXY_COUNTRY = process.env.BROWSERQL_PROXY_COUNTRY || "ca";

/**
 * Get BrowserQL POST URL (no sessions).
 * Matches: .../stealth/bql?token=...&proxy=residential&proxyCountry=ca&proxyLocaleMatch=true&blockConsentModals=true
 */
function getBrowserQLEndpoint() {
    if (!BROWSERLESS_API_TOKEN) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }
    const base = BROWSERLESS_URL.replace(/\/$/, "").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const params = new URLSearchParams({
        token: BROWSERLESS_API_TOKEN,
        proxy: "residential",
        proxyCountry: BROWSERQL_PROXY_COUNTRY,
        proxyLocaleMatch: "true",
        blockConsentModals: "true",
    });
    return `${base}/stealth/bql?${params.toString()}`;
}

/**
 * Execute a BrowserQL GraphQL mutation via POST (no sessions).
 */
export async function executeBrowserQL(mutation, variables = {}) {
    if (!BROWSERLESS_API_TOKEN) {
        throw new Error("BROWSERLESS_API_TOKEN is required for BrowserQL");
    }

    const endpoint = getBrowserQLEndpoint();

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: mutation, variables }),
        });

        if (!response.ok) {
            if (response.status === 429) {
                const err = new Error("BrowserQL rate limit (429 Too Many Requests)");
                err.status = 429;
                throw err;
            }
            const errorText = await response.text();
            let short = errorText;
            if (errorText.includes("<html>") || errorText.includes("<body>")) {
                short = `${response.status} ${response.statusText}`;
            } else if (errorText.length > 200) {
                short = errorText.slice(0, 200) + "...";
            }
            throw new Error(`BrowserQL request failed: ${response.status} ${response.statusText} - ${short}`);
        }

        const result = await response.json();
        if (result.errors && result.errors.length) {
            throw new Error(`BrowserQL errors: ${JSON.stringify(result.errors)}`);
        }
        return result.data;
    } catch (e) {
        if (e?.status !== 429) {
            console.error("[BrowserQL] Error:", e?.message ?? e);
        }
        throw e;
    }
}

export function isBrowserQLConfigured() {
    return !!BROWSERLESS_API_TOKEN;
}
