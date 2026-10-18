# 小王混剪网站安全与上传性能审计

审计日期：2026-10-18

> 本文记录本地代码的检查与加固结果。`supabase/schema.sql` 的新增策略尚未应用到线上 Supabase，代码也尚未推送或部署。

## 当前架构

- 前台与后台：GitHub Pages 静态托管，`main` 分支由 GitHub Actions 自动部署 `dist/`。
- 数据库、身份认证与图片：Supabase。
- GitHub 仓库当前为 Public。
- 浏览器中只保留 Supabase Project URL 与 publishable key；这两项本来就是公开配置，不能作为写权限凭证。

## 本次已在本地完成

### 密钥与构建产物

- 扫描当前跟踪文件及全部 8 个 Git 历史提交，未发现数据库密码、管理员密码、service role key、`sb_secret_`、GitHub Token、数据库连接串或私钥。
- `dist/` 不包含 Source Map 文件。
- 构建检查脚本新增高风险凭证、Source Map、CSP、会话存储、RLS 与上传优化校验。

### 浏览器安全

- 前台与后台加入严格的 Content Security Policy，只允许本站脚本，并仅允许连接当前 Supabase 项目。
- 加入 `no-referrer`，减少后台来源地址外泄。
- 管理员 access token / refresh token 改为仅保存于 `sessionStorage`；关闭浏览器会话后自动清除，同时清除旧版 `localStorage` 会话。
- 对前端可调用的数据表设置白名单，降低误调用风险。真正权限边界仍由数据库 RLS 执行。
- 所有动态商品文字继续在进入 `innerHTML` 前进行 HTML 转义；未使用 `eval` 或动态脚本执行。

### 数据与存储权限（本地 SQL，待确认后应用）

- 管理员判断同时要求 `admin_users` 成员关系和指定管理员 UUID。
- 匿名访客只可读取 `on_sale`、`sold` 商品；`hidden` 不可读取。
- 新增、修改、删除均要求通过管理员 RLS，直接调用 REST API 也不能绕过。
- Storage 写入、覆盖和删除均要求管理员身份。
- Storage 路径限定为商品 UUID 目录及主图/实拍图命名格式。
- Bucket 仅允许 JPG、PNG、WebP，单张服务端上限 8MB。
- 数据库商品写操作增加 5 分钟最多 60 次的服务端节流触发器。
- 增加商品版本历史表、变更触发器及管理员恢复函数，支持误改/误删恢复。
- 为未来 MFA 保留 AAL2 策略切换说明；当前尚未强制 MFA。

### 登录和上传防滥用

- 当前浏览器会话内连续 5 次登录失败后暂停 2 分钟。此措施用于减缓误操作与简单脚本，不能替代 Supabase 服务端限频。
- Supabase Auth 本身对 Token、MFA Challenge 等端点有限频；正式上线前应在 Dashboard 的 Authentication > Rate Limits 核对当前值。
- 如面临持续暴力尝试，建议启用 Cloudflare Turnstile / hCaptcha。启用后需要在登录页面加入 CAPTCHA token，不能只打开控制台开关。
- 静态 GitHub Pages 无法可靠实现“每个管理员每分钟上传多少文件”的服务端限频。当前通过 RLS、单图大小、格式、最多 9 图及客户端并发上限降低风险；若要强制上传频率，需要 Supabase Edge Function 或迁移到自有后端。

## 上传性能优化

- 原来：原图直接上传、9 张图串行、无上传进度、无失败重试。
- 现在：上传前在手机本地将长边压缩到最多 1800px，优先转换为 WebP，目标单图约 2.5MB，服务端硬上限仍为 8MB。
- 支持原始 JPG、PNG、WebP，单张原图最大 25MB；压缩失败或压缩后仍超限会明确提示。
- 图片预处理并发 2 张，上传并发最多 3 张，避免 9 张同时占满手机内存和境外链路。
- 网络失败、408、429、5xx 最多自动重试 2 次，使用递增等待时间。
- 新增总体上传进度条和状态文字。
- 同一批重复文件按文件名、大小、修改时间去重。
- 公共商品读取请求遇到暂时网络故障会重试，所有请求都有超时保护。

## 仍需在 Supabase 控制台确认的事项

以下检查不能只从仓库代码证明，且本次没有修改线上配置：

1. Authentication 是否关闭公开注册，只保留已创建的管理员账号。
2. Authentication > Rate Limits 当前服务端限频值。
3. 是否启用 CAPTCHA；如果启用，需要配套修改登录 UI。
4. 管理员是否计划启用 TOTP MFA；启用后需完成 MFA 挑战页，并将写策略强制为 JWT `aal2`。
5. 线上数据库实际策略是否与本地 `schema.sql` 完全一致。应用前应先在测试项目运行 SQL。

## 备份与恢复

- 本地 SQL 的版本历史可恢复单个商品记录，但图片文件本身仍需单独备份。
- Supabase 官方数据库备份不包含 Storage 中的图片对象，只包含其元数据。
- 免费方案建议每周执行一次 `supabase db dump`，加密保存到不公开的位置；同时单独导出 `stock-images` Bucket。
- 付费方案可使用每日备份；需要更细恢复点时再评估 PITR。
- 每月应在临时项目做一次恢复演练，避免只有备份、没有可验证的恢复流程。

## CloudBase 迁移评估

可行。CloudBase 提供 Web 身份认证、数据库、云存储、安全规则和面向中国大陆的地域/CDN能力，也能继续支持微信小程序。

迁移前应把页面与后端 SDK 之间统一为以下接口：

```text
AuthProvider
  signIn / signOut / getSession / getCurrentUser / isAdmin

StockRepository
  listPublic / listAdmin / create / update / remove / reorder / setStatus

ImageRepository
  upload / remove / getPublicUrl
```

页面只调用这些接口，不直接出现 Supabase 表名、REST 路径或 Storage URL。未来只需新增 `CloudBaseProvider` 并切换配置，首页、详情页和后台表单无需重写。图片压缩、校验、并发、重试和进度属于平台无关层，可原样复用。

迁移时仍需重新设计并测试 CloudBase 的数据库与云存储安全规则。CloudBase 文档型数据库安全规则是文档级权限控制，不能简单把 Supabase SQL RLS 原样复制。

## 风险结论

- 高风险明文密钥泄露：未发现。
- 匿名写入绕过：代码设计上由 RLS 阻止；需要把本地硬化 SQL应用到线上后再次做匿名/非管理员实测。
- XSS：现有转义较完整，本次增加 CSP；风险较低，但静态站仍需保持所有后台文字经过转义。
- 账号接管：仍取决于管理员密码强度、Supabase 服务端限频及是否启用 MFA。建议后续启用 TOTP MFA。
- 上传滥用：匿名和普通账号无法上传；管理员令牌一旦被盗仍可能滥用，因此 MFA 和短会话很重要。
- 公开仓库：所有业务前端源码、公开图片与 SQL 结构目前可被查看；这不等于获得写权限，但会增加复制和审计攻击面的便利。是否改 Private 会影响 GitHub Pages 资格/计费，应单独确认，不在本次擅自修改。
