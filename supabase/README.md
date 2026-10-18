# Supabase 配置说明

本目录只包含数据库结构和安全策略，不包含任何账号密码或私密密钥。

## 安全边界

- 浏览器端只使用 Project URL 和 anon / publishable key。
- 管理员密码只在 Supabase Auth 登录页面使用，不写入仓库。
- `service_role` key、数据库密码、access token、refresh token 永远不要提交或发送。
- 商品写入、删除和图片上传由 `schema.sql` 中的 RLS 策略同时限制为 `admin_users` 表内用户和当前指定管理员 UUID。
- 匿名访客只能读取状态为 `on_sale` 或 `sold` 的商品；`hidden` 商品不可读取。
- 商品写入带服务端节流与版本历史，便于误删、误改后恢复。

## 启用步骤

1. 先备份数据库，在测试项目运行并验证 `schema.sql`；确认后再在正式项目运行。
2. 在 Authentication > Users 创建并确认管理员用户。
3. 复制该用户 UUID，在 SQL Editor 单独执行：
   `insert into public.admin_users (user_id) values ('管理员UUID');`
4. 把 Project URL 和 anon / publishable key 填入 `dist/supabase-config.js`。

完整审计、上线前检查、备份与 CloudBase 迁移说明见 `docs/security-performance-audit.md`。
