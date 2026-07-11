-- 卍物所 — Supabase schema
-- Run in Supabase SQL Editor, then enable RLS policies below.

-- 1. 產品
create table if not exists public.wanwu_products (
    id bigint generated always as identity primary key,
    name text not null,
    description text,
    price numeric(10,2) not null default 0,
    image_url text,
    category text default '擴香石',
    is_available boolean not null default true,
    sort_order integer default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

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

create policy "wanwu_products_public_read"
    on public.wanwu_products for select to anon, authenticated using (is_available = true);

create policy "wanwu_market_reservations_insert"
    on public.wanwu_market_reservations for insert to anon, authenticated with check (true);

create policy "wanwu_art_submissions_insert"
    on public.wanwu_art_submissions for insert to anon, authenticated with check (true);

-- 示範產品（可改或刪）
insert into public.wanwu_products (name, description, price, category, sort_order, image_url)
values
    ('霧岩擴香石 · 初雪', '天然石膏雕刻，緩釋精油香氣，置於書桌或床頭，靜謐如初雪消融。', 168, '擴香石', 1, null),
    ('霧岩擴香石 · 暮砂', '暖灰調礦石肌理，適合木質與柑橘系香氛，為空間留下黃昏的溫度。', 188, '擴香石', 2, null),
    ('霧岩擴香石 · 苔痕', '深綠礦彩點綴，靈感來自雨後苔石，配花香或草本精油尤佳。', 198, '擴香石', 3, null),
    ('限量聯名禮盒', '畫家授權作品印制於擴香石與明信片，每款各一件，附署名卡。', 328, '禮盒', 4, null);
