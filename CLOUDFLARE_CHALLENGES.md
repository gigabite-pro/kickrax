# Tackling Cloudflare Challenges

This guide explains how to handle Cloudflare bot detection and challenges in the scraper.

## Current Implementation

The scraper now includes automatic Cloudflare challenge handling:

1. **Automatic Challenge Detection**: Detects when Cloudflare challenges are present
2. **Wait for Completion**: Automatically waits up to 15 seconds for challenges to auto-solve
3. **Enhanced Anti-Detection**: Better browser fingerprinting and headers
4. **Better Navigation**: Uses `networkidle2` to wait for challenges to complete

## Strategies

### 1. **Automatic Challenge Waiting** ✅ (Implemented)

The `waitForCloudflareChallenge()` function:
- Detects challenge pages by URL, title, and content
- Waits up to 15 seconds for the challenge to auto-solve
- Checks every 500ms if the challenge is complete
- Logs progress and completion

**How it works:**
- Cloudflare challenges often solve themselves automatically (JavaScript-based)
- The function waits for the challenge to complete before proceeding
- If challenge completes, scraping continues normally

### 2. **Browserless Stealth Routes** ✅ (Already Configured)

You're using Browserless with stealth routes. Options:

```bash
# Default (recommended)
BROWSERLESS_STEALTH_ROUTE=stealth

# Alternative options
BROWSERLESS_STEALTH_ROUTE=chromium/stealth
BROWSERLESS_STEALTH_ROUTE=chrome/stealth
```

**Try different routes** if one isn't working:
- `/stealth` - Recommended, most comprehensive
- `/chromium/stealth` - Optimized for Chromium
- `/chrome/stealth` - Standard Chrome experience

### 3. **Enhanced Browser Fingerprinting** ✅ (Implemented)

The scraper now includes:
- Latest Chrome user agent (131.0.0.0)
- Realistic browser headers (Accept-Language, Sec-Fetch-*, etc.)
- Navigator property overrides (webdriver, plugins, languages)
- Chrome runtime object

### 4. **Navigation Strategy** ✅ (Implemented)

- Uses `networkidle2` instead of `domcontentloaded` (waits for network to settle)
- Longer timeout (45 seconds) to allow challenges to complete
- Waits 2 seconds after navigation for scripts to load
- Additional wait after challenge completion

### 5. **Browserless Unblock API** ✅ (Implemented)

The Unblock API is now integrated and can be enabled via environment variable:

```bash
# Enable automatic unblock when challenges are detected
BROWSERLESS_USE_UNBLOCK=auto

# Or always use unblock (most reliable but slower)
BROWSERLESS_USE_UNBLOCK=always
```

**How it works:**
1. When a challenge is detected, the scraper automatically calls Browserless Unblock API
2. Unblock API handles the challenge and returns an unblocked browser
3. The scraper continues with the unblocked page

**When to use:**
- **`auto`**: Recommended - uses unblock only when challenges are detected
- **`always`**: For sites that consistently block (slower but most reliable)
- **`never`**: Default - relies on stealth routes and challenge waiting

**Manual usage in code:**
```javascript
import { navigateWithUnblock } from "./scrapers/browser.js";

// Always use unblock for a specific URL
const { browser, page, response } = await navigateWithUnblock(
  "https://example.com",
  { waitUntil: "networkidle2", timeout: 45000 },
  "MY_SOURCE"
);

// Use the unblocked page for scraping
const data = await page.evaluate(() => {
  // Your scraping code
});
```

### 6. **Residential Proxies** (Browserless Feature)

Browserless supports residential proxies to avoid IP-based blocking:

```bash
# In Browserless connection URL
?token=YOUR_TOKEN&proxy=residential&proxyCountry=us
```

**Benefits:**
- Uses residential IPs instead of datacenter IPs
- Reduces IP-based rate limiting
- Better success rate on strict sites

