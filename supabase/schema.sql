-- 小王混剪现货管理后台：Supabase 数据库、RLS 与图片存储策略
-- 可在 Supabase Dashboard > SQL Editor 中整段运行。

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_products (
  id uuid primary key default gen_random_uuid(),
  model text not null check (char_length(model) between 1 and 80),
  memory text not null check (char_length(memory) between 1 and 50),
  price integer not null check (price >= 0),
  condition text not null check (char_length(condition) between 1 and 40),
  color text not null default '' check (char_length(color) <= 40),
  configuration text not null default '' check (char_length(configuration) <= 160),
  description text not null check (char_length(description) between 1 and 2000),
  status text not null default 'on_sale' check (status in ('on_sale', 'sold', 'hidden')),
  display_order integer not null default 0 check (display_order >= 0),
  main_image_path text not null,
  gallery_image_paths text[] not null default '{}'::text[] check (cardinality(gallery_image_paths) <= 9),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 商品历史快照用于误删/误改后的恢复。该表不向匿名访客开放。
create table if not exists public.stock_product_versions (
  id bigint generated always as identity primary key,
  product_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- 写操作节流日志。仅由安全触发器写入，不向浏览器开放。
create table if not exists public.stock_write_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  operation text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists stock_products_public_order_idx
  on public.stock_products (status, display_order, created_at);
create index if not exists stock_product_versions_lookup_idx
  on public.stock_product_versions (product_id, changed_at desc);
create index if not exists stock_write_events_rate_idx
  on public.stock_write_events (user_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_products_set_updated_at on public.stock_products;
create trigger stock_products_set_updated_at
before update on public.stock_products
for each row execute function public.set_updated_at();

create or replace function public.is_stock_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and user_id = '27fba96f-7f0d-43b3-be5a-b4128385f6e6'::uuid
  );
$$;

revoke all on function public.is_stock_admin() from public;
grant execute on function public.is_stock_admin() to authenticated;

create or replace function public.enforce_stock_write_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  recent_count integer;
begin
  if actor is null or not public.is_stock_admin() then
    raise exception 'permission denied';
  end if;

  delete from public.stock_write_events
  where occurred_at < now() - interval '24 hours';

  select count(*) into recent_count
  from public.stock_write_events
  where user_id = actor
    and occurred_at >= now() - interval '5 minutes';

  if recent_count >= 60 then
    raise exception 'too many stock write operations, retry later' using errcode = '57014';
  end if;

  insert into public.stock_write_events (user_id, operation)
  values (actor, tg_op);
  return null;
end;
$$;

revoke all on function public.enforce_stock_write_rate() from public;

drop trigger if exists stock_products_write_rate_limit on public.stock_products;
create trigger stock_products_write_rate_limit
before insert or update or delete on public.stock_products
for each statement execute function public.enforce_stock_write_rate();

create or replace function public.log_stock_product_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.stock_product_versions (product_id, operation, snapshot, changed_by)
    values (old.id, tg_op, to_jsonb(old), auth.uid());
    return old;
  end if;

  insert into public.stock_product_versions (product_id, operation, snapshot, changed_by)
  values (new.id, tg_op, to_jsonb(new), auth.uid());
  return new;
end;
$$;

revoke all on function public.log_stock_product_version() from public;

drop trigger if exists stock_products_version_history on public.stock_products;
create trigger stock_products_version_history
after insert or update or delete on public.stock_products
for each row execute function public.log_stock_product_version();

create or replace function public.restore_stock_product_version(version_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved jsonb;
  restored_id uuid;
begin
  if not public.is_stock_admin() then
    raise exception 'permission denied';
  end if;

  select snapshot into saved
  from public.stock_product_versions
  where id = version_id;

  if saved is null then
    raise exception 'version not found';
  end if;

  restored_id := (saved ->> 'id')::uuid;
  insert into public.stock_products
  select * from jsonb_populate_record(null::public.stock_products, saved)
  on conflict (id) do update set
    model = excluded.model,
    memory = excluded.memory,
    price = excluded.price,
    condition = excluded.condition,
    color = excluded.color,
    configuration = excluded.configuration,
    description = excluded.description,
    status = excluded.status,
    display_order = excluded.display_order,
    main_image_path = excluded.main_image_path,
    gallery_image_paths = excluded.gallery_image_paths,
    updated_at = now();
  return restored_id;
end;
$$;

revoke all on function public.restore_stock_product_version(bigint) from public, anon;
grant execute on function public.restore_stock_product_version(bigint) to authenticated;

alter table public.admin_users enable row level security;
alter table public.stock_products enable row level security;
alter table public.stock_product_versions enable row level security;
alter table public.stock_write_events enable row level security;

drop policy if exists "admin can read own role" on public.admin_users;
create policy "admin can read own role"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "public can read visible stock" on public.stock_products;
create policy "public can read visible stock"
on public.stock_products for select
to anon, authenticated
using (status in ('on_sale', 'sold'));

drop policy if exists "admins can read all stock" on public.stock_products;
create policy "admins can read all stock"
on public.stock_products for select
to authenticated
using (public.is_stock_admin());

drop policy if exists "admins can insert stock" on public.stock_products;
create policy "admins can insert stock"
on public.stock_products for insert
to authenticated
with check (public.is_stock_admin() and created_by = auth.uid());

drop policy if exists "admins can update stock" on public.stock_products;
create policy "admins can update stock"
on public.stock_products for update
to authenticated
using (public.is_stock_admin())
with check (public.is_stock_admin());

drop policy if exists "admins can delete stock" on public.stock_products;
create policy "admins can delete stock"
on public.stock_products for delete
to authenticated
using (public.is_stock_admin());

drop policy if exists "admins can read stock history" on public.stock_product_versions;
create policy "admins can read stock history"
on public.stock_product_versions for select
to authenticated
using (public.is_stock_admin());

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
revoke all on public.stock_products from anon, authenticated;
grant select on public.stock_products to anon, authenticated;
grant insert, update, delete on public.stock_products to authenticated;
revoke all on public.stock_product_versions from anon, authenticated;
grant select on public.stock_product_versions to authenticated;
revoke all on public.stock_write_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stock-images',
  'stock-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view stock images" on storage.objects;
create policy "public can view stock images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'stock-images');

drop policy if exists "admins can upload stock images" on storage.objects;
create policy "admins can upload stock images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'stock-images'
  and public.is_stock_admin()
  and name ~ '^[0-9a-f-]{36}/(main|gallery)-[0-9]+(-[0-9]+)?\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "admins can replace stock images" on storage.objects;
create policy "admins can replace stock images"
on storage.objects for update
to authenticated
using (bucket_id = 'stock-images' and public.is_stock_admin())
with check (
  bucket_id = 'stock-images'
  and public.is_stock_admin()
  and name ~ '^[0-9a-f-]{36}/(main|gallery)-[0-9]+(-[0-9]+)?\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "admins can delete stock images" on storage.objects;
create policy "admins can delete stock images"
on storage.objects for delete
to authenticated
using (bucket_id = 'stock-images' and public.is_stock_admin());

-- 创建管理员账号后，把下面的 UUID 替换成 Authentication > Users 中该用户的 UUID，
-- 再单独执行这一句。不要把管理员密码写进 SQL 或前端代码。
-- insert into public.admin_users (user_id) values ('替换为管理员用户UUID');

-- 启用 Supabase MFA 后，可把所有管理策略再增加以下条件，强制只有 aal2 会话才能写入：
-- (select auth.jwt() ->> 'aal') = 'aal2'
