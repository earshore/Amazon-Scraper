# 隐私政策 / Privacy Policy

**Amazon Product Insight**

最后更新日期 / Last updated: **2026-07-18**（扩展版本 1.6.4）

本扩展未与 Amazon 或其关联公司建立任何隶属、赞助或官方合作关系。  
This extension is not affiliated with, sponsored by, or endorsed by Amazon or its affiliates.

---

## 中文

### 1. 概述

Amazon Product Insight 是一款在本地浏览器中运行的 Chrome 扩展（Manifest V3）。它在您主动操作时，解析**当前已打开的 Amazon 商品详情页**中的公开页面内容，并在扩展弹窗中展示结构化结果，支持将结果导出为 JSON 文件。

本扩展**不会**将页面内容上传到任何服务器。

### 2. 我们处理哪些数据

扩展仅在您点击抓取等操作后，于浏览器本地读取并解析当前标签页中与商品相关的公开信息，例如：

- 商品标题、ASIN、品牌、价格、主图链接等详情页上可见的字段
- 评论相关摘要（如适用，且取决于当前页面是否展示）
- 抓取状态、覆盖范围、警告信息等元数据
- 导出用的结构化 JSON 结果

扩展**不会**收集、读取或存储：

- 您的 Amazon 账号、密码或登录凭证
- 支付信息
- 与当前商品详情页无关的浏览历史
- 设备上其他网站的内容

### 3. 数据处理方式（仅限本地）

- 所有解析与展示均在您的浏览器本地完成。
- 扩展**不**将页面 HTML、抓取结果或任何个人信息发送到开发者服务器或其他远程服务。
- 扩展**不**包含远程代码执行、第三方分析 / 广告 SDK，也**不**向开发者后端上报使用数据。
- 解析对象是您已在浏览器中打开的 Amazon 页面（DOM 读取，非批量爬虫）。
- **预览主图例外：** 当结果中存在 `https://` 主图 URL 时，弹窗 `<img>` 会向 Amazon 图片 CDN（如 `media-amazon.com`）发起浏览器常规图片请求以便预览；请求带 `referrerpolicy=no-referrer`。若无主图或 URL 非 https，则不发起该请求。**扩展不会**为此上传您的抓取 JSON。

### 4. 本地存储

扩展使用 Chrome 提供的 `chrome.storage.local` 在本地缓存最近一次**成功或部分成功**的抓取结果，存储键名为：

- `lastScrapedData`

失败结果**不会**写入该缓存。缓存仅保存在您的设备/浏览器配置中，用于在再次打开弹窗时恢复上次结果（同一 ASIN + 域名）。您可以：

- 在扩展弹窗对同一商品执行 **「重新分析」** 会用新结果覆盖 `lastScrapedData`
- 或通过浏览器的扩展存储清理、卸载扩展清除本地数据

### 5. 用户导出

导出功能仅支持下载 **JSON** 文件到您选择的本地位置。导出内容可能包含页面上**公开可见**的商品字段与评论正文（用户撰写的公开评论）。是否导出、何时导出、如何使用导出文件，均由您自行决定。导出文件保存在您的设备上，本扩展不会代为上传。

### 6. 权限说明

扩展申请的权限与用途如下：

| 权限 | 用途 |
|------|------|
| `activeTab` | 在您主动使用扩展时访问当前活动标签页 |
| `scripting` | 在当前 Amazon 商品页注入脚本以解析页面内容 |
| `storage` | 使用 `chrome.storage.local` 缓存最近一次抓取结果 |
| 主机权限（Amazon 站点） | 仅限支持的 Amazon 市场域名（如 US、UK、DE、FR、IT、ES、NL、SE、PL、BE、IE 等），以便在对应商品详情页上运行解析逻辑 |

### 7. 第三方

本扩展**不会**将抓取数据出售、出租或交易给第三方。  
本扩展本身**不**通过自有后端收集或转发页面内容。页面内容仍由您访问的 Amazon 网站按其自身政策处理；本扩展不控制 Amazon 的服务。

### 8. 儿童隐私

本扩展不面向 13 岁以下儿童，也不会有意收集儿童的个人信息。

### 9. 政策变更

我们可能不时更新本隐私政策。重大变更将通过更新本文件的「最后更新日期」并在本仓库发布说明。继续使用本扩展即表示您知悉更新后的政策。

### 10. 联系方式

如有隐私相关问题，请通过本仓库 **GitHub Issues** 联系维护者。  
请勿通过其他未公开渠道提交个人敏感信息。

---

## English

### 1. Overview

**Amazon Product Insight** is a local Chrome extension (Manifest V3). When you use it, it parses the **currently open Amazon product detail page** in your browser and shows structured results in the extension popup. You may export results as a JSON file.

This extension **does not** upload page content to any server.

### 2. What data is processed

After you trigger a scrape, the extension reads and parses publicly visible product information from the active tab, which may include:

- Title, ASIN, brand, price, main image URL, and similar on-page fields
- Review-related summary data when available on the page
- Metadata such as scrape status, coverage, and warnings
- The structured JSON used for preview and export

The extension does **not** collect or store:

- Amazon account credentials or passwords
- Payment information
- Browsing history unrelated to the current product detail page
- Content from other websites

### 3. Local-only processing

- Parsing and display run entirely in your browser.
- The extension does **not** send page HTML, scrape results, or personal information to a developer-operated server or other remote collection endpoint.
- The extension does **not** include remote code execution, third-party analytics/ads SDKs, or usage telemetry to a developer backend.
- It works on the Amazon product page you already opened (DOM parse, not bulk crawling).
- **Main-image preview exception:** when a result includes an `https://` main image URL, the popup `<img>` may request that image from Amazon’s image CDN (e.g. `media-amazon.com`) with `referrerpolicy=no-referrer`. No scrape JSON is uploaded for this.

### 4. Local storage

The extension uses `chrome.storage.local` to cache the last **successful or partial** scrape under:

- `lastScrapedData`

Failed scrapes are **not** cached. Cache is keyed for restore by ASIN + domain. Running **Re-analyze** on the same product overwrites `lastScrapedData`. You can also clear data via browser extension storage wipe or uninstall.

### 5. User export

Export is **JSON download only**. Exported files may include publicly visible product fields and on-page customer review text. Export is optional and initiated by you. Files stay on your device; the extension does not upload them.

### 6. Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the active tab when you use the extension |
| `scripting` | Inject a script on the current Amazon product page to parse content |
| `storage` | Cache the last scrape in `chrome.storage.local` |
| Host permissions (Amazon marketplaces) | Run on supported Amazon marketplace domains (including US, UK, DE, FR, IT, ES, NL, SE, PL, BE, IE) |

### 7. Third parties

We do **not** sell, rent, or trade scraped data. The extension itself does **not** use a third-party backend to collect page content. Amazon’s own services remain subject to Amazon’s policies; this extension does not control them.

### 8. Children

This extension is not directed at children under 13, and we do not knowingly collect personal information from children.

### 9. Changes to this policy

We may update this policy from time to time. Material changes will be reflected by updating the “Last updated” date and publishing the revised file in this repository.

### 10. Contact

For privacy questions, contact the maintainer **via this repository’s GitHub Issues only**.  
Do not submit sensitive personal information through unsolicited channels.

---

**Copyright (c) 2026 Aihang** · MIT License  
**Not affiliated with Amazon.**
