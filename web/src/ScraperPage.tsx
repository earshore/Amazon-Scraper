import { useState, useCallback } from "react";
import {
  Search,
  Download,
  Sun,
  Moon,
  Loader2,
  TriangleAlert,
  CheckCircle2,
  Package,
} from "lucide-react";

interface Review {
  headline: string;
  body: string;
  star_rating: number;
  review_date: string;
  origin_country: string;
}

interface Product {
  asin: string;
  productTitle: string;
  feature_bullets: string[];
  customer_reviews: Review[];
  scrape_status: "success" | "failed";
  error?: string;
}

interface ScrapeData {
  metadata: {
    scrape_timestamp: string;
    marketplace: string;
    domain: string;
    language: string;
    requested_asins?: number;
    succeeded?: number;
    failed?: number;
  };
  products: Product[];
}

const MARKETPLACES = [
  { value: "amazon.com", label: "Amazon.com (US)" },
  { value: "amazon.co.uk", label: "Amazon.co.uk (UK)" },
  { value: "amazon.de", label: "Amazon.de (DE)" },
  { value: "amazon.fr", label: "Amazon.fr (FR)" },
  { value: "amazon.it", label: "Amazon.it (IT)" },
  { value: "amazon.es", label: "Amazon.es (ES)" },
  { value: "amazon.nl", label: "Amazon.nl (NL)" },
  { value: "amazon.se", label: "Amazon.se (SE)" },
  { value: "amazon.pl", label: "Amazon.pl (PL)" },
  { value: "amazon.com.be", label: "Amazon.com.be (BE)" },
  { value: "amazon.ie", label: "Amazon.ie (IE)" },
];

const MAX_ASINS = 50;
const ASIN_RE = /^[A-Z0-9]{10}$/;

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="stars" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) =>
        i < full ? (
          <span key={i} className="star filled">
            ★
          </span>
        ) : (
          <span key={i} className="star">
            ☆
          </span>
        )
      )}
      <span className="star-num">{rating.toFixed(1)}</span>
    </span>
  );
}

