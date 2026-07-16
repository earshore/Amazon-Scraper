/**
 * server/scraper.ts
 *
 * Server-side port of the Chrome extension's `scrapeAmazonLogic` (originally in content.js).
 * Instead of running inside an Amazon page via chrome.scripting.executeScript, this version
 * parses the already-fetched HTML with cheerio, reusing the exact selector configuration,
 * feature-bullet filtering, and cross-European review / date / star parsing from the extension.
 *
 * Output structure is kept 100% compatible with the original extension so the web UI and the
 * JSON export behave identically.
 */

import * as cheerio from "cheerio";

export interface ScrapeReview {
  headline: string;
  body: string;
  star_rating: number;
  review_date: string;
  origin_country: string;
}

export interface ScrapeProduct {
  asin: string;
  productTitle: string;
  feature_bullets: string[];
  customer_reviews: ScrapeReview[];
  scrape_status: "success" | "failed";
  error?: string;
}

export interface ScrapeMetadata {
  scrape_timestamp: string;
  marketplace: string;
  domain: string;
  language: string;
  total_asins: number;
}

export interface ScrapeResult {
  metadata: ScrapeMetadata;
  products: ScrapeProduct[];
}

interface ScrapeOptions {
  hostname: string;
  /** ASIN if already known (from the URL the caller built). */
  asin?: string;
}

