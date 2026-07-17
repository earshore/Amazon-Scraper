# 导出 Schema 说明（schema_version 1.2.0）

本文档描述 **Amazon Product Insight** 扩展导出的 JSON 数据结构。当前 schema 版本为 **`1.2.0`**（扩展版本 **`1.5.0`**）。

---

## 总览

每次成功注入并执行页面解析后，返回一个对象，包含：

- `metadata`：本次抓取的元信息（站点、时间、语言、schema 版本、评论范围等）
- `products`：商品数组（当前实现通常仅包含 **1** 个商品，即当前详情页）

导出 / 复制 JSON 即对该对象做 `JSON.stringify(..., null, 2)`。

---

## 完整示例

下列示例对应一次 **`scrape_status: "success"`** 的结果：标题、ASIN、价格、品牌、主图齐全，描述点不少于 3 条，且页面可见评论至少 1 条，因此 `warnings` 为空数组。

```json
{
  "metadata": {
    "schema_version": "1.2.0",
    "scrape_timestamp": "2026-07-17T12:34:56.789Z",
    "marketplace": "DE",
    "domain": "www.amazon.de",
    "language": "German",
    "total_asins": 1,
    "reviews_scope": "visible_dom_only"
  },
  "products": [
    {
      "asin": "B0XXXXXXXX",
      "productTitle": "示例商品标题",
      "price": "29,99 €",
      "brand": "ExampleBrand",
      "main_image": "https://m.media-amazon.com/images/I/example.jpg",
      "feature_bullets": [
        "卖点一",
        "卖点二",
        "卖点三",
        "卖点四",
        "卖点五"
      ],
      "customer_reviews": [
        {
          "headline": "评论标题",
          "body": "评论正文……",
          "star_rating": 4.0,
          "review_date": "Bewertet in Deutschland am 1. Januar 2026",
          "origin_country": "Deutschland"
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
        "review_count": 1
      },
      "warnings": []
    }
  ]
}
```

> 说明：当 `scrape_status` 为 `partial` 时，`warnings` 通常非空；为 `failed` 时可能出现 `error` 字段，且部分商品字段可能缺失或为空。

---

## 字段表

### `metadata`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema_version` | string | 是 | 固定为 `"1.2.0"`（本版本） |
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
| `asin` | string | 条件 | 优先取 `#ASIN` 表单值，否则从 URL `/dp/` 或 `/gp/product/` 解析；失败时为 `"UNKNOWN"`。异常失败对象中可能缺失 |
| `productTitle` | string | 条件 | 商品标题；失败时可能为空字符串或缺失 |
| `price` | string | 条件 | 页面可见价格原文（如 `"29,99 €"`、`"$19.99"`）；未识别时为空字符串 `""` |
| `brand` | string | 条件 | 品牌名（由 byline / brand 链接等解析并清洗）；未识别时为空字符串 `""` |
| `main_image` | string | 条件 | 主图 URL；未识别时为空字符串 `""` |
| `feature_bullets` | string[] | 是* | 卖点描述列表，去重后最多约 10 条；无结果时为 `[]` |
| `customer_reviews` | object[] | 是* | 当前页 DOM 可见评论；无结果时为 `[]` |
| `scrape_status` | string | 是 | `success` \| `partial` \| `failed` |
| `coverage` | object | 是* | 覆盖率摘要，见下表 |
| `warnings` | string[] | 是* | 人类可读中文警告；无警告时为 `[]` |
| `error` | string | 否 | 通常仅在 `failed`（异常路径）时出现，为异常 `message` |

\* 正常解析路径均会写入；异常失败回退结构也会尽量补全 `coverage`、`warnings`、`price`、`brand`、`main_image`、`feature_bullets`、`customer_reviews` 等字段。

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
| `body` | string | 评论正文；过短条目会被过滤；占位可能为 `"No Content"` |
| `star_rating` | number | 星级，解析自评分节点；失败时为 `0`。可能为小数（如 `4.0`） |
| `review_date` | string | 页面上的日期原始文本（多语言原文），未清洗为标准日期 |
| `origin_country` | string | 从来源/日期文案中解析的国家/地区；解析不到时为 `"Global"` |

