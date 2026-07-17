# Contributing to Amazon Product Insight

感谢关注本项目。本仓库是 **Manifest V3 Chrome 扩展**：仅在本地解析当前亚马逊商品详情页并导出 JSON。

## 开发环境

- Node.js ≥ 18
- Chrome（加载未打包扩展）

```bash
npm ci
npm run check   # 语法 + 单测 + verify
```

加载扩展：Chrome → `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** → 选择仓库根目录（含 `manifest.json`）。

## 架构约定

| 路径 | 职责 |
|------|------|
| `scraper/marketplaces.js` | 域名白名单、语言前缀、ASIN 解析（**单一数据源**） |
| `scraper/core.js` | 页面 DOM 抓取与 schema 1.3.0 状态模型 |
| `popup.js` / `popup.html` | 仅 UI：注入、预览、导出、缓存 |
| `test/` | jsdom 夹具与 marketplaces 单元测试 |
| `scripts/verify.mjs` | 版本 / 架构 / host 一致性门禁 |
| `scripts/pack-extension.mjs` | 白名单运行时 zip |

**不要**把抓取逻辑写回 `popup.js`。  
**不要**在扩展运行时加入服务端批量爬取或 `web/` 依赖。

## 修改 schema

1. 更新 `scraper/core.js` 中的 `SCHEMA_VERSION`（若破坏性变更）
2. 同步 `docs/SCHEMA.md`、README、测试夹具断言
3. 更新 `CHANGELOG.md`
4. 运行 `npm run check`

## 发版检查

1. 提升 `manifest.json` 与 `package.json` 版本（`verify` 以 manifest 为准交叉比对）
2. 更新 `CHANGELOG.md`、`docs/QA-CHECKLIST.md`、README 版本字面量
3. `npm run check`
4. `npm run pack` → 得到 `dist/amazon-product-insight-{version}.zip`
5. 按 `docs/QA-CHECKLIST.md` 做 US/UK/DE 冒烟

## PR 建议

- 说明动机与用户可见变化
- 附上 `npm run check` 结果
- 选择器变更请补夹具或说明为何无法夹具化

问题与讨论请使用 GitHub Issues。

## CI 工作流安装

本仓库模板文件：docs/ci/github-actions-check.yml。
若需启用 GitHub Actions，复制为 .github/workflows/check.yml（需要具有 workflow 权限的 token）。
