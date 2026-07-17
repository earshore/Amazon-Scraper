/**
 * Amazon Product Insight — page scrape core (schema 1.3.0)
 *
 * Browser (extension inject): load marketplaces.js first, then core.js
 *   → globalThis.scrapeAmazonPage / AmazonProductInsightScraper
 * Node (tests): require("./core") after marketplaces resolve via relative require
 *
 * Status model:
 * - failed: hard errors (no title, or thrown exception)
 * - partial: quality warnings (missing bullets, etc.)
 * - success: title present, no quality warnings (notes alone OK)
 *
 * notes = informational (e.g. no visible reviews) — do NOT force partial
 * warnings = quality issues — force partial when title exists
 * errors = hard failures
 */
(function (root, factory) {
  function loadMarketplaces() {
    if (root.AmazonProductInsightMarketplaces) {
      return root.AmazonProductInsightMarketplaces;
    }
    if (typeof require === "function") {
      try {
        return require("./marketplaces.js");
      } catch (_e) {
        return require("./marketplaces");
      }
    }
    throw new Error(
      "AmazonProductInsightMarketplaces missing — inject scraper/marketplaces.js first"
    );
  }
  const mp = loadMarketplaces();
  const api = factory(mp);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.scrapeAmazonPage = api.scrapeAmazonPage;
  root.AmazonProductInsightScraper = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (mp) {
  const SCHEMA_VERSION = "1.3.0";
  const REVIEWS_SCOPE = "visible_dom_only";
  const MAX_REVIEWS = 20;
  const MAX_BULLETS = 10;

  function scrapeAmazonPage(doc, loc) {
    if (!doc) {
      throw new Error("document is required");
    }
    const locationLike = loc || { href: "", hostname: "" };

    try {
      return runScrape(doc, locationLike);
    } catch (e) {
      return buildFailedPayload(e, locationLike);
    }
  }

  function buildFailedPayload(err, locationLike) {
    const message = err && err.message ? err.message : String(err);
    return {
      metadata: {
        schema_version: SCHEMA_VERSION,
        scrape_timestamp: new Date().toISOString(),
        marketplace: "ERROR",
        domain: locationLike.hostname || "",
        language: "Unknown",
        total_asins: 0,
        reviews_scope: REVIEWS_SCOPE,
      },
      products: [
        {
          asin: "UNKNOWN",
          productTitle: "",
          price: "",
          brand: "",
          main_image: "",
          feature_bullets: [],
          customer_reviews: [],
          scrape_status: "failed",
          coverage: emptyCoverage(),
          errors: [message],
          warnings: [],
          notes: [],
        },
      ],
    };
  }

  function emptyCoverage() {
    return {
      has_title: false,
      has_asin: false,
      has_price: false,
      has_brand: false,
      has_main_image: false,
      bullet_count: 0,
      review_count: 0,
    };
  }

  function runScrape(doc, locationLike) {
    const config = {
      productTitle: [
        "#productTitle",
        "#title",
        'h1[data-automation-id="title"]',
        "span#productTitle",
        "#titleSection #title",
      ],
      // Prefer buybox / core price; avoid bare strikethrough list prices.
      price: [
        "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
        "span.a-price.apexPriceToPay .a-offscreen",
        "#apex_desktop .a-price:not(.a-text-price) .a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "#priceblock_saleprice",
        "#price_inside_buybox",
        "#tp_price_block_total_price_ww .a-offscreen",
        "#sns-base-price .a-offscreen",
        ".a-price.aok-align-center:not(.a-text-price) .a-offscreen",
      ],
      brand: [
        "#bylineInfo",
        "a#brand",
        "#brand",
        "tr.po-brand td.a-span9 span",
        "#productOverview_feature_div tr.po-brand span.po-break-word",
      ],
      mainImage: [
        "#landingImage",
        "#imgTagWrapperId img",
        "#main-image-container img",
        "#imageBlock img",
        "img#imgBlkFront",
      ],
      bulletPoints: [
        "#feature-bullets ul li .a-list-item",
        "#feature-bullets ul li",
        "#featurebullets_feature_div ul li .a-list-item",
        "#productFactsDesktop_feature_div ul li",
        "#productFactsDesktop_feature_div li",
        "#aboutThisItem_feature_div ul li .a-list-item",
        ".a-unordered-list.a-vertical.a-spacing-small li span.a-list-item",
        ".a-unordered-list.a-vertical li span.a-list-item",
      ],
      // Prefer official hooks / review list; bare .review last and scoped.
      reviewContainers: [
        '#cm_cr-review_list [data-hook="review"]',
        '#customer-reviews-content [data-hook="review"]',
        '[data-hook="review"]',
        '[data-hook="reviewContainer"]',
        "#cm_cr-review_list .review",
        "#customer-reviews-content .review",
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
    };

    const host = locationLike.hostname || "";
    const marketplace = mp.getMarketplaceCode(host);

    const now = new Date().toISOString();
    const langAttr =
      (doc.documentElement && doc.documentElement.getAttribute("lang")) ||
      (doc.documentElement && doc.documentElement.lang) ||
      "en";
    const langCode = String(langAttr).split("-")[0].toLowerCase();
    // ISO 639 language codes only (not marketplace codes).
    const fullLangMap = {
      de: "German",
      en: "English",
      fr: "French",
      it: "Italian",
      es: "Spanish",
      nl: "Dutch",
      pl: "Polish",
      sv: "Swedish",
      pt: "Portuguese",
      ja: "Japanese",
      zh: "Chinese",
      tr: "Turkish",
    };
    const language =
      fullLangMap[langCode] ||
      (langCode ? langCode.charAt(0).toUpperCase() + langCode.slice(1) : "Unknown");

    const BLACKLIST_REGEX = [
      /von 5 Sternen|out of 5 stars|étoiles sur 5/i,
      /Verifizierter Kauf|Verified Purchase/i,
      /Sponsored|Gesponsert/i,
    ];

    const getFirstValidText = (selectors, parent, useBlacklist) => {
      const rootEl = parent || doc;
      const bl = useBlacklist !== false;
      for (const sel of selectors) {
        let el;
        try {
          el = rootEl.querySelector(sel);
        } catch {
          continue;
        }
        if (!el) continue;
        if (el.closest && el.closest(".a-text-price") && !el.closest(".apexPriceToPay")) {
          // Strikethrough list price — skip unless it is the apex pay price.
          if (!/apexPriceToPay/i.test(sel)) continue;
        }
        const raw =
          (el.textContent && el.textContent.trim()) ||
          (el.innerText && el.innerText.trim()) ||
          "";
        if (!raw) continue;
        if (bl && BLACKLIST_REGEX.some((r) => r.test(raw))) continue;
        return raw.replace(/\s+/g, " ").trim();
      }
      return "";
    };

    const getFirstElement = (selectors, parent) => {
      const rootEl = parent || doc;
      for (const sel of selectors) {
        let el;
        try {
          el = rootEl.querySelector(sel);
        } catch {
          continue;
        }
        if (el && el.textContent && el.textContent.trim()) return el;
      }
      return null;
    };

    const cleanElementText = (source, selectorsToRemove) => {
      if (!source) return "";
      const temp = source.cloneNode(true);
      if (selectorsToRemove) {
        temp.querySelectorAll(selectorsToRemove).forEach((n) => n.remove());
      }
      return temp.textContent.replace(/\s+/g, " ").trim();
    };

    const extractOriginCountry = (dateText) => {
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

    const extractStars = (parent) => {
      const starSelectors = [
        '[data-hook="review-star-rating"]',
        '[data-hook="cmps-review-star-rating"]',
        '[data-hook*="star-rating"]',
        ".review-rating",
        "i.a-icon-star",
        ".a-icon-alt",
      ];
      let rawValue = "";
      for (const sel of starSelectors) {
        const el = parent.querySelector(sel);
        if (el) {
          rawValue =
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.innerText ||
            "";
          if (rawValue) break;
        }
      }
      if (!rawValue) return 0;
      const match = rawValue.match(/(\d([.,]\d)?)/);
      if (match) return parseFloat(match[0].replace(",", "."));
      return 0;
    };

    const pickLargestFromSrcset = (srcset) => {
      if (!srcset) return "";
      let bestUrl = "";
      let bestW = -1;
      const parts = String(srcset).split(",");
      for (const part of parts) {
        const bits = part.trim().split(/\s+/);
        if (!bits[0]) continue;
        const url = bits[0];
        let w = 0;
        if (bits[1] && /w$/i.test(bits[1])) {
          w = parseInt(bits[1], 10) || 0;
        } else if (bits[1] && /x$/i.test(bits[1])) {
          w = (parseFloat(bits[1]) || 1) * 1000;
        }
        if (w >= bestW && /^https:\/\//i.test(url)) {
          bestW = w;
          bestUrl = url;
        }
      }
      return bestUrl;
    };

    const pickLargestDynamicImage = (jsonStr) => {
      try {
        const map = JSON.parse(jsonStr);
        let bestUrl = "";
        let bestArea = -1;
        for (const [url, dims] of Object.entries(map)) {
          if (!/^https:\/\//i.test(url)) continue;
          let area = 0;
          if (Array.isArray(dims) && dims.length >= 2) {
            area = Number(dims[0]) * Number(dims[1]) || 0;
          }
          if (area >= bestArea) {
            bestArea = area;
            bestUrl = url;
          }
        }
        return bestUrl;
      } catch {
        return "";
      }
    };

    const extractMainImage = () => {
      for (const sel of config.mainImage) {
        let el;
        try {
          el = doc.querySelector(sel);
        } catch {
          continue;
        }
        if (!el) continue;

        const dynamic = el.getAttribute("data-a-dynamic-image");
        if (dynamic && dynamic.startsWith("{")) {
          const fromDyn = pickLargestDynamicImage(dynamic);
          if (fromDyn) return fromDyn;
        }

        const hires = el.getAttribute("data-old-hires");
        if (hires && /^https:\/\//i.test(hires)) return hires.split(" ")[0];

        const fromSrcset = pickLargestFromSrcset(el.getAttribute("srcset"));
        if (fromSrcset) return fromSrcset;

        const src =
          el.currentSrc || el.getAttribute("src") || "";
        if (src && src.startsWith("{")) {
          const fromJson = pickLargestDynamicImage(src);
          if (fromJson) return fromJson;
        }
        if (src && /^https:\/\//i.test(src)) return src.split(" ")[0];
      }
      return "";
    };

    const cleanBrand = (raw) => {
      if (!raw) return "";
      return raw
        .replace(
          /^(Brand|Visit the|Marke|Marque|Marca|Marka|Merk)\s*:?\s*/i,
          ""
        )
        .replace(/\s+Store\.?$/i, "")
        .replace(/^Besuche den\s+/i, "")
        .trim();
    };

    const isTrustedBulletSelector = (sel) =>
      sel.startsWith("#feature-bullets") ||
      sel.startsWith("#featurebullets_feature_div") ||
      sel.startsWith("#productFactsDesktop_feature_div") ||
      sel.startsWith("#aboutThisItem_feature_div");

    const productTitle = getFirstValidText(config.productTitle);
    const asinInput = doc.querySelector("#ASIN");
    const asinFromInput = asinInput && asinInput.value ? asinInput.value : "";
    const href = locationLike.href || "";
    const asinFromUrl = mp.extractAsinFromUrl(href) || "";
    const asin = mp.resolveAsin(asinFromInput, asinFromUrl);

    let price = getFirstValidText(config.price, doc, false);
    if (price) price = price.replace(/\s+/g, " ").trim();

    const brand = cleanBrand(getFirstValidText(config.brand, doc, false));
    const main_image = extractMainImage();

    let feature_bullets = [];
    let bulletsMatchedSelector = "";
    let bulletsRawCount = 0;
    let bulletsFilteredCount = 0;
    for (const sel of config.bulletPoints) {
      let nodes;
      try {
        nodes = doc.querySelectorAll(sel);
      } catch {
        continue;
      }
      if (!nodes || nodes.length === 0) continue;
      bulletsRawCount = nodes.length;
      const trusted = isTrustedBulletSelector(sel);
      const cleaned = Array.from(nodes)
        .filter((n) => {
          if (trusted) {
            const isDetails =
              n.closest("#prodDetails") ||
              n.closest("#productDetails_feature_div");
            const isSideBar =
              n.closest("#rightCol") || n.closest("#nav-flyout-ewc");
            const isCustomerReview = n.closest(
              "#cm_cr-review_list, #customer-reviews-content, [data-hook='review']"
            );
            return !isDetails && !isSideBar && !isCustomerReview;
          }
          const isInMainFeatureArea =
            n.closest("#feature-bullets") ||
            n.closest("#featurebullets_feature_div") ||
            n.closest("#productFactsDesktop_feature_div") ||
            n.closest("#aboutThisItem_feature_div") ||
            n.closest(".a-expander-content");

          const isDetails =
            n.closest("#prodDetails") ||
            n.closest("#productDetails_feature_div") ||
            n.closest(".product-facts-detail");

          const isSideBar =
            n.closest("#rightCol") || n.closest("#nav-flyout-ewc");

          const isCustomerReview = n.closest(
            "#cm_cr-review_list, #customer-reviews-content, [data-hook='review']"
          );

          return (
            isInMainFeatureArea && !isDetails && !isSideBar && !isCustomerReview
          );
        })
        .map((n) => n.textContent.replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 5);

      bulletsFilteredCount = cleaned.length;
      if (cleaned.length > 0) {
        feature_bullets = [...new Set(cleaned)].slice(0, MAX_BULLETS);
        bulletsMatchedSelector = sel;
        break;
      }
    }

    let reviewNodes = [];
    let reviewsMatchedSelector = "";
    for (const sel of config.reviewContainers) {
      let found;
      try {
        found = doc.querySelectorAll(sel);
      } catch {
        continue;
      }
      if (found && found.length > 0) {
        reviewNodes = Array.from(found).slice(0, MAX_REVIEWS);
        reviewsMatchedSelector = sel;
        break;
      }
    }

    const customer_reviews = reviewNodes
      .map((el) => {
        const titleEl = getFirstElement(config.reviewTitle, el);
        let cleanHeadline = "";
        if (titleEl) {
          cleanHeadline = cleanElementText(
            titleEl,
            '.a-icon-alt, .a-letter-space, .cr-translated-review-content, [data-hook*="star-rating"], i'
          );
        }

        const bodyContainer = getFirstElement(config.reviewBody, el);
        const globalStarRegex =
          /^\d(?:[.,]\d)?\s+(?:von\s+5\s+Sternen|out\s+of\s+5\s+stars|\S+\s+sur\s+5|su\s+5\s+stelle|de\s+5\s+estrellas|van\s+5\s+sterren|av\s+5\s+\S+|na\s+5\s+\S+)/i;
        cleanHeadline = cleanHeadline.replace(globalStarRegex, "").trim();
        if (
          /^\d(?:[.,]\d)?\s+(?:von|out|sur|su|de|van|av|na)/i.test(cleanHeadline)
        ) {
          cleanHeadline = "";
        }

        let cleanBody = "";
        if (bodyContainer) {
          const originalContent = bodyContainer.matches
            ? bodyContainer.matches(".cr-original-review-content")
              ? bodyContainer
              : bodyContainer.querySelector(".cr-original-review-content")
            : bodyContainer.querySelector(".cr-original-review-content");
          if (originalContent) {
            cleanBody = cleanElementText(originalContent);
          } else {
            const richContent =
              bodyContainer.matches &&
              bodyContainer.matches('[data-hook="reviewRichContentContainer"]')
                ? bodyContainer
                : bodyContainer.querySelector(
                    '[data-hook="reviewRichContentContainer"]'
                  );
            const bodySource = richContent || bodyContainer;
            const tempBody = bodySource.cloneNode(true);
            tempBody
              .querySelectorAll(
                'script, style, noscript, .a-hidden, .a-expander-header, .a-expander-prompt, .a-expander-partial-collapse-header, .a-cardui-expand-control-footer, [data-hook="reviewExpandButtonContainer"], [data-hook="translationSpinner"]'
              )
              .forEach((s) => s.remove());
            cleanBody = tempBody.textContent.trim();
          }
        }
        cleanBody = cleanBody.replace(/\n\s*\n/g, "\n").replace(/\s{2,}/g, " ");

        const dateEl = getFirstElement(
          ['[data-hook="review-date"]', '[data-hook="reviewDate"]'],
          el
        );
        const dateText = dateEl ? cleanElementText(dateEl) : "";
        const parsedOriginCountry = extractOriginCountry(dateText);

        // Drop empty shells — short bodies are discarded (no "No Content" placeholder)
        if (!cleanBody || cleanBody.length <= 5) {
          return null;
        }

        return {
          headline: cleanHeadline || "No Title",
          body: cleanBody,
          star_rating: extractStars(el),
          review_date: dateText,
          origin_country: parsedOriginCountry,
        };
      })
      .filter(Boolean);

    const coverage = {
      has_title: Boolean(productTitle),
      has_asin: asin !== "UNKNOWN",
      has_price: Boolean(price),
      has_brand: Boolean(brand),
      has_main_image: Boolean(main_image),
      bullet_count: feature_bullets.length,
      review_count: customer_reviews.length,
    };

    const errors = [];
    const warnings = [];
    const notes = [];

    if (!productTitle) {
      errors.push("未识别到商品标题（硬失败）");
    }
    if (asin === "UNKNOWN") {
      warnings.push("未识别到 ASIN");
    }
    if (!price) {
      notes.push("未识别到价格（页面可能无公开价或布局未覆盖）");
    }
    if (!brand) {
      notes.push("未识别到品牌");
    }
    if (!main_image) {
      notes.push("未识别到主图");
    }
    if (feature_bullets.length === 0) {
      warnings.push("未识别到任何描述点（可能漏抓或页面无卖点区）");
    } else if (feature_bullets.length < 3) {
      warnings.push(
        `描述点偏少（${feature_bullets.length} 条），可能存在漏抓`
      );
    }
    if (customer_reviews.length === 0) {
      notes.push(
        "当前页未识别到可见评论（仅抓取 DOM 可见部分，新品或折叠区常见）"
      );
    }

    let scrape_status = "success";
    if (errors.length > 0 || !productTitle) {
      scrape_status = "failed";
    } else if (warnings.length > 0) {
      scrape_status = "partial";
    } else {
      scrape_status = "success";
    }

    const debug = {
      bullets_selector: bulletsMatchedSelector || null,
      reviews_selector: reviewsMatchedSelector || null,
      bullets_raw_count: bulletsRawCount,
      bullets_filtered_count: bulletsFilteredCount,
      asin_from_input: asinFromInput || null,
      asin_from_url: asinFromUrl || null,
    };

    const productsList = [
      {
        asin: asin,
        productTitle: productTitle,
        price: price,
        brand: brand,
        main_image: main_image,
        feature_bullets: feature_bullets,
        customer_reviews: customer_reviews,
        scrape_status: scrape_status,
        coverage: coverage,
        errors: errors,
        warnings: warnings,
        notes: notes,
        _debug: debug,
      },
    ];

    return {
      metadata: {
        schema_version: SCHEMA_VERSION,
        scrape_timestamp: now,
        marketplace: marketplace,
        domain: host,
        language: language,
        total_asins: productsList.length,
        reviews_scope: REVIEWS_SCOPE,
      },
      products: productsList,
    };
  }

  return {
    scrapeAmazonPage: scrapeAmazonPage,
    SCHEMA_VERSION: SCHEMA_VERSION,
    REVIEWS_SCOPE: REVIEWS_SCOPE,
    MAX_REVIEWS: MAX_REVIEWS,
    buildFailedPayload: buildFailedPayload,
  };
});
