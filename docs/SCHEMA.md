# 导出 Schema 说明（schema_version 1.3.0）

本文档描述 **Amazon Product Insight** 扩展导出的 JSON 数据结构。

| 项目 | 值 |
|------|-----|
| 扩展版本 | **`1.6.3`** |
| Schema 版本 | **`1.3.0`** |
| 抓取引擎 | `scraper/core.js`（`SCHEMA_VERSION` / `scrapeAmazonPage`） |

---

## 总览

每次成功注入并执行页面解析后，返回一个对象，包含：

- `metadata`：本次抓取的元信息（站点、时间、语言、schema 版本、评论范围等）
- `products`：商品数组（当前实现通常仅包含 **1** 个商品，即当前详情页）

导出 JSON 即对该对象做 `JSON.stringify(..., null, 2)`。

商品对象通过三层诊断列表描述数据质量：

| 数组 | 含义 | 对 `scrape_status` 的影响 |
|------|------|---------------------------|
| `errors[]` | 硬失败 | 非空 → **`failed`** |
| `warnings[]` | 质量问题 | 有标题且非空 → **`partial`** |
| `notes[]` | 信息性说明 | **不**单独强制 `partial`；可与 **`success`** 并存 |

---

## 完整示例（`success`）

下列示例对应一次 **`scrape_status: "success"`** 的结果：标题、ASIN、价格、品牌、主图齐全，描述点不少于 3 条，且页面可见评论至少 1 条。因此 `errors` / `warnings` / `notes` 均为空数组。

```json
{
  "metadata": {
    "schema_version": "1.3.0",
    "scrape_timestamp": "2026-07-17T12:34:56.789Z",
    "marketplace": "US",
    "domain": "www.amazon.com",
    "language": "English",
    "total_asins": 1,
    "reviews_scope": "visible_dom_only"
  },
  "products": [
    {
      "asin": "B08N5WRWNW",
      "productTitle": "Example Wireless Headphones with Noise Cancellation",
      "price": "$19.99",
      "brand": "ExampleBrand",
      "main_image": "https://m.media-amazon.com/images/I/example.jpg",
      "feature_bullets": [
        "Active noise cancellation for focused listening",
        "Up to 30 hours of battery life",
        "Bluetooth 5.0 multipoint connection",
        "Lightweight over-ear design",
        "Built-in microphone for calls"
      ],
      "customer_reviews": [
        {
          "headline": "Great value",
          "body": "Sound is clear and battery lasts all day…",
          "star_rating": 5,
          "review_date": "Reviewed in the United States on January 1, 2026",
          "origin_country": "United States"
        },
        {
          "headline": "Comfortable fit",
          "body": "Wore them for hours with no pressure…",
          "star_rating": 4,
          "review_date": "Reviewed in the United States on December 15, 2025",
          "origin_country": "United States"
        }
      ],
      "scrape_status": "success",
      "coverage": {
        "has_title": true,
        "has_asin": true,
        "has_price": true,
        "has_brand": true,
        "has_main_image": true,
        "bullet_count": 5,
        "review_count": 2
      },
      "errors": [],
      "warnings": [],
      "notes": [],
      "_debug": {
        "bullets_selector": "#feature-bullets ul li span.a-list-item",
        "reviews_selector": "[data-hook=\"review\"]"
      }
    }
  ]
}
```

> 说明：`_debug` 为可选调试字段（命中的选择器），下游工具可忽略。当 `scrape_status` 为 `partial` 时，`warnings` 通常非空；为 `failed` 时 `errors` 非空，部分商品字段可能为空。

### 示例：`success` + `notes`（仅缺可见评论）

有标题、无质量警告，但当前页无可见评论时，状态仍为 **`success`**，评论缺失写入 **`notes`**（**不**进入 `warnings`）：

```json
{
  "scrape_status": "success",
  "customer_reviews": [],
  "coverage": { "review_count": 0 },
  "errors": [],
  "warnings": [],
  "notes": [
    "当前页未识别到可见评论（仅抓取 DOM 可见部分，新品或折叠区常见）"
  ]
}
```

