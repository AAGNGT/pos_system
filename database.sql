-- 卍物所 — Supabase schema
-- Run in Supabase SQL Editor, then enable RLS policies below.
--
-- 身份認證：由 Supabase Auth（auth.users）負責，唔在此 SQL 建立登入表。
-- wanwu_profiles 僅為 Auth 用戶的擴充資料（顯示名稱、電話），id = auth.users.id。
-- 1. 產品
create table if not exists public.wanwu_products (
    id bigint generated always as identity primary key,
    name text not null,
    description text,
    price numeric(10,2) not null default 0,
    image_url text,
    category text default '香磚',
    series text default '香磚 • 寧磚',
    shape text,
    tagline text,
    is_available boolean not null default true,
    sort_order integer default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 若表已存在，追加欄位（可單獨執行）
-- alter table public.wanwu_products add column if not exists series text default '香磚 • 寧磚';
-- alter table public.wanwu_products add column if not exists shape text;
-- alter table public.wanwu_products add column if not exists tagline text;

-- 2. 維園市集即場預訂
create table if not exists public.wanwu_market_reservations (
    id bigint generated always as identity primary key,
    customer_name text not null,
    phone text not null,
    email text,
    pickup_date date not null,
    product_interest text,
    quantity integer default 1,
    notes text,
    status text not null default 'pending',
    user_id uuid references auth.users(id),
    created_at timestamptz not null default now()
);

-- 3. 畫家投稿
create table if not exists public.wanwu_art_submissions (
    id bigint generated always as identity primary key,
    artist_name text not null,
    email text not null,
    phone text,
    work_title text not null,
    work_description text,
    medium text,
    portfolio_url text,
    image_url text,
    preferred_products text,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

-- 4. 會員訂單（登入用戶快速預訂 — 聯絡資料由 Auth / profile 自動帶入）
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

-- 5. 用戶資料（Supabase Auth 關聯）
create table if not exists public.wanwu_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    phone text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- RLS
alter table public.wanwu_products enable row level security;
alter table public.wanwu_market_reservations enable row level security;
alter table public.wanwu_orders enable row level security;
alter table public.wanwu_art_submissions enable row level security;
alter table public.wanwu_profiles enable row level security;

drop policy if exists "wanwu_products_public_read" on public.wanwu_products;
create policy "wanwu_products_public_read"
    on public.wanwu_products for select to anon, authenticated using (is_available = true);

drop policy if exists "wanwu_market_reservations_insert" on public.wanwu_market_reservations;
create policy "wanwu_market_reservations_insert"
    on public.wanwu_market_reservations for insert to anon, authenticated with check (true);

drop policy if exists "wanwu_art_submissions_insert" on public.wanwu_art_submissions;
create policy "wanwu_art_submissions_insert"
    on public.wanwu_art_submissions for insert to anon, authenticated with check (true);

drop policy if exists "wanwu_profiles_select_own" on public.wanwu_profiles;
create policy "wanwu_profiles_select_own"
    on public.wanwu_profiles for select to authenticated
    using (id = auth.uid());

drop policy if exists "wanwu_profiles_update_own" on public.wanwu_profiles;
create policy "wanwu_profiles_update_own"
    on public.wanwu_profiles for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

drop policy if exists "wanwu_profiles_insert_own" on public.wanwu_profiles;
create policy "wanwu_profiles_insert_own"
    on public.wanwu_profiles for insert to authenticated
    with check (id = auth.uid());

drop policy if exists "wanwu_orders_insert_own" on public.wanwu_orders;
create policy "wanwu_orders_insert_own"
    on public.wanwu_orders for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists "wanwu_orders_select_own" on public.wanwu_orders;
create policy "wanwu_orders_select_own"
    on public.wanwu_orders for select to authenticated
    using (user_id = auth.uid());

-- 若表已存在，追加欄位（可單獨執行）：
-- alter table public.wanwu_market_reservations add column if not exists user_id uuid references auth.users(id);

-- 會員訂單：插入前自動寫入 user_id 及 profile 聯絡快照
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

    new.customer_name := coalesce(
        nullif(trim(new.customer_name), ''),
        prof.display_name,
        split_part(auth_email, '@', 1),
        '會員'
    );
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

-- 新用戶註冊時自動建立 profile
create or replace function public.handle_new_wanwu_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.wanwu_profiles (id, display_name, avatar_url)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_wanwu on auth.users;
create trigger on_auth_user_created_wanwu
    after insert on auth.users
    for each row execute function public.handle_new_wanwu_user();

-- 已登入用戶可查閱與自己電郵相符的舊版預訂記錄
drop policy if exists "wanwu_reservations_read_own_email" on public.wanwu_market_reservations;
create policy "wanwu_reservations_read_own_email"
    on public.wanwu_market_reservations for select to authenticated
    using (
        email is not null
        and lower(email) = lower(auth.jwt() ->> 'email')
    );

-- 香磚 • 寧磚系列 seed（可重複執行，已存在則跳過）
insert into public.wanwu_products (name, description, price, category, series, shape, tagline, sort_order, image_url)
select '寧磚 · 貓爪', '天然石膏擴香石，貓爪造型。柔軟陪伴，靜置書桌或床頭，滴幾滴精油，寧靜緩緩釋放。', 168, '香磚', '香磚 • 寧磚', '貓爪', '柔軟陪伴，靜置桌角', 1, null
where not exists (select 1 from public.wanwu_products where name = '寧磚 · 貓爪');

insert into public.wanwu_products (name, description, price, category, series, shape, tagline, sort_order, image_url)
select '寧磚 · 玫瑰', '天然石膏擴香石，玫瑰造型。綻放溫柔，適合禮物或梳妝台，承載木質或花香精油。', 168, '香磚', '香磚 • 寧磚', '玫瑰', '綻放溫柔，留駐日常', 2, null
where not exists (select 1 from public.wanwu_products where name = '寧磚 · 玫瑰');

insert into public.wanwu_products (name, description, price, category, series, shape, tagline, sort_order, image_url)
select '寧磚 · 太陽花', '天然石膏擴香石，太陽花造型。明朗希望，置於玄關或窗台，迎接每一個出發與歸來。', 168, '香磚', '香磚 • 寧磚', '太陽花', '明朗希望，向光而生', 3, null
where not exists (select 1 from public.wanwu_products where name = '寧磚 · 太陽花');

insert into public.wanwu_products (name, description, price, category, series, shape, tagline, sort_order, image_url)
select '限量聯名禮盒', '畫家授權作品印制於寧磚與明信片，每款各一件，附署名卡。呼應萬有可能的創作精神。', 328, '禮盒', '香磚 • 寧磚', null, '獨特收藏，限量發行', 4, null
where not exists (select 1 from public.wanwu_products where name = '限量聯名禮盒');