function ProductCard({ p, meta }: { p: Product; meta: ScrapeData["metadata"] }) {
  if (p.scrape_status === "failed") {
    return (
      <section className="card results">
        <div className="product-meta" style={{ marginBottom: 10 }}>
          <span className="badge">ASIN: {p.asin}</span>
        </div>
        <div className="banner banner-error">
          <TriangleAlert size={18} />
          <span>{p.error || "未能识别商品信息。"}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="card results">
      <div className="results-head">
        <div>
          <h2 className="product-title">{p.productTitle}</h2>
          <div className="product-meta">
            <span className="badge">ASIN: {p.asin}</span>
            <span className="badge">
              {meta.marketplace} · {meta.domain}
            </span>
            <span className="badge">{meta.language}</span>
          </div>
        </div>
      </div>

      {p.feature_bullets.length > 0 && (
        <>
          <div className="section-title">About this item</div>
          <ul className="bullet-list">
            {p.feature_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}

      <div className="section-title">Reviews ({p.customer_reviews.length})</div>
      {p.customer_reviews.length > 0 ? (
        p.customer_reviews.map((r, i) => (
          <div className="review-card" key={i}>
            <div className="review-header">
              <Stars rating={r.star_rating} />
              <span className="review-headline">
                {r.headline !== "No Title" ? r.headline : ""}
              </span>
            </div>
            <div className="review-sub">
              <span>{r.review_date}</span>
              {r.origin_country && r.origin_country !== "Global" && (
                <span>· {r.origin_country}</span>
              )}
            </div>
            <div className="review-body">{r.body}</div>
          </div>
        ))
      ) : (
        <p className="empty-note">未抓取到评论。</p>
      )}
    </section>
  );
}

export default function ScraperPage({
  theme,
  onToggleTheme,
}: {
  theme: string;
  onToggleTheme: () => void;
}) {
  const [asinInput, setAsinInput] = useState("");
  const [domain, setDomain] = useState("amazon.com");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScrapeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [robotCheck, setRobotCheck] = useState(false);

  const handleScrape = useCallback(async () => {
    const list = asinInput
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const unique = Array.from(new Set(list));

    if (unique.length === 0) {
      setError("请输入至少一个 ASIN（10 位字母与数字组合，例如 B0C1234567）。");
      return;
    }
    if (unique.length > MAX_ASINS) {
      setError(`单次最多抓取 ${MAX_ASINS} 个 ASIN（当前 ${unique.length} 个）。`);
      return;
    }

    setLoading(true);
    setError(null);
    setRobotCheck(false);
    setData(null);

    try {
      const resp = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asins: unique, domain }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        if (json?.robotCheck) {
          setRobotCheck(true);
          setError(json.detail || "Amazon 触发了人机验证，抓取被拦截。");
        } else {
          setError(json?.detail || json?.error || `请求失败 (HTTP ${resp.status})`);
        }
        return;
      }

      setData(json as ScrapeData);
    } catch (e: any) {
      setError(e?.message || "网络错误，无法连接到抓取服务。");
    } finally {
      setLoading(false);
    }
  }, [asinInput, domain]);

  const handleExport = useCallback(() => {
    if (!data) return;
    let timestampStr = String(Date.now());
    if (data.metadata?.scrape_timestamp) {
      timestampStr = data.metadata.scrape_timestamp.replace(/[:.]/g, "-").slice(0, 19);
    }
    const marketplace = data.metadata?.domain || "Unknown";
    const fileName = `Amz_${marketplace}_${data.products.length}asin_${timestampStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [data]);

  const anyRobot =
    robotCheck ||
    (data?.products.some(
      (p) => p.scrape_status === "failed" && /bot check/i.test(p.error || "")
    ) ?? false);

  const succeeded = data?.metadata?.succeeded ?? 0;
  const failed = data?.metadata?.failed ?? 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">
            <Package size={20} />
          </div>
          <div>
            <div className="brand-title">Amazon Product Insight</div>
            <div className="brand-sub">免安装 · Agent Web 抓取工具</div>
          </div>
        </div>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="切换主题"
          title="切换明暗主题"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="container">
        <section className="card hero">
          <h1 className="hero-title">输入 ASIN，一键抓取商品数据</h1>
          <p className="hero-desc">
            粘贴一个或多个 Amazon 商品 ASIN（每行一个，或用逗号 / 空格分隔），并行抓取标题、五点描述与用户评论，并支持导出为 JSON。
          </p>

          <div className="scrape-row">
            <textarea
              className="asin-textarea"
              placeholder={"例如：\nB0C1234567\nB0D9876543\nB08ABC1234"}
              value={asinInput}
              maxLength={600}
              onChange={(e) => setAsinInput(e.target.value)}
              spellCheck={false}
              autoCapitalize="characters"
            />
          </div>

          <div className="scrape-row">
            <select
              className="domain-select"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              aria-label="选择站点"
            >
              {MARKETPLACES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleScrape} disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
              {loading ? "并行抓取中…" : "抓取"}
            </button>
          </div>

          <div className="asin-hint">
            支持多 ASIN 并行抓取，单次最多 {MAX_ASINS} 个；同一站点统一抓取。
          </div>

          {(error || robotCheck) && (
            <div className={`banner ${robotCheck ? "banner-warn" : "banner-error"}`}>
              <TriangleAlert size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="loading-row">
              <span className="spinner" />
              <span>正在并行抓取商品与评论…</span>
            </div>
          )}
        </section>

        {data && (
          <section className="card results">
            <div className="batch-summary">
              <div className="batch-count">
                共 <b>{data.products.length}</b> 个 ·{" "}
                <span className="count-ok">成功 {succeeded}</span> ·{" "}
                <span className="count-bad">失败 {failed}</span>
              </div>
              <button className="btn-primary export" onClick={handleExport}>
                <Download size={18} />
                导出 JSON
              </button>
            </div>

            <div className="results-list">
              {data.products.map((p, i) => (
                <ProductCard key={`${p.asin}-${i}`} p={p} meta={data.metadata} />
              ))}
            </div>
          </section>
        )}

        {anyRobot && data && failed === data.products.length && (
          <div className="banner banner-warn">
            <TriangleAlert size={18} />
            <span>
              全部请求被 Amazon 拦截（人机验证）。请配置住宅代理（AMAZON_PROXIES）后重试，或降低单次抓取数量。
            </span>
          </div>
        )}
      </main>

      <footer className="footer">
        <CheckCircle2 size={14} />
        <span>
          基于原 Chrome 插件的核心抓取逻辑（cheerio 服务端适配）· 数据仅在你本地浏览器中导出
        </span>
      </footer>
    </div>
  );
}