### 示例：`partial`（质量警告）

有标题，但描述点缺失或过少、或 ASIN 未知时：

```json
{
  "scrape_status": "partial",
  "errors": [],
  "warnings": [
    "未识别到任何描述点（可能漏抓或页面无卖点区）"
  ],
  "notes": [
    "未识别到价格（页面可能无公开价或布局未覆盖）",
    "当前页未识别到可见评论（仅抓取 DOM 可见部分，新品或折叠区常见）"
  ]
}
```

### 示例：`failed`（硬失败）

无标题时：

```json
{
  "scrape_status": "failed",
  "productTitle": "",
  "errors": ["未识别到商品标题（硬失败）"],
  "warnings": [],
  "notes": []
}
```

异常路径（脚本抛错）时，`metadata.marketplace` 可能为 `"ERROR"`，`errors` 含异常 `message`，`total_asins` 可为 `0`。

---

## 字段表

### `metadata`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema_version` | string | 是 | 固定为 `"1.3.0"`（本版本） |
| `scrape_timestamp` | string | 是 | ISO-8601 时间戳（`Date.toISOString()`），UTC |
| `marketplace` | string | 是 | 站点代码，见下表 |
| `domain` | string | 是 | 当前页 hostname，如 `www.amazon.de` |
| `language` | string | 是 | 由 `document.documentElement.lang` 映射的英文语言名（如 `German`、`English`）；无法映射时可能为首字母大写的语言码或 `Unknown`（异常路径） |
| `total_asins` | number | 是 | `products` 数组长度；正常为 `1`，异常失败结构中可为 `0` |
| `reviews_scope` | string | 是 | 评论抓取范围；当前实现恒为 `"visible_dom_only"`（仅当前页 DOM 中可见的评论节点） |

#### `marketplace` 取值

| 值 | 含义 |
|----|------|
| `US` | amazon.com |
| `UK` | amazon.co.uk |
| `DE` | amazon.de |
| `FR` | amazon.fr |
| `IT` | amazon.it |
| `ES` | amazon.es |
| `NL` | amazon.nl |
| `SE` | amazon.se |
| `PL` | amazon.pl |
| `BE` | amazon.com.be |
| `IE` | amazon.ie |
| `OTHER` | 主机名未匹配上述规则 |
| `ERROR` | 抓取逻辑顶层异常时的失败回退结构 |

匹配时对长域名优先（如 `amazon.com.be` 先于 `amazon.com`），使用 `hostname === domain` 或 `hostname.endsWith("." + domain)`。

#### `reviews_scope` 取值

| 值 | 含义 |
|----|------|
| `visible_dom_only` | 仅解析商品详情页当前 DOM 中可见的评论节点；不含评论分页、不含远程评论 API |

---

### `products[]` 商品对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `asin` | string | 条件 | 优先取 `#ASIN` 表单值，否则从 URL `/dp/` 或 `/gp/product/` 解析；失败时为 `"UNKNOWN"` |
| `productTitle` | string | 条件 | 商品标题；失败时可能为空字符串 |
| `price` | string | 条件 | 页面可见价格原文（如 `"29,99 €"`、`"$19.99"`）；未识别时为空字符串 `""` |
| `brand` | string | 条件 | 品牌名（由 byline / brand 链接等解析并清洗）；未识别时为空字符串 `""` |
| `main_image` | string | 条件 | 主图 URL；未识别时为空字符串 `""` |
| `feature_bullets` | string[] | 是* | 卖点描述列表，去重后最多约 10 条；无结果时为 `[]` |
| `customer_reviews` | object[] | 是* | 当前页 DOM 可见评论；无结果时为 `[]` |
| `scrape_status` | string | 是 | `success` \| `partial` \| `failed` |
| `coverage` | object | 是* | 覆盖率摘要，见下表 |
| `errors` | string[] | 是* | 硬失败原因；无错误时为 `[]` |
| `warnings` | string[] | 是* | 质量警告（会驱动 `partial`）；无警告时为 `[]` |
| `notes` | string[] | 是* | 信息性说明（**不**驱动 `partial`）；无说明时为 `[]` |
| `_debug` | object | 否 | 调试信息：`bullets_selector`、`reviews_selector`（命中选择器或 `null`） |

