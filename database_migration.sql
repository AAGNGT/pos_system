-- ASSTUDIOHK POS：完整重建 SQL（Supabase / Postgres）
-- 請在 Supabase SQL Editor 整段執行一次。
-- MVP：anon 可 CRUD（可運行優先；正式上線請收緊 RLS）

begin;

create extension if not exists pgcrypto;

-- 1) 分類
create table if not exists public.pos_categories (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) 商品
create table if not exists public.pos_products (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  price numeric(10,2) not null default 0,
  image_url text,
  category_id bigint references public.pos_categories(id) on delete set null,
  stock_count integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_products_category on public.pos_products(category_id);
create index if not exists idx_pos_products_code on public.pos_products(code);

-- 3) 員工
create table if not exists public.pos_staff (
  id bigserial primary key,
  display_name text not null,
  role text not null default 'STAFF' check (role in ('ADMIN', 'STAFF')),
  pin text not null default '0000',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4) 訂單主檔
create table if not exists public.pos_orders (
  id bigserial primary key,
  mode text not null default 'sale' check (mode in ('sale', 'restock', 'return', 'damage')),
  payment_method text not null default '現金',
  payment_status text not null default '已支付',
  discount numeric(10,2) not null default 0,
  note text,
  subtotal numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  amount_received numeric(10,2) not null default 0,
  change_amount numeric(10,2) not null default 0,
  staff_id bigint references public.pos_staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_orders_mode on public.pos_orders(mode);
create index if not exists idx_pos_orders_created on public.pos_orders(created_at desc);

-- 5) 訂單明細
create table if not exists public.pos_order_items (
  id bigserial primary key,
  order_id bigint not null references public.pos_orders(id) on delete cascade,
  product_id bigint not null references public.pos_products(id) on delete restrict,
  qty integer not null default 1 check (qty > 0),
  unit_price numeric(10,2) not null default 0,
  line_total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_order_items_order on public.pos_order_items(order_id);

-- 6) 庫存異動
create table if not exists public.pos_inventory_movements (
  id bigserial primary key,
  product_id bigint not null references public.pos_products(id) on delete restrict,
  delta integer not null,
  reason text,
  order_id bigint references public.pos_orders(id) on delete set null,
  staff_id bigint references public.pos_staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_movements_product on public.pos_inventory_movements(product_id);

-- 7) 設定
create table if not exists public.pos_settings (
  id bigserial primary key,
  key text not null unique,
  value text,
  updated_at timestamptz not null default now()
);

-- 8) EOD 報表
create table if not exists public.pos_eod_reports (
  id bigserial primary key,
  report_date date not null unique,
  total_sales numeric(12,2) not null default 0,
  order_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Seed：分類
insert into public.pos_categories (id, name, slug, sort_order) values
  (1, '許願球', 'wish-ball', 1),
  (2, '紀念品', 'souvenir', 2),
  (3, '鎖匙扣', 'keychain', 3)
on conflict (slug) do nothing;

-- Seed：員工（PIN: 1234）
insert into public.pos_staff (id, display_name, role, pin) values
  (1, 'Admin', 'ADMIN', '1234')
on conflict (id) do nothing;

-- Seed：鎖匙扣商品（對應截圖）
insert into public.pos_products (code, name, price, category_id, stock_count, sort_order, image_url) values
  ('KC001', '貓爪皮革 - 深啡', 60.00, 3, 0, 1, ''),
  ('KC002', '貓爪皮革 - 淺啡', 60.00, 3, 0, 2, ''),
  ('KC003', '貓爪皮革 - 黑', 60.00, 3, 0, 3, ''),
  ('KC004', '貓爪皮革 - 紅', 60.00, 3, 0, 4, ''),
  ('KC005', '貓爪皮革 - 藍', 60.00, 3, 0, 5, ''),
  ('KC006', '貓爪皮革 - 綠', 60.00, 3, 0, 6, ''),
  ('KC007', '貓爪皮革 - 黃', 60.00, 3, 0, 7, ''),
  ('KC008', '貓爪皮革 - 白', 60.00, 3, 0, 8, '')
on conflict (code) do nothing;

insert into public.pos_settings (key, value) values
  ('store_name', 'ASSTUDIOHK'),
  ('default_payment', '現金'),
  ('default_sort', 'default')
on conflict (key) do nothing;

-- RLS
alter table public.pos_categories enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_staff enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.pos_inventory_movements enable row level security;
alter table public.pos_settings enable row level security;
alter table public.pos_eod_reports enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'pos_categories','pos_products','pos_staff','pos_orders',
    'pos_order_items','pos_inventory_movements','pos_settings','pos_eod_reports'
  ] loop
    execute format('drop policy if exists public_read_all_%s on public.%s', t, t);
    execute format('drop policy if exists public_write_all_%s on public.%s', t, t);
    execute format('drop policy if exists public_update_all_%s on public.%s', t, t);
    execute format('drop policy if exists public_delete_all_%s on public.%s', t, t);
    execute format('create policy public_read_all_%s on public.%s for select using (true)', t, t);
    execute format('create policy public_write_all_%s on public.%s for insert with check (true)', t, t);
    execute format('create policy public_update_all_%s on public.%s for update using (true) with check (true)', t, t);
    execute format('create policy public_delete_all_%s on public.%s for delete using (true)', t, t);
  end loop;
end $$;

commit;
