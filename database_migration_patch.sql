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

-- 客戶顯示屏即時狀態
create table if not exists public.pos_display_state (
  id integer primary key default 1 check (id = 1),
  session_key text not null default 'main',
  phase text not null default 'idle' check (phase in ('idle', 'cart', 'checkout', 'thankyou')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  amount_received numeric(10,2) not null default 0,
  change_amount numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.pos_display_state (id, session_key, phase, items) values
  (1, 'main', 'idle', '[]'::jsonb)
on conflict (id) do nothing;

alter table public.pos_display_state enable row level security;

drop policy if exists public_read_all_pos_display_state on public.pos_display_state;
drop policy if exists public_write_all_pos_display_state on public.pos_display_state;
drop policy if exists public_update_all_pos_display_state on public.pos_display_state;
drop policy if exists public_delete_all_pos_display_state on public.pos_display_state;
create policy public_read_all_pos_display_state on public.pos_display_state for select using (true);
create policy public_write_all_pos_display_state on public.pos_display_state for insert with check (true);
create policy public_update_all_pos_display_state on public.pos_display_state for update using (true) with check (true);
create policy public_delete_all_pos_display_state on public.pos_display_state for delete using (true);

commit;

-- 重要：到 Supabase Dashboard → Database → Replication，啟用 pos_display_state 的 Realtime