### 7. **Session Management** (Already Implemented)

The `search-session.js` maintains browser sessions:
- Reuses browser instances
- Keeps cookies between requests
- Reduces challenge frequency

### 8. **Rate Limiting** (Already Implemented)

- Connection lock prevents concurrent Browserless connections
- Retry with backoff for 429 errors
- Sequential execution for some scrapers

## Environment Variables

```bash
# Browserless Configuration
BROWSERLESS_API_TOKEN=your_token_here
BROWSERLESS_URL=wss://production-sfo.browserless.io  # Optional
BROWSERLESS_STEALTH_ROUTE=stealth  # Options: stealth, chromium/stealth, chrome/stealth, or "" to disable

# Unblock API Configuration
BROWSERLESS_USE_UNBLOCK=auto  # Options: "auto" (use when challenges detected), "always", or "never" (default)

# Challenge Handling (built-in, no config needed)
# Automatically waits up to 15 seconds for challenges
```

### Unblock API Modes

- **`never`** (default): Never use Unblock API, rely on stealth routes and challenge waiting
- **`auto`**: Automatically use Unblock API when challenges are detected
- **`always`**: Always use Unblock API for all navigations (most reliable but slower)

## Troubleshooting

### Challenge Still Present After 15s

**Symptoms:**
```
⚠️  Cloudflare challenge still present after 15000ms
```

**Solutions:**
1. **Enable Unblock API** (Recommended):
   ```bash
   BROWSERLESS_USE_UNBLOCK=auto
   ```
   This will automatically use Unblock API when challenges are detected.

2. Try a different stealth route (`chromium/stealth` or `chrome/stealth`)

3. Use `always` mode for persistent blocking:
   ```bash
   BROWSERLESS_USE_UNBLOCK=always
   ```

4. Check if site requires manual captcha solving (may need captcha service)

### Getting 403 Errors

**Symptoms:**
```
🚫 BLOCKED: HTTP 403 | CF-Ray: ...
```

**Solutions:**
1. **Enable Unblock API** (Recommended):
   ```bash
   BROWSERLESS_USE_UNBLOCK=auto
   ```
   Or for persistent 403s:
   ```bash
   BROWSERLESS_USE_UNBLOCK=always
   ```

2. Use residential proxies (Browserless feature)

3. Slow down requests (add delays between scrapes)

4. Rotate user agents (already implemented)

### Challenge Scripts Loading But Not Blocking

**Symptoms:**
```
⚠️  Cloudflare challenge scripts loaded
✓ No blocking detected
```

**This is normal!** Challenge scripts may load but not block if:
- Stealth route is working
- Challenge auto-solves quickly
- Site allows the request

## Best Practices

1. **Use Stealth Routes**: Always use Browserless stealth routes
2. **Wait for Challenges**: Let automatic waiting handle challenges
3. **Monitor Logs**: Watch for blocking indicators in logs
4. **Rate Limit**: Don't scrape too aggressively
5. **Session Reuse**: Reuse browser sessions when possible
6. **Residential Proxies**: Consider for high-value targets

## Testing

To test challenge handling:

```bash
# Check logs for challenge detection
grep "Cloudflare challenge" logs.txt

# Check for blocking
grep "BLOCKED\|BOT DETECTION" logs.txt

# Check summary
grep "Bot detection summary" logs.txt
```

## Next Steps

If challenges persist:

1. **Contact Browserless Support**: They can help with advanced configurations
2. **Consider Captcha Solving**: For sites requiring manual captcha (hCaptcha, reCAPTCHA)
3. **Use Unblock API**: For persistent blocking
4. **Residential Proxies**: For IP-based blocking

## Resources

- [Browserless Stealth Routes Docs](https://www.browserless.io/docs/stealth)
- [Browserless Unblock API](https://www.browserless.io/docs/unblock)
- [Browserless Proxies](https://www.browserless.io/docs/proxies)
