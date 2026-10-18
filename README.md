# 小王混剪 · 二手手机代淘服务中心

面向手机浏览器设计的二手手机代淘、代拍服务说明与需求确认网站。

## 本地预览

```powershell
node server.mjs
```

打开 `http://127.0.0.1:4173`。

现货管理后台入口：`http://127.0.0.1:4173/admin/`。

后台使用 Supabase Auth、Database 和 Storage。数据库表、Storage 与 RLS 安全策略初始化脚本位于 `supabase/schema.sql`；公开连接配置位于 `dist/supabase-config.js`，其中只能填写 Project URL 和 anon / publishable key。

安全加固、上传性能和备份恢复说明见 `docs/security-performance-audit.md`。

## 自动发布

推送到 `main` 分支后，GitHub Actions 会校验 `dist` 目录并自动发布到 GitHub Pages。