export function scrapeAmazonHtml(html: string, options: ScrapeOptions): ScrapeResult {
  const $ = cheerio.load(html);
  const { hostname } = options;

  try {
    // ============================================================
    // 1. Selector configuration — copied verbatim from the extension
    // ============================================================
    const config = {
      productTitle: [
        "#productTitle",
        "#title",
        'h1[data-automation-id="title"]',
        "span#productTitle",
        "#titleSection #title",
      ],
      bulletPoints: [
        "#feature-bullets ul li .a-list-item",
        "#productFactsDesktop_feature_div ul li",
        ".a-unordered-list.a-vertical.a-spacing-small li span.a-list-item",
        ".a-unordered-list.a-vertical li span.a-list-item",
        ".a-unordered-list.a-vertical li",
      ],
      reviewContainers: [
        '[data-hook="review"]',
        '[data-hook="reviewContainer"]',
        ".review",
        ".a-section.review",
        "#cm_cr-review_list .review",
        ".cr-widget-Reviews .review",
      ],
      reviewBody: [
        '[data-hook="reviewRichContentContainer"]',
        '[data-hook="reviewText"] [data-hook="reviewRichContentContainer"]',
        '[data-hook="reviewTextContainer"] [data-hook="reviewRichContentContainer"]',
        '[data-hook="review-body"] .cr-original-review-content',
        '[data-hook="review-body"]',
        '[data-hook="review-body"] span:not(.cr-original-review-content)',
        '[data-hook="reviewText"]',
        '[data-hook="reviewTextContainer"]',
        ".review-text-content span",
        ".review-text span",
        ".reviewText",
        'span[data-hook="review-body"]',
        ".a-size-base.review-text",
        ".cr-original-review-content",
      ],
      reviewTitle: [
        '[data-hook="reviewTitle"]',
        '[data-hook="review-title"] .cr-original-review-content',
        'a[data-hook="review-title"]',
        '[data-hook="review-title"]',
        ".review-title-content",
        ".review-title",
      ],
      reviewRating: [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        ".review-rating",
        "i.a-icon-star",
      ],
    };

    // ============================================================
    // 2. Marketplace identification (from extension)
    // ============================================================
    const marketplaceMap: Record<string, string> = {
      "amazon.de": "DE",
      "amazon.fr": "FR",
      "amazon.it": "IT",
      "amazon.es": "ES",
      "amazon.nl": "NL",
      "amazon.se": "SE",
      "amazon.pl": "PL",
      "amazon.com.be": "BE",
      "amazon.co.uk": "UK",
      "amazon.com": "US",
      "amazon.ie": "IE",
    };

    let marketplace = "OTHER";
    for (const [domain, code] of Object.entries(marketplaceMap)) {
      if (hostname.includes(domain)) {
        marketplace = code;
        break;
      }
    }

    // ============================================================
    // 3. Language + timestamp metadata (from extension)
    // ============================================================
    const now = new Date().toISOString();

    const langAttr = $("html").attr("lang") || "en";
    const langCode = langAttr.split("-")[0].toLowerCase();
    const fullLangMap: Record<string, string> = {
      de: "German", en: "English", fr: "French",
      it: "Italian", es: "Spanish", nl: "Dutch",
      pl: "Polish", sv: "Swedish", be: "French",
      ie: "English", tr: "Turkish", us: "English",
      pt: "Portuguese", ja: "Japanese", zh: "Chinese",
    };
    const language =
      fullLangMap[langCode] ||
      langCode.charAt(0).toUpperCase() + langCode.slice(1);

    // ============================================================
    // 4. Helpers (ported from extension)
    // ============================================================
    const BLACKLIST_REGEX = [
      /von 5 Sternen|out of 5 stars|étoiles sur 5/i,
      /Verifizierter Kauf|Verified Purchase/i,
      /Sponsored|Gesponsert/i,
    ];

    const parseEuropeanDate = (text: string): string => {
      if (!text) return "";
      const cleanStr = text
        .replace(/^.*?(on|am|le|il|el|op|den|dnia|w dniu)\s+/i, "")
        .trim();
      const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", mai: "05", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", dez: "12",
        dec: "12", januar: "01", februar: "02", märz: "03", april: "04", juni: "06",
        juli: "07", august: "08", september: "09", oktober: "10", november: "11",
        dezember: "12", janvier: "01", février: "02", mars: "03", juin: "06",
        juillet: "07", août: "08", octobre: "10", décembre: "12",
        gennaio: "01", febbraio: "02", marzo: "03", maggio: "05", giugno: "06",
        luglio: "07", agosto: "08", settembre: "09", dicembre: "12", enero: "01",
        febrero: "02", mayo: "05", junio: "06", julio: "07", septiembre: "09",
        octubre: "10", noviembre: "11", diciembre: "12", stycznia: "01", lutego: "02",
        marca: "03", kwietnia: "04", maja: "05", czerwca: "06", lipca: "07",
        sierpnia: "08", września: "09", października: "10", listopada: "11", grudnia: "12",
      };
      let foundMonth = "01";
      for (const [name, num] of Object.entries(months)) {
        if (cleanStr.toLowerCase().includes(name)) {
          foundMonth = num;
          break;
        }
      }
      const yearMatch = cleanStr.match(/\d{4}/);
      const dayMatch = cleanStr.match(/\b\d{1,2}\b/);
      return yearMatch && dayMatch
        ? `${yearMatch[0]}-${foundMonth}-${dayMatch[0].padStart(2, "0")}`
        : cleanStr;
    };

    const getFirstValidText = (
      selectors: string[],
      parent: any = $.root(),
      useBlacklist = true
    ): string => {
      for (const sel of selectors) {
        const el = parent.find(sel).first();
        if (el.length && el.text().trim()) {
          const txt = el.text().trim();
          if (useBlacklist && BLACKLIST_REGEX.some((r) => r.test(txt))) continue;
          return txt;
        }
      }
      return "";
    };

    const getFirstElement = (
      selectors: string[],
      parent: any = $.root()
    ): cheerio.Cheerio<any> | null => {
      for (const sel of selectors) {
        const el = parent.find(sel).first();
        if (el.length && el.text().trim()) return el;
      }
      return null;
    };

    const cleanElementText = (
      source: cheerio.Cheerio<any>,
      selectorsToRemove = ""
    ): string => {
      if (!source || !source.length) return "";
      const temp = source.clone();
      if (selectorsToRemove) {
        temp.find(selectorsToRemove).remove();
      }
      return temp.text().replace(/\s+/g, " ").trim();
    };

    const extractOriginCountry = (dateText: string): string => {
      const countryPatterns = [
        /Reviewed in (.+?) on /i,
        /Bewertet in (.+?) am /i,
        /Comment\S*\s+(?:en|au|aux)\s+(.+?)\s+le\s+/i,
        /Recensito in (.+?) il /i,
        /Revisado en (.+?) el /i,
        /Beoordeeld in (.+?) op /i,
        /Recenserad i (.+?) den /i,
        /Zrecenzowano w (.+?) (?:w dniu|dnia) /i,
      ];
      for (const pattern of countryPatterns) {
        const match = dateText.match(pattern);
        if (match) return match[1].replace(/\s+/g, " ").trim();
      }
      return "Global";
    };

    // ============================================================
    // 5. Extract basic info
    // ============================================================
    const productTitle = getFirstValidText(config.productTitle);
    const asin =
      options.asin ||
      $("#ASIN").attr("value") ||
      (hostname ? "" : "") || // placeholder; URL-derived asin passed via options
      "UNKNOWN";

    // ============================================================
    // 6. Feature bullets (with blacklist + region filtering)
    // ============================================================
    let feature_bullets: string[] = [];
    for (const sel of config.bulletPoints) {
      const nodes = $(sel);
      if (nodes.length > 0) {
        const cleaned = nodes
          .toArray()
          .filter((node) => {
            const n = $(node);
            const isInMainFeatureArea =
              n.closest("#feature-bullets").length > 0 ||
              n.closest("#featurebullets_feature_div").length > 0 ||
              n.closest("#productFactsDesktop_feature_div").length > 0 ||
              n.closest(".a-expander-content").length > 0;
            const isDetails =
              n.closest("#prodDetails").length > 0 ||
              n.closest("#productDetails_feature_div").length > 0 ||
              n.closest(".product-facts-detail").length > 0;
            const isSideBar =
              n.closest("#rightCol").length > 0 ||
              n.closest("#nav-flyout-ewc").length > 0;
            const isCustomerReview = n.closest(
              "#a-fixed-left-grid-col a-col-left"
            ).length > 0;
            return (
              isInMainFeatureArea && !isDetails && !isSideBar && !isCustomerReview
            );
          })
          .map((node) => $(node).text().replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 5);

        if (cleaned.length > 0) {
          feature_bullets = [...new Set(cleaned)].slice(0, 10);
          break;
        }
      }
    }

    // ============================================================
    // 7. Reviews
    // ============================================================
    let reviewNodes: any = $();
    for (const sel of config.reviewContainers) {
      const found = $(sel);
      if (found.length > 0) {
        reviewNodes = found;
        break;
      }
    }

    const extractStars = (parent: cheerio.Cheerio<any>): number => {
      const starSelectors = [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        ".review-rating",
        "i.a-icon-star",
        ".a-icon-alt",
      ];
      let rawValue = "";
      for (const sel of starSelectors) {
        const el = parent.find(sel).first();
        if (el.length) {
          rawValue =
            el.attr("aria-label") || el.attr("title") || el.text() || "";
          if (rawValue) break;
        }
      }
      if (!rawValue) return 0;
      const match = rawValue.match(/(\d([.,]\d)?)/);
      if (match) {
        const numStr = match[0].replace(",", ".");
        return parseFloat(numStr);
      }
      return 0;
    };

    const customer_reviews: ScrapeReview[] = reviewNodes
      .toArray()
      .map((node: any) => {
        const el = $(node);

        // Title
        const titleEl = getFirstElement(config.reviewTitle, el);
        let cleanHeadline = "";
        if (titleEl && titleEl.length) {
          cleanHeadline = cleanElementText(
            titleEl,
            ".a-icon-alt, .a-letter-space, .cr-translated-review-content, [data-hook*=\"star-rating\"], i"
          );
        }

        const bodyContainer = getFirstElement(config.reviewBody, el);

        const globalStarRegex =
          /^\d(?:[.,]\d)?\s+(?:von\s+5\s+Sternen|out\s+of\s+5\s+stars|\S+\s+sur\s+5|su\s+5\s+stelle|de\s+5\s+estrellas|van\s+5\s+sterren|av\s+5\s+\S+|na\s+5\s+\S+)/i;
        cleanHeadline = cleanHeadline.replace(globalStarRegex, "").trim();

        const isStillDirty = /^\d(?:[.,]\d)?\s+(?:von|out|sur|su|de|van|av|na)/i.test(
          cleanHeadline
        );
        if (isStillDirty) cleanHeadline = "";

        let cleanBody = "";
        if (bodyContainer && bodyContainer.length) {
          const originalContent =
            bodyContainer.is(".cr-original-review-content")
              ? bodyContainer
              : bodyContainer.find(".cr-original-review-content").first();
          if (originalContent.length) {
            cleanBody = cleanElementText(originalContent);
          } else {
            const richContent =
              bodyContainer.is('[data-hook="reviewRichContentContainer"]')
                ? bodyContainer
                : bodyContainer
                    .find('[data-hook="reviewRichContentContainer"]')
                    .first();
            const bodySource = richContent.length ? richContent : bodyContainer;
            const tempBody = bodySource.clone();
            tempBody
              .find(
                "script, style, noscript, .a-hidden, .a-expander-header, .a-expander-prompt, .a-expander-partial-collapse-header, .a-cardui-expand-control-footer, [data-hook=\"reviewExpandButtonContainer\"], [data-hook=\"translationSpinner\"]"
              )
              .remove();
            cleanBody = tempBody.text().trim();
          }
        }
        cleanBody = cleanBody
          .replace(/\n\s*\n/g, "\n")
          .replace(/\s{2,}/g, " ");

        // Date + country
        const dateEl = getFirstElement(
          ['[data-hook="review-date"]', '[data-hook="reviewDate"]'],
          el
        );
        const dateText = dateEl && dateEl.length ? cleanElementText(dateEl) : "";
        const countryMatch = dateText.match(
          /(?:in|aus|en|il|em|nel|su|von|från|z|u|en\sel)\s+(.+?)\s+(?:on|am|le|il|el|au|al|del|den|dnia|på|op|el)\s+\d/i
        );
        const parsedOriginCountry = extractOriginCountry(dateText);

        const starEl = el
          .find('[data-hook*="star-rating"]')
          .first()
          .length
          ? el.find('[data-hook*="star-rating"]').first()
          : el.find(".a-icon-star").first();
        const starVal =
          starEl.attr("aria-label") || starEl.text() || "0";
        const starMatch = starVal.match(/(\d([.,]\d)?)/);
        const star_rating = starMatch
          ? parseFloat(starMatch[0].replace(",", "."))
          : 0;

        return {
          headline: cleanHeadline || "No Title",
          body: cleanBody || "No Content",
          star_rating: star_rating || extractStars(el),
          review_date: dateText,
          origin_country:
            parsedOriginCountry !== "Global"
              ? parsedOriginCountry
              : countryMatch
              ? countryMatch[1].trim()
              : "Global",
        };
      })
      .filter((r: ScrapeReview) => r.body.length > 5);

    const productsList: ScrapeProduct[] = [
      {
        asin,
        productTitle,
        feature_bullets,
        customer_reviews,
        scrape_status: productTitle ? "success" : "failed",
      },
    ];

    return {
      metadata: {
        scrape_timestamp: now,
        marketplace,
        domain: hostname,
        language,
        total_asins: productsList.length,
      },
      products: productsList,
    };
  } catch (e: any) {
    return {
      metadata: {
        scrape_timestamp: new Date().toISOString(),
        marketplace: "ERROR",
        domain: hostname,
        language: "Unknown",
        total_asins: 0,
      },
      products: [
        { scrape_status: "failed", error: e?.message || String(e) },
      ] as any,
    };
  }
}

/**
 * Detect Amazon's bot / CAPTCHA challenge page so the API can return a helpful error
 * instead of silently returning empty data.
 */
export function isRobotCheckPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("robot check") ||
    lower.includes("enter the characters you see below") ||
    lower.includes("api-services-support@amazon.com") ||
    /type="?captcha"?/i.test(html)
  );
}
