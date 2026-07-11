-- 卍物所 — 僅新增 wanwu_orders（前置表已存在時才用）
-- 前提：wanwu_products、wanwu_profiles 已建立
-- 若出現 relation "wanwu_products" does not exist → 請改執行 database-orders.sql（完整版）

create table if not exists public.wanwu_orders (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id bigint references public.wanwu_products(id) on delete set null,
    product_name text not null,
    quantity integer not null default 1 check (quantity > 0 and quantity <= 20),
    unit_price numeric(10,2),
    pickup_date date not null,
    notes text,
    status text not null default 'pending',
    customer_name text not null default '',
    customer_phone text,
    customer_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists wanwu_orders_user_id_idx on public.wanwu_orders (user_id);
create index if not exists wanwu_orders_pickup_date_idx on public.wanwu_orders (pickup_date);

alter table public.wanwu_orders enable row level security;

create or replace function public.wanwu_orders_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    prof public.wanwu_profiles%rowtype;
    auth_email text;
begin
    if auth.uid() is null then
        raise exception '需要登入才能提交訂單';
    end if;
    new.user_id := auth.uid();
    select * into prof from public.wanwu_profiles where id = auth.uid();
    select email into auth_email from auth.users where id = auth.uid();
    new.customer_name := coalesce(nullif(trim(new.customer_name), ''), prof.display_name, split_part(auth_email, '@', 1), '會員');
    new.customer_email := coalesce(nullif(trim(new.customer_email), ''), auth_email);
    new.customer_phone := coalesce(nullif(trim(new.customer_phone), ''), prof.phone);
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists wanwu_orders_before_insert on public.wanwu_orders;
create trigger wanwu_orders_before_insert
    before insert on public.wanwu_orders
    for each row execute function public.wanwu_orders_before_insert();

drop policy if exists "wanwu_orders_insert_own" on public.wanwu_orders;
create policy "wanwu_orders_insert_own"
    on public.wanwu_orders for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists "wanwu_orders_select_own" on public.wanwu_orders;
create policy "wanwu_orders_select_own"
    on public.wanwu_orders for select to authenticated
    using (user_id = auth.uid());
