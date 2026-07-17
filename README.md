# Amazon Product Insight

**Amazon Product Insight v1.6.2** · [最新 Release](https://github.com/earshore/Amazon-Scraper/releases/tag/v1.6.2) · 非 Amazon 官方产品

基于 Manifest V3 的 Chrome 扩展。打开亚马逊**商品详情页**后，一键在本地解析当前页面上的商品信息（标题、ASIN、价格、品牌、主图、卖点描述、页面可见评论等），并导出为 JSON，便于个人研究、文案整理或下游分析。

- **扩展名称**：Amazon Product Insight
- **当前版本**：`1.6.2`
- **导出 schema**：`1.3.0`（详见 [docs/SCHEMA.md](docs/SCHEMA.md)）
- **工具栏标题**：分析此商品
- **UI 语言**：中文

本工具仅在**本地浏览器**中解析当前标签页 DOM，不上传页面内容，也不是批量爬虫。隐私说明见 [PRIVACY.md](PRIVACY.md)。

---

## 架构

| 模块 | 职责 |
|------|------|
| [`scraper/marketplaces.js`](scraper/marketplaces.js) | 域名白名单、语言前缀、ASIN 解析（manifest / core / popup 共用） |
| [`scraper/core.js`](scraper/core.js) | 可注入的抓取引擎（`scrapeAmazonPage`）；扩展注入页面执行，也可在 Node 测试中 `require` |
| [`popup.js`](popup.js) / [`popup.html`](popup.html) | **仅 UI**：页面提示、注入核心脚本、预览、导出 JSON、缓存 |
| [`test/fixtures/`](test/fixtures) + `npm test` | jsdom 夹具 + marketplaces 单测，锁定状态语义与字段解析 |
| [`docs/QA-CHECKLIST.md`](docs/QA-CHECKLIST.md) | 手工发版 QA 清单 |
| [`scripts/verify.mjs`](scripts/verify.mjs) | 打包一致性校验（版本号、架构、host 三表一致等） |
| [`scripts/pack-extension.mjs`](scripts/pack-extension.mjs) | 白名单运行时 zip（`npm run pack`） |

抓取逻辑**不再**内联在 `popup.js` 中：弹窗通过 `chrome.scripting.executeScript` 以 `files: ["scraper/marketplaces.js", "scraper/core.js"]` 注入，再调用全局 `scrapeAmazonPage`。

---

## 功能

- **页面状态提示（page hint）**  
  - 非亚马逊页面 / 非商品详情页 / `chrome://`、`edge://`、`about:` 等受限页：禁用「分析此页面」并给出提示  
  - 商品详情页：显示「已就绪」及站点 hostname 与 ASIN
- **一键分析当前商品页**：注入 `scraper/core.js` 读取当前页 DOM
- **解析字段**：`productTitle`、`asin`、`price`、`brand`、`main_image`、`feature_bullets`、`customer_reviews`
- **抓取状态与覆盖率**  
  - `scrape_status`：`success` \| `partial` \| `failed`  
  - `coverage`：`has_title`、`has_asin`、`has_price`、`has_brand`、`has_main_image`、`bullet_count`、`review_count`  
  - `errors` / `warnings` / `notes`：三层诊断（见下节）
- **覆盖率 chips**：在预览区可视化各字段是否命中
- **notes vs warnings UI**：警告显示为「需要关注」，说明显示为「说明」
- **导出 JSON**
- **本地缓存**：`chrome.storage.local` 键 `lastScrapedData`，按 **ASIN + 域名** 恢复上次结果；预览展示缓存时间戳
- **清除本地缓存**：一键清空 `lastScrapedData`
- **语言不匹配提示**：当 `document.documentElement.lang` 不在该站点允许的语言前缀列表中时提示；可选择 **仍要分析**
- **评论范围元数据**：`metadata.reviews_scope` 固定为 `"visible_dom_only"`

---

## 状态模型（`errors` / `warnings` / `notes`）

| 数组 | 含义 | 状态影响 |
|------|------|----------|
| `errors[]` | 硬失败（如无标题） | → **`failed`** |
| `warnings[]` | 质量问题（如无卖点、卖点过少、ASIN 未知） | 有标题时 → **`partial`** |
| `notes[]` | 信息性说明（如无价格、无品牌、无主图、无可见评论） | **不**强制 `partial`；可与 **`success`** 并存 |

| `scrape_status` | 条件 |
|-----------------|------|
| `failed` | 无标题 / `errors` 非空 / 抓取抛错 |
| `partial` | 有标题，且 `warnings` 非空 |
| `success` | 有标题，且 `warnings` 为空（**`notes` 可非空**） |

完整字段与示例见 [docs/SCHEMA.md](docs/SCHEMA.md)。手工验收步骤见 [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md)。

---

## 安装

本扩展本身**无需构建**即可加载；若要跑自动化测试，需 Node ≥ 18 并安装 devDependencies。

### 推荐：从 GitHub Release 安装

1. 打开 [v1.6.2 Release](https://github.com/earshore/Amazon-Scraper/releases/tag/v1.6.2) 页面。
2. 下载 `amazon-product-insight-1.6.2.zip`。
3. 解压到本地任意目录。
4. 打开 Chrome，访问 `chrome://extensions/`。
5. 打开右上角 **开发者模式**。
6. 点击 **加载已解压的扩展程序**，选择解压后的文件夹（内含 `manifest.json`）。
7. 确认扩展列表中出现 **Amazon Product Insight**（版本 **1.6.2**）。

安装后可在工具栏固定扩展图标；悬停标题为 **分析此商品**。

### 开发：克隆仓库

完整仓库包含测试与开发依赖（`test/`、`package.json` 等）。加载扩展时只需指向含 `manifest.json` 的目录（通常为仓库根目录）。

1. 克隆本仓库到本地（仓库目录名可能为 `Amazon-Scraper` 或 `amazon-scraper`）。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择本仓库根目录（包含 `manifest.json` 的文件夹）。
6. 确认扩展列表中出现 **Amazon Product Insight**（版本 **1.6.2**）。

### 私有交付打包

官方 Release 中的 zip 已按下列规则构建，可直接从 [Release 页面](https://github.com/earshore/Amazon-Scraper/releases/tag/v1.6.2) 下载使用。

自行交付给他人时，请打 **运行时 zip**，不要整仓含 `node_modules`：

**必须包含：**

- `manifest.json`
- `popup.html` / `popup.js`
- `scraper/marketplaces.js` / `scraper/core.js`
- `icons/icon16.png` / `icon48.png` / `icon128.png`

**建议附带：** `README.md`、`PRIVACY.md`、`LICENSE`、`docs/SCHEMA.md`、`docs/QA-CHECKLIST.md`、`CHANGELOG.md`

**不要放入 zip：** `node_modules/`、`.git/`、`web/`（含其 `node_modules`/`dist`/`src`/`server`，**非扩展组成部分**）、`test/`、其他开发工具

推荐一键打包（白名单）：

```bash
npm run pack
# → dist/amazon-product-insight-1.6.2.zip
```

接收方：解压 → Chrome `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** → 选中解压目录。

发版前建议执行：`npm run check`，并按 [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md) 做 US/UK/DE 真页冒烟。

---

## 使用方法

1. 在 Chrome 中打开支持的亚马逊**商品详情页**（URL 通常包含 `/dp/ASIN` 或 `/gp/product/ASIN`）。
2. 点击工具栏中的扩展图标，打开弹窗。
3. 查看顶部页面提示：商品页应显示「已就绪」及 ASIN；否则请先切换到正确页面。
4. 点击 **分析此页面**。
5. 解析完成后查看状态、覆盖率 chips、警告（需要关注）/ 说明（notes）、主图/价格/品牌摘要、卖点与评论预览。
6. 按需：
   - **导出 JSON**：下载结果文件
   - **清除本地缓存**：删除上次缓存结果

### 缓存恢复

若当前标签页 URL 中的 ASIN 与域名，与本地缓存的上次结果一致，打开弹窗时会自动恢复上次结果，并显示缓存时间戳。需要最新数据时，再次点击 **分析此页面** 即可重新抓取。

### 语言不匹配提示

扩展根据当前 hostname 检查 `document.documentElement.lang` 是否属于该站点允许的语言前缀。例如：`amazon.de` 允许 `de` 与 `en`，因此德语站使用英文界面**不会**触发警告；`amazon.com` 仅允许 `en`。不在允许列表中时会给出提示；可点击 **仍要分析** 继续，也可先切换到允许的语言再抓取，以降低选择器失效风险。

---

## 支持的站点（Marketplace）

扩展在 `manifest.json` 中声明了以下 host 权限，并会在导出元数据中写入对应 marketplace 代码：

| 域名 | marketplace 代码 |
|------|------------------|
| `*.amazon.com` | `US` |
| `*.amazon.co.uk` | `UK` |
| `*.amazon.de` | `DE` |
| `*.amazon.fr` | `FR` |
| `*.amazon.it` | `IT` |
| `*.amazon.es` | `ES` |
| `*.amazon.nl` | `NL` |
| `*.amazon.se` | `SE` |
| `*.amazon.pl` | `PL` |
| `*.amazon.com.be` | `BE` |
| `*.amazon.ie` | `IE` |

未命中以上规则的亚马逊子域可能标记为 `OTHER`；异常时可能为 `ERROR`。

---

## 导出格式

仅支持 **JSON**（无 Markdown 导出）。

导出文件名大致为：

```text
Amz_{marketplace}_{ASIN}_{scrape_timestamp}.json
```

其中时间戳来自 `metadata.scrape_timestamp`（会将 `:`、`.` 替换为 `-` 并截取前 19 位）。

完整结构见 [docs/SCHEMA.md](docs/SCHEMA.md)。顶层包含：

- `metadata`：schema 版本、抓取时间、站点、域名、语言、商品数量、`reviews_scope`
- `products[]`：ASIN、标题、价格、品牌、主图、卖点、评论、状态、覆盖率、`errors` / `warnings` / `notes` 等

---

## 已知限制

1. **仅抓取当前页可见 DOM 中的评论**  
   不会翻页、不会请求全部评论 API。`metadata.reviews_scope` 恒为 `visible_dom_only`。无可见评论时记入 **`notes`**，不单独强制 `partial`。

2. **依赖亚马逊页面 DOM 结构**  
   改版或 A/B 测试可能导致选择器失效，出现字段漏抓；描述点相关问题会进入 **`warnings`** 并可能为 `partial`，无标题则为 `failed`。

3. **多语言站点可能产生语言不匹配警告**  
   当 `document.documentElement.lang` 不在该 host 允许的语言前缀列表中时会提示（例如 `amazon.com` 仅允许 `en`；`amazon.de` 允许 `de` 与 `en`）。界面语言不在允许范围时，部分节点文案与结构可能不同，影响解析成功率。

4. **仅限本地、当前标签页解析**  
   你必须先手动打开商品详情页；扩展通过 `activeTab` + `scripting` 注入逻辑读取当前页，不提供后台批量抓取、调度或代理池。

5. **不是批量自动化爬虫**  
   不适用于大规模、无人值守的全站采集。请仅用于个人研究与辅助整理，并遵守适用法律法规与亚马逊服务条款。

6. **部分字段可能因页面布局而缺失**  
   例如无标价、品牌区域隐藏、主图懒加载失败、卖点过少、当前视口无评论等。其中价格/品牌/主图/可见评论缺失记入 **`notes`**；卖点缺失或过少、ASIN 未知记入 **`warnings`**。

7. **当前不导出**  
   BSR、完整类目路径、评分均值/总评论数（官方统计）、变体完整矩阵、分页后的全部评论、优惠券明细等。

---

## 项目结构

仓库目录名可能为 `amazon-scraper` 或 `Amazon-Scraper`。

```text
amazon-scraper/
├── manifest.json           # Manifest V3（名称、权限、图标、弹窗、工具栏标题）
├── popup.html              # 弹窗 UI（中文）
├── popup.js                # UI 逻辑：页面提示、注入、预览、导出 JSON、缓存
├── scraper/
│   ├── marketplaces.js     # 域名 / 语言 / ASIN 单一数据源
│   └── core.js             # 抓取引擎（schema 1.3.0，可注入 + Node 测试）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test/
│   ├── fixtures/           # HTML 夹具
│   ├── scraper.test.mjs
│   └── marketplaces.test.mjs
├── scripts/
│   ├── verify.mjs          # 版本与架构一致性校验
│   └── pack-extension.mjs  # 白名单运行时 zip
├── docs/
│   ├── SCHEMA.md           # 导出 JSON 字段说明（schema 1.3.0）
│   └── QA-CHECKLIST.md     # 发版手工 QA 清单
├── docs/ci/      # CI：npm run check
├── package.json            # npm scripts：test / verify / pack / check
├── package-lock.json
├── PRIVACY.md
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── .gitignore
```

**没有**独立的 `content.js` 常驻内容脚本；解析通过注入 `scraper/marketplaces.js` + `scraper/core.js` 完成。

> **`web/` 目录：** 若本地存在，属于**历史实验残留（非产品）**，源码不完整、与「仅本地解析」定位冲突。**不要**打入扩展 zip，也**不要**当作官方 companion。请忽略或删除本地副本。

### 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 在用户点击扩展后访问当前活动标签页 |
| `scripting` | 向当前页注入 `scraper/marketplaces.js` 与 `scraper/core.js` 并执行解析 |
| `storage` | 本地缓存最近一次**成功/部分成功**抓取结果（`lastScrapedData`） |
| host_permissions | 上述亚马逊站点（含 `*.domain` 与 apex 裸域）下的页面访问范围 |

---

## 开发与测试

### 扩展热重载

- 修改 `popup.js` / `popup.html` / `manifest.json` / `scraper/core.js` 后，到 `chrome://extensions/` 点击该扩展的 **重新加载**，再刷新商品页并打开弹窗验证。
- 调试建议：在商品详情页打开 DevTools；扩展弹窗可右键检查元素查看控制台错误。

### 自动化测试（jsdom）

```bash
npm install
npm test                 # node --test test/scraper.test.mjs
npm run verify           # 文件/版本/架构一致性
npm run check            # 语法检查 + test + verify
```

夹具覆盖 success / notes-only / partial / failed（见 `test/fixtures`）。

### 文档约定

- 变更导出结构时，请同步更新 `scraper/core.js` 中的 `SCHEMA_VERSION`、[docs/SCHEMA.md](docs/SCHEMA.md)，并在 [CHANGELOG.md](CHANGELOG.md) 记录。
- 发版前按 [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md) 走手工验收。
- 保持改动精简：优先修选择器与状态语义，避免引入未使用的打包工具链。

---

## 隐私、许可与变更

| 文档 | 说明 |
|------|------|
| [PRIVACY.md](PRIVACY.md) | 隐私政策：仅本地处理，不上传页面内容 |
| [LICENSE](LICENSE) | MIT 许可证 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [docs/SCHEMA.md](docs/SCHEMA.md) | 导出 JSON schema `1.3.0` 字段说明 |
| [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md) | 发版 QA 清单（目标版本 1.6.2） |

---

## 免责声明

本扩展是**本地页面解析辅助工具**，用于帮助你整理当前已打开的亚马逊商品页可见信息，方便个人研究、学习或内容整理。

- 请遵守 [Amazon 服务条款](https://www.amazon.com/gp/help/customer/display.html) 及你所在司法辖区的相关法律。
- 请勿将本工具用于违反服务条款的大规模自动化抓取、商业滥用或干扰网站正常运行的行为。
- 亚马逊页面内容与商标归其各自权利人所有；本项目不提供任何官方关联或背书。
- 导出数据可能因页面结构变化而不完整或不准确，使用前请人工核对。

---

## 反馈与贡献

欢迎通过 **GitHub Issues** 反馈问题或提交 PR：优先报告选择器失效的站点/语言组合、复现 URL 与期望字段。请勿通过 Issues 提交账号凭证或敏感个人信息。