\* 正常解析路径均会写入；异常失败回退结构也会尽量补全 `coverage`、`errors`、`warnings`、`notes` 及商品字段。

#### `coverage`

| 字段 | 类型 | 说明 |
|------|------|------|
| `has_title` | boolean | 是否识别到非空标题 |
| `has_asin` | boolean | ASIN 是否不为 `"UNKNOWN"` |
| `has_price` | boolean | 是否识别到非空价格 |
| `has_brand` | boolean | 是否识别到非空品牌 |
| `has_main_image` | boolean | 是否识别到主图 URL |
| `bullet_count` | number | `feature_bullets.length` |
| `review_count` | number | `customer_reviews.length` |

#### `customer_reviews[]` 单条评论

| 字段 | 类型 | 说明 |
|------|------|------|
| `headline` | string | 评论标题；清理失败时可能为 `"No Title"` |
| `body` | string | 评论正文；**过短（≤5 字符）的条目会被直接丢弃**，不写入占位正文 |
| `star_rating` | number | 星级，解析自评分节点；失败时为 `0`。可能为小数（如 `4.0`） |
| `review_date` | string | 页面上的日期原始文本（多语言原文），未清洗为标准日期 |
| `origin_country` | string | 从来源/日期文案中解析的国家/地区；解析不到时为 `"Global"` |

**重要：** `customer_reviews` 仅反映商品详情页当前 DOM 中可见的评论节点，**不包含**评论分页中的其余评论。该约束与 `metadata.reviews_scope: "visible_dom_only"` 一致。

---

## `scrape_status` 语义（关键）

判定顺序（与 `scraper/core.js` 一致）：

| 状态 | 条件 | 典型表现 |
|------|------|----------|
| `failed` | `errors.length > 0`，或无商品标题；或整段抓取逻辑抛出异常 | 弹窗显示失败；正常失败路径下 **导出 JSON** 不可用；异常路径 `marketplace` 可能为 `ERROR` |
| `partial` | 有标题，且 `warnings.length > 0` | 弹窗显示「部分成功」、覆盖率 chips、「需要关注」警告列表；**仍可导出 JSON** |
| `success` | 有标题，且 `warnings` 为空（**`notes` 可非空**） | 弹窗显示分析完成；可导出 JSON；可展示「说明」notes |

公式摘要：

```text
failed  ← 无标题 / errors 非空 / 顶层异常
partial ← 有标题 且 warnings 非空
success ← 有标题 且 warnings 为空（notes 不影响）
```

---

## `errors` / `warnings` / `notes` 对照表

### `errors[]`（硬失败 → `failed`）

| 场景 | 典型文案（以代码为准） |
|------|------------------------|
| 无商品标题 | `未识别到商品标题（硬失败）` |
| 运行时异常 | 异常 `message`（写入失败回退结构的 `errors`） |

### `warnings[]`（质量问题 → `partial`）

| 场景 | 典型文案（以代码为准） |
|------|------------------------|
| ASIN 未知 | `未识别到 ASIN` |
| 无描述点 | `未识别到任何描述点（可能漏抓或页面无卖点区）` |
| 描述点过少（&lt; 3） | `描述点偏少（N 条），可能存在漏抓` |

### `notes[]`（信息性 → **不**强制 `partial`）

| 场景 | 典型文案（以代码为准） |
|------|------------------------|
| 无价格 | `未识别到价格（页面可能无公开价或布局未覆盖）` |
| 无品牌 | `未识别到品牌` |
| 无主图 | `未识别到主图` |
| 无可见评论 | `当前页未识别到可见评论（仅抓取 DOM 可见部分，新品或折叠区常见）` |

