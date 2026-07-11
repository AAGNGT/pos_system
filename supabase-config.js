/**
 * 卍物所 — Supabase 專案連線設定
 *
 * ┌─ 請到 Supabase Dashboard 填寫 ─────────────────────────────┐
 * │  Project Settings → API                                      │
 * │    • Project URL  → 貼到下方 url                            │
 * │    • anon public  → 貼到下方 anonKey（可放前端）              │
 * │                                                              │
 * │  ⚠️ 切勿將 service_role key 放入網站或此檔案                 │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 登入／註冊：使用 Supabase Auth（Authentication → auth.users）
 * 唔係喺 wanwu_profiles 或其他資料表自行驗證密碼。
 * wanwu_profiles 只存顯示名稱、電話等擴充資料，關聯 auth.users.id。
 */
const SUPABASE_CONFIG = {
    url: 'https://ysohdkbkhnsyowvzdlvn.supabase.co',
    anonKey: 'sb_publishable_NM8ymgJgh-jYzXZgFYaHGg_w5rNBqSK'
};

/** 是否已填寫有效連線（非佔位符） */
function isSupabaseConfigured() {
    if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return false;
    if (SUPABASE_CONFIG.url.indexOf('YOUR_') !== -1) return false;
    if (SUPABASE_CONFIG.anonKey.indexOf('YOUR_') !== -1) return false;
    return true;
}

/** 全站共用 Supabase client（含 Auth session 設定） */
var _wanwuSupabaseClient = null;

function getSupabaseClient() {
    if (_wanwuSupabaseClient) return _wanwuSupabaseClient;
    if (typeof supabase === 'undefined' || !isSupabaseConfigured()) return null;

    _wanwuSupabaseClient = supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
            auth: {
                detectSessionInUrl: true,
                persistSession: true,
                autoRefreshToken: true,
                flowType: 'pkce'
            }
        }
    );
    return _wanwuSupabaseClient;
}
