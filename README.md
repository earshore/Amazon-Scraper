# Amazon Product Insight

基于 Manifest V3 的 Chrome 扩展。打开亚马逊**商品详情页**后，一键在本地解析当前页面上的商品信息（标题、ASIN、价格、品牌、主图、卖点描述、页面可见评论等），并导出或复制为 JSON，便于个人研究、文案整理或下游分析。

- **扩展名称**：Amazon Product Insight
- **当前版本**：`1.5.0`
- **导出 schema**：`1.2.0`（详见 [docs/SCHEMA.md](docs/SCHEMA.md)）
- **工具栏标题**：Analyze this product

本工具仅在**本地浏览器**中解析当前标签页 DOM，不上传页面内容，也不是批量爬虫。隐私说明见 [PRIVACY.md](PRIVACY.md)。

---

## 功能

- **页面状态提示（page hint）**  
  - 非亚马逊页面 / 非商品详情页 / `chrome://`、`edge://`、`about:` 等受限页：禁用「分析此页面」并给出提示  
  - 商品详情页：显示「已就绪」及站点 hostname 与 ASIN
- **一键分析当前商品页**：注入脚本读取当前页 DOM
- **解析字段**：`productTitle`、`asin`、`price`、`brand`、`main_image`、`feature_bullets`、`customer_reviews`
- **抓取状态与覆盖率**  
  - `scrape_status`：`success` | `partial` | `failed`  
  - `coverage`：`has_title`、`has_asin`、`has_price`、`has_brand`、`has_main_image`、`bullet_count`、`review_count`  
  - `warnings`：中文人类可读警告列表
- **导出 JSON**：下载完整结构化结果
- **复制 JSON**：将同一结果写入剪贴板
- **本地缓存**：`chrome.storage.local` 键 `lastScrapedData`，按 **ASIN + 域名** 恢复上次结果
- **语言不匹配提示**：页面语言与站点常见语言不一致时提示，可选择坚持抓取
- **评论范围元数据**：`metadata.reviews_scope` 固定为 `"visible_dom_only"`（仅当前页可见评论）

---

## 安装（Chrome 加载已解压的扩展程序）

本项目**无需构建**，直接从仓库根目录加载即可。

1. 克隆或下载本仓库到本地。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择本仓库根目录（包含 `manifest.json` 的文件夹）。
6. 确认扩展列表中出现 **Amazon Product Insight**（版本 1.5.0）。

安装后可在工具栏固定扩展图标，方便在商品页使用。

---

## 使用方法

1. 在 Chrome 中打开支持的亚马逊**商品详情页**（URL 通常包含 `/dp/ASIN` 或 `/gp/product/ASIN`）。
2. 点击工具栏中的扩展图标，打开弹窗。
3. 查看顶部页面提示：商品页应显示「已就绪」及 ASIN；否则请先切换到正确页面。
4. 点击 **分析此页面**。
5. 解析完成后查看状态、覆盖率 chips、警告、主图/价格/品牌摘要、卖点与评论预览。
6. 按需：
   - **导出 JSON**：下载结果文件
   - **复制 JSON**：复制到剪贴板

### 缓存恢复

若当前标签页 URL 中的 ASIN 与域名，与本地缓存的上次结果一致，打开弹窗时会自动恢复上次结果。需要最新数据时，再次点击 **分析此页面** 即可重新抓取。

### 语言不匹配提示

部分站点（如 `amazon.de`）可切换多种界面语言。若检测到页面语言与站点常见语言不一致，扩展会给出警告；可点击 **坚持抓取** 继续，也可先切换回本地语言再抓取，以降低选择器失效风险。

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
- `products[]`：ASIN、标题、价格、品牌、主图、卖点、评论、状态、覆盖率、警告等

### 抓取状态（摘要）

| `scrape_status` | 条件 |
|-----------------|------|
| `failed` | 未能识别商品标题（或抓取过程抛出异常） |
| `partial` | 有标题，但存在任意警告（如缺价格/品牌/主图/卖点/评论/ASIN 等） |
| `success` | 有标题，且警告列表为空 |

---

## 已知限制

1. **仅抓取当前页可见 DOM 中的评论**  
   不会翻页、不会请求全部评论 API。`metadata.reviews_scope` 恒为 `visible_dom_only`。

2. **依赖亚马逊页面 DOM 结构**  
   改版或 A/B 测试可能导致选择器失效，出现字段漏抓；此时状态可能为 `partial` 或 `failed`，并带有中文警告。

3. **多语言站点可能产生语言不匹配警告**  
   界面语言与站点默认语言不一致时，部分节点文案与结构可能不同，影响解析成功率。

4. **仅限本地、当前标签页解析**  
   你必须先手动打开商品详情页；扩展通过 `activeTab` + `scripting` 注入逻辑读取当前页，不提供后台批量抓取、调度或代理池。

5. **不是批量自动化爬虫**  
   不适用于大规模、无人值守的全站采集。请仅用于个人研究与辅助整理，并遵守适用法律法规与亚马逊服务条款。

6. **部分字段可能因页面布局而缺失**  
   例如无标价、品牌区域隐藏、主图懒加载失败、卖点过少、当前视口无评论等，会导致 `partial` 与对应警告。

7. **当前不导出**  
   BSR、完整类目路径、评分均值/总评论数（官方统计）、变体完整矩阵、分页后的全部评论、优惠券明细等。

---

## 项目结构

```text
amazon-scraper/
├── manifest.json      # Manifest V3（名称、权限、图标、弹窗）
├── popup.html         # 弹窗 UI
├── popup.js           # 页面提示、注入解析、预览、导出/复制、缓存
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── docs/
│   └── SCHEMA.md      # 导出 JSON 字段说明（schema 1.2.0）
├── PRIVACY.md         # 隐私政策
├── LICENSE            # MIT 许可证
├── CHANGELOG.md       # 版本变更记录
├── README.md
└── .gitignore
```

说明：抓取逻辑以内联函数形式通过 `chrome.scripting.executeScript` 注入到当前页执行，**没有**独立的 `content.js` 文件。

### 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 在用户点击扩展后访问当前活动标签页 |
| `scripting` | 向当前页注入并执行解析函数 |
| `storage` | 本地缓存最近一次抓取结果（`lastScrapedData`） |
| host_permissions | 上述亚马逊站点下的页面访问范围 |

---

## 开发说明

- **无构建步骤**：修改 `popup.js` / `popup.html` / `manifest.json` 后，到 `chrome://extensions/` 点击该扩展的 **重新加载**，再刷新商品页并打开弹窗验证。
- 调试建议：在商品详情页打开 DevTools；扩展弹窗可右键检查元素查看控制台错误。
- 变更导出结构时，请同步更新 `schema_version` 与 [docs/SCHEMA.md](docs/SCHEMA.md)，并在 [CHANGELOG.md](CHANGELOG.md) 记录。
- 保持改动精简：优先修选择器与状态语义，避免引入未使用的打包工具链。

---

## 隐私、许可与变更

| 文档 | 说明 |
|------|------|
| [PRIVACY.md](PRIVACY.md) | 隐私政策：仅本地处理，不上传页面内容 |
| [LICENSE](LICENSE) | MIT 许可证 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [docs/SCHEMA.md](docs/SCHEMA.md) | 导出 JSON schema `1.2.0` 字段说明 |

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