因此：

- **有标题 + 任意一条 `warnings`** → `partial`（即使同时有 `notes`）
- **有标题 + 仅有 `notes`（`warnings` 为空）** → `success`
- **无标题** → `failed`（`errors` 含硬失败说明）

> 与 schema **1.2.0** 的差异：缺价格 / 品牌 / 主图 / 可见评论在 **1.3.0** 中归入 **`notes`**，不再因这些项单独判为 `partial`。

---

## 兼容性说明

### 旧版缓存

扩展使用 `chrome.storage.local` 键 `lastScrapedData` 缓存最近一次结果。打开弹窗时，若当前 URL 的 **ASIN + hostname** 与缓存一致，会恢复预览与导出。

兼容行为：

- 预览对 `prod.coverage || {}`、`prod.warnings || []`、`prod.notes || []`、`prod.errors || []` 做兜底。
- 缺少 `notes` / `errors` 的旧缓存仍可预览；覆盖率 chips 按空对象/数组长度回退。
- 旧数据可能仍带已废弃的单数字段 `error`（字符串）；UI 在 `errors` 为空时会回退读取 `prod.error`。
- `metadata.reviews_scope` 展示层默认回退：`metadata.reviews_scope || "visible_dom_only"`。

下游工具若依赖 `errors` / `notes` 分层或 1.3.0 状态语义，应要求用户 **重新分析** 以生成完整结构。

### 与旧 schema 的关系

| 版本 | 主要变化 |
|------|----------|
| `1.1.0` | 商品对象明确 `scrape_status`、`coverage`、`warnings`（及失败时的 `error`）；`coverage` 仅含 `has_title`、`has_asin`、`bullet_count`、`review_count` |
| `1.2.0` | 增加 `price` / `brand` / `main_image` 与对应 `coverage.has_*`；增加 `metadata.reviews_scope`；缺字段多写入 `warnings` 并驱动 `partial` |
| **`1.3.0`** | 引入 `errors[]` / `warnings[]` / `notes[]` 三层诊断；状态语义改为仅 `errors`/`无标题` → failed、仅 `warnings` → partial、`notes` 不强制 partial；可选 `_debug`；抓取逻辑抽离至 `scraper/core.js` |

`metadata.schema_version` 应作为消费方的版本开关；未知版本建议宽松解析 + 人工校验。

### 消费方建议

1. 先读 `metadata.schema_version` 与 `products[0].scrape_status`。
2. `failed` 时勿当作完整商品；优先读 `errors`（兼容时可回退 `error`）。
3. `partial` 时按 `coverage` 与 `warnings` 决定是否可用；同时可参考 `notes`。
4. `success` 时仍可能有 `notes`（例如无可见评论）；勿假设 `notes` 为空。
5. 不要假设 `customer_reviews` 是全量评论；以 `reviews_scope` 为准。
6. `review_date` 为页面原文，多语言格式不一，勿直接当 ISO 日期解析。
7. `price` 为展示原文，**不是**统一数值类型；货币符号与小数分隔符随站点语言变化。
8. `main_image` 可能为 CDN URL；勿假设长期可访问或固定尺寸。
9. `_debug` 仅供排查选择器，勿作为业务契约字段。

---

## 当前明确不在 schema 内的字段

以下信息**尚未**由本扩展导出，请勿在集成时假定存在：

- 优惠券明细、划线价与成交价的完整拆分（仅导出页面解析到的主价格文本）
- 店铺名（与品牌不同）
- 图集（除主图外的全部图片 URL）
- BSR、类目路径
- 评分均值、总评论数（官方统计）
- 变体（颜色/尺寸）完整矩阵
- 分页后的全部评论
- Markdown / 其他非 JSON 导出格式

若未来增加字段，应提升 `schema_version` 并更新本文档。
