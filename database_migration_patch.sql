-- 若已執行過舊版 migration，請在 Supabase SQL Editor 執行此補丁

begin;

-- 結帳欄位（若尚未建立）
alter table public.pos_orders
  add column if not exists amount_received numeric(10,2) not null default 0;

alter table public.pos_orders
  add column if not exists change_amount numeric(10,2) not null default 0;

-- 移除顧客聯絡欄位
alter table public.pos_orders drop column if exists customer_name;
alter table public.pos_orders drop column if exists contact;
alter table public.pos_orders drop column if exists email;

commit;
