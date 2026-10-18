# Supabase 配置说明

本目录只包含数据库结构和安全策略，不包含任何账号密码或私密密钥。

## 安全边界

- 浏览器端只使用 Project URL 和 anon / publishable key。
- 管理员密码只在 Supabase Auth 登录页面使用，不写入仓库。
- `service_role` key、数据库密码、access token、refresh token 永远不要提交或发送。
- 商品写入、删除和图片上传由 `schema.sql` 中的 RLS 策略限制为 `admin_users` 表内的登录用户。
- 匿名访客只能读取状态为 `on_sale` 或 `sold` 的商品；`hidden` 商品不可读取。

## 启用步骤

1. 在 Supabase 项目 SQL Editor 中运行 `schema.sql`。
2. 在 Authentication > Users 创建并确认管理员用户。
3. 复制该用户 UUID，在 SQL Editor 单独执行：
   `insert into public.admin_users (user_id) values ('管理员UUID');`
4. 把 Project URL 和 anon / publishable key 填入 `dist/supabase-config.js`。
