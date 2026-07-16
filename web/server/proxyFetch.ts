/**
 * server/proxyFetch.ts
 *
 * Hardened fetch layer for the Amazon scraper. Keeps the existing cheerio
 * parser untouched — this module only changes HOW the page is fetched:
 *
 *   1. Rotates realistic browser profiles (UA + matching Sec-CH-UA client hints)
 *      so the User-Agent and the client hints always agree (a common bot tell).
 *   2. Routes through a residential proxy when AMAZON_PROXIES / AMAZON_PROXY is set,
 *      rotating across the pool on every retry.
 *   3. Sends region-matched Accept-Language per Amazon marketplace.
 *   4. Retries on robot-check / soft errors with jittered backoff.
 *
 * This is the "minimal change" path: no Playwright, no headless browser.
 * It lowers the bot signal of a plain server-side request but is NOT a guarantee
 * against Amazon's detection — pair it with a quality residential proxy.
 */

import { ProxyAgent, type Dispatcher } from "undici";

export interface BrowserProfile {
  ua: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
}

// Each profile carries a UA and client hints that are internally consistent.
const BROWSER_PROFILES: BrowserProfile[] = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="125", "Google Chrome";v="125", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="123", "Google Chrome";v="123", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="125", "Google Chrome";v="125", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
];

// Region-matched Accept-Language per marketplace (bot signal when mismatched).
const LOCALE_BY_DOMAIN: Record<string, string> = {
  "amazon.com": "en-US,en;q=0.9",
  "amazon.co.uk": "en-GB,en;q=0.9",
  "amazon.de": "de-DE,de;q=0.9,en;q=0.8",
  "amazon.fr": "fr-FR,fr;q=0.9,en;q=0.8",
  "amazon.it": "it-IT,it;q=0.9,en;q=0.8",
  "amazon.es": "es-ES,es;q=0.9,en;q=0.8",
  "amazon.nl": "nl-NL,nl;q=0.9,en;q=0.8",
  "amazon.se": "sv-SE,sv;q=0.9,en;q=0.8",
  "amazon.pl": "pl-PL,pl;q=0.9,en;q=0.8",
  "amazon.com.be": "fr-BE,fr;q=0.9,nl-BE;q=0.8,en;q=0.7",
  "amazon.ie": "en-IE,en;q=0.9",
};

export function loadProxies(): string[] {
  const raw =
    process.env.AMAZON_PROXIES ||
    process.env.AMAZON_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildHeaders(domain: string, profile: BrowserProfile): Record<string, string> {
  const acceptLang = LOCALE_BY_DOMAIN[domain] || "en-US,en;q=0.9";
  return {
    "User-Agent": profile.ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": acceptLang,
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": profile.secChUa,
    "sec-ch-ua-mobile": profile.secChUaMobile,
    "sec-ch-ua-platform": profile.secChUaPlatform,
  };
}

export class RobotCheckError extends Error {
  constructor() {
    super("robot-check");
    this.name = "RobotCheckError";
  }
}

export interface FetchResult {
  html: string;
  status: number;
  profile: BrowserProfile;
  proxy: string | null;
}

/**
 * Fetch an Amazon product page with proxy rotation + UA rotation + retries.
 * Throws RobotCheckError if every attempt hits a CAPTCHA/robot-check page.
 */
export async function fetchAmazonPage(
  url: string,
  domain: string,
  opts: {
    isRobotCheckPage: (html: string) => boolean;
    timeoutMs?: number;
    maxRetries?: number;
    signal?: AbortSignal;
  }
): Promise<FetchResult> {
  const proxies = loadProxies();
  const timeoutMs = opts.timeoutMs ?? 30000;
  const maxRetries = Math.max(1, opts.maxRetries ?? 4);
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const profile = pick(BROWSER_PROFILES);
    const proxy = proxies.length ? pick(proxies) : null;
    const dispatcher: Dispatcher | undefined = proxy ? new ProxyAgent(proxy) : undefined;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const init: any = {
        headers: buildHeaders(domain, profile),
        signal: controller.signal,
      };
      if (dispatcher) init.dispatcher = dispatcher;

      const resp = await fetch(url, init);

      if (!resp.ok) {
        // 404 = genuinely not found; no point retrying.
        if (resp.status === 404) throw new Error(`HTTP ${resp.status}`);
        lastErr = new Error(`HTTP ${resp.status}`);
        console.warn(
          `[scrape] attempt ${attempt}/${maxRetries} got HTTP ${resp.status}${proxy ? ` via ${maskProxy(proxy)}` : ""}`
        );
      } else {
        const html = await resp.text();
        if (opts.isRobotCheckPage(html)) {
          lastErr = new RobotCheckError();
          console.warn(
            `[scrape] robot-check on attempt ${attempt}/${maxRetries}${proxy ? ` via ${maskProxy(proxy)}` : " (no proxy)"}`
          );
        } else {
          return { html, status: resp.status, profile, proxy };
        }
      }
    } catch (err: any) {
      if (err instanceof RobotCheckError) {
        lastErr = err;
      } else if (err?.name === "AbortError") {
        lastErr = new Error("timeout");
        console.warn(`[scrape] attempt ${attempt}/${maxRetries} timed out`);
      } else {
        lastErr = err;
        console.warn(`[scrape] attempt ${attempt}/${maxRetries} error: ${err?.message || err}`);
      }
    } finally {
      clearTimeout(t);
    }

    if (attempt < maxRetries) {
      const delay = 1200 + Math.floor(Math.random() * 1800); // jittered backoff
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  if (lastErr instanceof RobotCheckError) throw lastErr;
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function maskProxy(proxy: string): string {
  try {
    const u = new URL(proxy);
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return "proxy";
  }
}
