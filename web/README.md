# Amazon Product Insight — 免安装 Agent Web 应用

将原有的 Chrome 插件（Amazon Scraper）改造为**免安装**的 Web 应用：用户输入 ASIN，自动抓取对应
Amazon 商品数据（标题、五点描述、用户评论），展示结果并一键导出 JSON。

基于 **codebuddy-chat-web** skill 的技术栈（React + Vite + Express + Tailwind）构建，
并把原插件的核心抓取逻辑（`content.js` 中的 `scrapeAmazonLogic`）适配到服务端（cheerio）运行。

---

## 快速开始

```bash
cd web
npm install            # 若报 ERESOLVE 冲突（vite 8 / plugin-react peer 告警），改用：npm install --legacy-peer-deps
npm run dev        # 同时启动 API(:3000) 与前端(:5173)
# 打开 http://localhost:5173
```

或构建为单进程生产模式：

```bash
npm run build      # 类型检查 + 打包前端到 dist/
npm run server     # Express 同时托管 dist/ 与 /api（访问 http://localhost:3000）
```

> 无需安装任何浏览器插件或扩展，打开网页即可使用。

---

## 使用流程

1. 在输入框粘贴一个或多个 **ASIN**（10 位字母+数字，例如 `B0C1234567`）。支持多行、逗号或空格分隔，单次最多 50 个，并行抓取。
2. 选择目标站点（Amazon.com / .co.uk / .de / .fr … 共 11 个欧洲+美国站点）
3. 点击 **抓取** → 服务端拉取商品页并解析
4. 结果区展示：商品标题、ASIN/站点/语言徽章、五点描述、用户评论（星级+国家+日期）
5. 点击 **导出 JSON** 下载结构化数据

支持 **亮/暗主题**切换（右上角按钮，偏好持久化到 localStorage）。

---

## 架构

```
web/
├── server/
│   ├── index.ts        # Express：/api/health、POST /api/scrape
│   ├── scraper.ts       # 由 content.js 的 scrapeAmazonLogic 适配而来的 cheerio 解析器
│   └── proxyFetch.ts    # 硬化抓取层：住宅代理轮换 + UA/客户端提示一致性 + 区域化头 + 重试
├── src/
│   ├── ScraperPage.tsx  # 主界面：输入 → 抓取 → 展示 → 导出
│   ├── App.tsx          # 应用壳 + 主题
│   ├── hooks/useTheme.ts
│   ├── config.ts
│   └── index.css        # 轻量自定义样式（CSS 变量驱动明暗主题，Amazon 风格配色）
├── package.json
├── vite.config.ts       # /api 代理到 :3000
└── tsconfig*.json
```

### 核心抓取逻辑如何被复用

原插件在浏览器中通过 `chrome.scripting.executeScript` 把 `scrapeAmazonLogic` 注入到 Amazon
页面，依赖 `document` / `window`。Web 环境下无法注入，因此：

- **选择器配置**（标题、五点、评论容器/标题/正文/星级）**原样保留**
- **五点描述过滤**（主内容区判定、排除详情/侧边栏/评分分布）**原样保留**
- **跨欧洲站点日期解析引擎**（德/法/意/西/荷/波/瑞典等多语言月份映射）**原样保留**
- **星级解析**（兼容 `4,8` 与 `4.8` 欧洲数字格式）、**评论来源国家提取**逻辑**原样保留**
- DOM API（`querySelector`/`closest`/`clone`/`textContent`）映射为 cheerio 等价调用

输出 JSON 结构与原插件完全一致（`metadata` + `products[]`），因此前端的展示与导出逻辑可直接复用。

### API

`POST /api/scrape`

支持**单次**与**批量**抓取：

- 单 ASIN：`{ "asin": "B0C1234567", "domain": "amazon.com" }`
- 多 ASIN：`{ "asins": ["B0C1234567", "B0D9876543"], "domain": "amazon.com" }`
  （`asins` 也接受逗号/空格分隔的字符串；后端会去重、校验、并行抓取，并发上限见 `SCRAPE_CONCURRENCY`）

响应（批量与单批一致）：

```json
{
  "metadata": {
    "scrape_timestamp": "…",
    "marketplace": "Amazon.com",
    "domain": "amazon.com",
    "language": "en",
    "requested_asins": 3,
    "succeeded": 2,
    "failed": 1
  },
  "products": [
    { "asin": "B0C1234567", "productTitle": "…", "feature_bullets": [], "customer_reviews": [], "scrape_status": "success" },
    { "asin": "B0XXXXXXXY", "scrape_status": "failed", "error": "Amazon bot check triggered …" }
  ]
}
```

