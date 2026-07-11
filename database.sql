-- 卍物所 — Supabase schema
-- Run in Supabase SQL Editor, then enable RLS policies below.

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

-- RLS
alter table public.wanwu_products enable row level security;
alter table public.wanwu_market_reservations enable row level security;
alter table public.wanwu_art_submissions enable row level security;

drop policy if exists "wanwu_products_public_read" on public.wanwu_products;
create policy "wanwu_products_public_read"
    on public.wanwu_products for select to anon, authenticated using (is_available = true);

drop policy if exists "wanwu_market_reservations_insert" on public.wanwu_market_reservations;
create policy "wanwu_market_reservations_insert"
    on public.wanwu_market_reservations for insert to anon, authenticated with check (true);

drop policy if exists "wanwu_art_submissions_insert" on public.wanwu_art_submissions;
create policy "wanwu_art_submissions_insert"
    on public.wanwu_art_submissions for insert to anon, authenticated with check (true);

-- 香磚 • 寧磚系列 seed（新表直接 insert；舊表請先清空或改 name 避免重複）
insert into public.wanwu_products (name, description, price, category, series, shape, tagline, sort_order, image_url)
values
    (
        '寧磚 · 貓爪',
        '天然石膏擴香石，貓爪造型。柔軟陪伴，靜置書桌或床頭，滴幾滴精油，寧靜緩緩釋放。',
        168, '香磚', '香磚 • 寧磚', '貓爪', '柔軟陪伴，靜置桌角', 1, null
    ),
    (
        '寧磚 · 玫瑰',
        '天然石膏擴香石，玫瑰造型。綻放溫柔，適合禮物或梳妝台，承載木質或花香精油。',
        168, '香磚', '香磚 • 寧磚', '玫瑰', '綻放溫柔，留駐日常', 2, null
    ),
    (
        '寧磚 · 太陽花',
        '天然石膏擴香石，太陽花造型。明朗希望，置於玄關或窗台，迎接每一個出發與歸來。',
        168, '香磚', '香磚 • 寧磚', '太陽花', '明朗希望，向光而生', 3, null
    ),
    (
        '限量聯名禮盒',
        '畫家授權作品印制於寧磚與明信片，每款各一件，附署名卡。呼應萬有可能的創作精神。',
        328, '禮盒', '香磚 • 寧磚', null, '獨特收藏，限量發行', 4, null
    );