**重要：** `customer_reviews` 仅反映商品详情页当前 DOM 中可见的评论节点，**不包含**评论分页中的其余评论。该约束与 `metadata.reviews_scope: "visible_dom_only"` 一致。

---

## `scrape_status` 语义

判定顺序如下（与 `popup.js` 中 `scrapeAmazonLogic` 一致）：

| 状态 | 条件 | 典型表现 |
|------|------|----------|
| `failed` | 未识别到商品标题（`productTitle` 为空），或整段抓取逻辑抛出异常 | 弹窗显示错误，不展示导出/复制按钮（正常失败路径）；异常路径 `marketplace` 可能为 `ERROR`，并带 `error` / 警告 |
| `partial` | 标题存在，且 `warnings.length > 0` | 弹窗显示「部分成功」、覆盖率 chips 与警告列表；**仍可导出 / 复制** |
| `success` | 标题存在，且无警告 | 弹窗显示分析完成；可导出 / 复制 |

### 何时产生警告（`warnings`）

当前实现可能推送的中文警告包括（不限于、文案以代码为准）：

| 场景 | 警告含义（摘要） |
|------|------------------|
| 无标题 | 未识别到商品标题（同时会将状态置为 `failed`） |
| ASIN 未知 | 未识别到 ASIN |
| 无价格 | 未识别到价格 |
| 无品牌 | 未识别到品牌 |
| 无主图 | 未识别到主图 |
| 无描述点 | 未识别到任何描述点 |
| 描述点过少 | 描述点少于 3 条，可能存在漏抓 |
| 无评论 | 当前页未识别到评论（仅抓取页面可见评论） |
| 运行时异常 | 抓取过程发生异常: … |

因此：

- **有标题 + 任意一条上述数据类警告** → `partial`
- **有标题 + 警告列表为空** → `success`
- **无标题** → `failed`（即便 `warnings` 中也有「未识别到商品标题」）

---

## 兼容性说明

### 旧版缓存（无 `price` / `brand` / `main_image` / 扩展 `coverage`）

扩展使用 `chrome.storage.local` 键 `lastScrapedData` 缓存最近一次结果。打开弹窗时，若当前 URL 的 **ASIN + hostname** 与缓存一致，会恢复预览与导出。

兼容行为：

- 预览函数对 `prod.coverage || {}`、`prod.warnings || []` 做了兜底。
- **缺少新字段的旧缓存仍可预览**；覆盖率 chips 会按空对象/数组长度回退显示。
- 缺少 `warnings` 时按无警告处理；若 `scrape_status` 也不是 `partial`，状态区可能显示「上次分析结果 (缓存)」。
- `metadata.reviews_scope` 在展示层对旧数据有默认回退：`metadata.reviews_scope || "visible_dom_only"`。

下游工具若依赖 `price` / `brand` / `main_image`、扩展后的 `coverage.has_*` 或 `reviews_scope`，应检测字段是否存在，或要求用户使用扩展 **重新分析** 以生成 1.2.0 完整结构。

### 与旧 schema 的关系

- `1.1.0` 在商品对象上明确了 `scrape_status`、`coverage`、`warnings`（及失败时的 `error`），当时 `coverage` 仅含 `has_title`、`has_asin`、`bullet_count`、`review_count`。
- `1.2.0` 增加：
  - 商品字段 `price`、`brand`、`main_image`
  - `coverage.has_price`、`coverage.has_brand`、`coverage.has_main_image`
  - `metadata.reviews_scope`
- `metadata.schema_version` 应作为消费方的版本开关；未知版本建议宽松解析 + 人工校验。

### 消费方建议

1. 先读 `metadata.schema_version` 与 `products[0].scrape_status`。
2. `failed` 时勿当作完整商品；优先读 `error` / `warnings`。
3. `partial` 时按 `coverage` 与 `warnings` 决定是否可用（例如无价格时仍可用标题与卖点）。
4. 不要假设 `customer_reviews` 是全量评论；以 `reviews_scope` 为准。
5. `review_date` 为页面原文，多语言格式不一，勿直接当 ISO 日期解析。
6. `price` 为展示原文，**不是**统一数值类型；货币符号与小数分隔符随站点语言变化。
7. `main_image` 可能为 CDN URL；勿假设长期可访问或固定尺寸。

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
