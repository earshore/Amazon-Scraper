/**
 * server/index.ts
 *
 * Lean Express backend for the install-free Amazon Scraper web app.
 * Adapted from the codebuddy-chat-web skill scaffold — keeps the Express + tsx foundation
 * but replaces the chat / CodeBuddy Agent SDK layer with the focused scraping workflow.
 *
 * The fetch layer now uses server/proxyFetch.ts for proxy + UA rotation + retries.
 *
 * Endpoints:
 *   GET  /api/health            — liveness probe (reports whether a proxy is configured)
 *   POST /api/scrape            — { asin, domain } -> scraped product JSON
 */

import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { scrapeAmazonHtml, isRobotCheckPage, type ScrapeProduct, type ScrapeResult } from "./scraper.js";
import { fetchAmazonPage, RobotCheckError } from "./proxyFetch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Domains the scraper is allowed to target (matches the original extension's host_permissions).
const ALLOWED_DOMAINS = [
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.com.be",
  "amazon.ie",
];

const MAX_BATCH = Number(process.env.SCRAPE_MAX_BATCH || 50);
const BATCH_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 5);

/** Run an async mapper over items with a bounded concurrency (preserves input order). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const cur = idx++;
      try {
        out[cur] = await fn(items[cur]);
      } catch (e) {
        out[cur] = e as R;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

app.get("/api/health", (_req, res) => {
  const proxyConfigured = Boolean(
    process.env.AMAZON_PROXIES || process.env.AMAZON_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  );
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    proxyConfigured,
    maxRetries: Number(process.env.SCRAPE_MAX_RETRIES || 4),
  });
});

app.post("/api/scrape", async (req, res) => {
  const asinsRaw = req.body?.asins;
  const singleRaw = req.body?.asin;
  const domainRaw = (req.body?.domain || "amazon.com").toString().trim().toLowerCase();

  // Normalize input into a de-duplicated, uppercased list of ASINs.
  let requested: string[] = [];
  if (Array.isArray(asinsRaw)) {
    requested = asinsRaw.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  } else if (typeof asinsRaw === "string" && asinsRaw.trim()) {
    requested = asinsRaw.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  } else if (typeof singleRaw === "string" && singleRaw.trim()) {
    requested = [singleRaw.trim().toUpperCase()];
  }
  requested = Array.from(new Set(requested));

  if (requested.length === 0) {
    return res.status(400).json({
      error: "Missing ASIN",
      detail: "Provide at least one ASIN via 'asins' (array or comma/space separated string) or 'asin' (string).",
    });
  }
  if (requested.length > MAX_BATCH) {
    return res.status(400).json({
      error: "Too many ASINs",
      detail: `Maximum ${MAX_BATCH} ASINs per request (got ${requested.length}).`,
    });
  }

  const domain = ALLOWED_DOMAINS.includes(domainRaw) ? domainRaw : "amazon.com";
  const maxRetries = Number(process.env.SCRAPE_MAX_RETRIES || 4);

  // Valid ASINs go through the scrape pipeline; malformed ones become failed products.
  const valid: string[] = [];
  const products: ScrapeProduct[] = [];
  for (const a of requested) {
    if (/^[A-Z0-9]{10}$/.test(a)) valid.push(a);
    else products.push({ asin: a, scrape_status: "failed", error: "Invalid ASIN format" } as ScrapeProduct);
  }

  const isSingle = valid.length === 1 && products.length === 0;
  const concurrency = isSingle ? 1 : BATCH_CONCURRENCY;

  const scrapeOne = async (asin: string): Promise<ScrapeResult> => {
    const url = `https://${domain}/dp/${asin}`;
    try {
      const { html } = await fetchAmazonPage(url, domain, {
        isRobotCheckPage,
        timeoutMs: 30000,
        // In batch mode, cap per-item retries so total latency stays reasonable.
        maxRetries: isSingle ? maxRetries : Math.min(maxRetries, 2),
      });
      return scrapeAmazonHtml(html, { hostname: domain, asin });
    } catch (err: any) {
      const robot = err instanceof RobotCheckError;
      return {
        metadata: {
          scrape_timestamp: new Date().toISOString(),
          marketplace: domain,
          domain,
          language: "Unknown",
          total_asins: 1,
        },
        products: [
          {
            asin,
            scrape_status: "failed",
            error: robot
              ? "Amazon bot check triggered — configure a residential proxy via AMAZON_PROXIES and retry."
              : err?.message || String(err),
          },
        ],
      } as ScrapeResult;
    }
  };

  // Parallel scrape with bounded concurrency; each item resolves independently.
  const results = await mapWithConcurrency(valid, concurrency, scrapeOne);
  const scraped = results.map((r) => r.products[0]);
  const all = products.concat(scraped);

  const succeeded = all.filter((p) => p.scrape_status === "success").length;
  const failed = all.length - succeeded;
  const anyRobot = all.some((p) => p.scrape_status === "failed" && /bot check/i.test(p.error || ""));

  const firstMeta =
    results.find((r) => r.products[0]?.scrape_status === "success")?.metadata || results[0]?.metadata;
  const marketplace = firstMeta?.marketplace || domain;
  const language = firstMeta?.language || "Unknown";

  // Preserve the legacy 423 contract when a single ASIN gets bot-checked.
  if (isSingle && failed === 1 && anyRobot) {
    return res.status(423).json({
      error: "Amazon bot check triggered",
      robotCheck: true,
      detail:
        "Amazon served a CAPTCHA / robot-check page. Configure a residential proxy via AMAZON_PROXIES and retry.",
    });
  }

  return res.json({
    metadata: {
      scrape_timestamp: new Date().toISOString(),
      marketplace,
      domain,
      language,
      requested_asins: requested.length,
      succeeded,
      failed,
    },
    products: all,
  });
});

// --- Optional: serve the production build so the app runs as a single process ---
const distDir = path.resolve(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  const proxyConfigured = Boolean(
    process.env.AMAZON_PROXIES || process.env.AMAZON_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  );
  console.log(`
╔════════════════════════════════════════════╗
║   ◉ Amazon Scraper Web API started         ║
║   URL:  http://localhost:${PORT}              ║
║   POST /api/scrape { asin, domain }         ║
║   Proxy: ${proxyConfigured ? "ENABLED" : "disabled (direct)"}              ║
╚════════════════════════════════════════════╝
  `);
});