每个 ASIN 独立成功/失败；失败的条目以 `scrape_status: "failed"` 出现在 `products` 中，不影响其它条目。

状态码：
- `200` → 返回聚合结果（可能部分失败，详见 `products[].scrape_status`）
- `400` → 缺少 ASIN / 超过 `SCRAPE_MAX_BATCH` 上限 / ASIN 格式非法（整体）
- `423` → 单个 ASIN 被人机验证拦截（仅当请求恰好一个 ASIN 且被拦截时，保留旧契约）
- `502` → 抓取抛出异常

### 新增环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SCRAPE_MAX_BATCH` | `50` | 单次请求允许的最大 ASIN 数量 |
| `SCRAPE_CONCURRENCY` | `5` | 批量抓取时的并行度（单 ASIN 强制为 1） |
| `SCRAPE_MAX_RETRIES` | `4` | 单 ASIN 重试次数（批量模式下每项上限取 `min(该值, 2)` 以控制总时延） |

---

## 绕开 Amazon 反爬：代理 + 真实浏览器头轮换（最小化改动方案）

纯服务端 `fetch` 之所以被封，是因为它既无登录 Cookie、也无真实浏览器指纹。本应用采用
**最小化改动**路线：保留 cheerio 解析层不动，只升级"抓取引擎"（`server/proxyFetch.ts`）：

- **住宅代理轮换**：通过 `AMAZON_PROXIES`（逗号分隔）或单个 `AMAZON_PROXY` 配置住宅代理，
  每次重试自动轮换 IP；也兼容标准 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量（优先级：
  `AMAZON_PROXIES` > `AMAZON_PROXY` > `HTTPS_PROXY` / `HTTP_PROXY`）。底层用 `undici` 的
  `ProxyAgent` 作为 per-request `dispatcher` 路由。
- **浏览器指纹一致性**：内置 5 组真实 Chrome UA，且每组都携带**与之匹配的 `Sec-CH-UA` 客户端提示**
  （UA 与客户端提示不一致是最典型的机器人特征），每次请求随机切换。
- **区域化请求头**：`Accept-Language` 按目标站点自动匹配（如 `amazon.de` → `de-DE`），
  避免语言与域名矛盾的 bot 信号。
- **失败自动重试**：命中 CAPTCHA / 软错误（5xx、限流）时，以抖动退避（1.2–3s）重试，最多
  `SCRAPE_MAX_RETRIES`（默认 4）次，每次换 UA + 代理。

> 这是"最小化改动"方案：不引入 Playwright / 无头浏览器。它能显著降低机器人信号，
> 但**不能保证 100% 绕过** Amazon 检测——效果取决于代理质量（务必用住宅/移动代理，
> 而非数据中心 IP）。若仍返回 `423`，优先更换更高质量代理，或升级为 Playwright + 真实
> 登录 Cookie 方案（见下）。

### 配置示例

```bash
# .env（参考 .env.example）
AMAZON_PROXIES=http://user:pass@resi-proxy-1:port,http://user:pass@resi-proxy-2:port
SCRAPE_MAX_RETRIES=4
PORT=3000
```

启动前 `cp .env.example .env` 并填入你的住宅代理。

---

## ⚠️ 重要限制：Amazon 反爬

服务端直接请求 Amazon 商品页**经常被反爬机制拦截**（返回 CAPTCHA / robot-check，或限流）。
这是浏览器插件（在已登录的真实浏览器中运行）与无头服务端请求的本质差异。

- 若返回 `423`，说明被 Amazon 拦截；按上文配置住宅代理后重试。解析逻辑本身已通过合成
  HTML fixture 验证（标题/五点/评论/星级/国家均正确提取），问题与抓取代码无关。
- **更彻底的方案**（如需更高成功率）：用 Playwright 无头浏览器 + 反指纹插件 + 住宅代理，
  并复用从真实 Amazon 账号导出的登录 Cookie。这属于"进阶方案"，按需再扩展。

---

## 技术栈

React 18 · Vite 5 · TypeScript · Tailwind CSS · Express 4 · cheerio · lucide-react（基于
codebuddy-chat-web skill 脚手架，移除了聊天/CodeBuddy Agent SDK/SQLite 层，改为聚焦抓取流程）。
