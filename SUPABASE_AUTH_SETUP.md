# Supabase Auth 設定指南 — 卍物所

> 登入系統使用 **Supabase Authentication**（`auth.users`），  
> **不是**在 `wanwu_profiles` 或任何自建表儲存／驗證密碼。

---

## 第一步：填寫網站連線

編輯 [`supabase-config.js`](supabase-config.js)：

```javascript
const SUPABASE_CONFIG = {
    url: 'https://你的專案ID.supabase.co',      // Dashboard → Settings → API → Project URL
    anonKey: '你的_anon_public_key'             // Dashboard → Settings → API → anon public
};
```

| 欄位 | 哪裡找 | 可否放前端 |
|------|--------|------------|
| `url` | Project Settings → API → Project URL | 可以 |
| `anonKey` | Project Settings → API → `anon` `public` | 可以 |
| `service_role` | 同頁面 | **絕不可** |

---

## 第二步：Supabase Dashboard — 啟用 Auth

路徑：**Authentication → Providers**

### Email（必開）

1. 啟用 **Email**
2. 建議開啟 **Confirm email**（註冊後需確認電郵）
3. 最低密碼長度：6 字元（預設）

### Google（選用）

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立 OAuth 2.0 Client
2. **Authorized redirect URI** 填：
   ```
   https://你的專案ID.supabase.co/auth/v1/callback
   ```
3. 將 Client ID、Client Secret 貼到 Supabase → Authentication → Google

---

## 第三步：URL 設定（OAuth 回調必須）

路徑：**Authentication → URL Configuration**

| 設定 | 示例 |
|------|------|
| **Site URL** | `https://你的網域.com` 或本機 `http://localhost:5500` |
| **Redirect URLs** | `https://你的網域.com/account.html` |
| | `http://localhost:5500/account.html` |
| | `http://127.0.0.1:5500/account.html` |

Google / 重設密碼完成後會導向 `account.html`。

---

## 第四步：執行資料庫 SQL（profile 擴充，非登入）

在 **SQL Editor** 執行 [`database.sql`](database.sql) 中與 Auth **配套** 的部分：

- `wanwu_profiles` — 只存顯示名稱、電話（`id` = `auth.users.id`）
- Trigger — 新用戶在 **Auth 註冊成功** 後自動建立 profile
- RLS — 用戶只能讀寫自己的 profile、讀取電郵相符的預訂

**不需要**自建 `users` 表或密碼欄位；密碼由 Supabase Auth 管理。

---

## 架構說明

```
用戶按「登入／註冊」
        ↓
  Supabase Auth API（auth.signIn / signUp / signInWithOAuth）
        ↓
  auth.users（Supabase 託管，bcrypt 雜湊密碼）
        ↓
  trigger 自動建立 wanwu_profiles（選填擴充資料）
        ↓
  前端 session（JWT）→ 我的帳戶、讀取預訂等
```

| 功能 | 負責層 |
|------|--------|
| 註冊、登入、Google、重設密碼 | **Supabase Auth** |
| 顯示名稱、電話 | `wanwu_profiles` |
| 產品、預訂、投稿 | 各業務資料表 + RLS |

---

## 本機測試

1. 用 VS Code Live Server 或 `npx serve` 開啟 `website[all-in-one]/`（不要用 `file://` 開 HTML，OAuth 會失敗）
2. 確認 Redirect URLs 已加入本機網址
3. 首頁 → 登入 → Email 註冊或 Google
4. 成功後應進入 `account.html`

---

## 常見問題

**Q：登入後立即跳回首頁？**  
A：檢查 Redirect URLs 是否包含實際網址；本機需用 `http://localhost:端口/account.html`。

**Q：Email 註冊後無法登入？**  
A：到信箱點確認連結；或暫時關閉 Dashboard 的 Confirm email 作測試。

**Q：想換新 Supabase 專案？**  
A：只改 `supabase-config.js` 的 `url` 和 `anonKey`，並在新專案重跑 SQL 與 Auth 設定。

**Q：service_role 金鑰要放哪？**  
A：只放後台腳本或 CI，**不要**放 `supabase-config.js` 或任何前端 HTML。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `supabase-config.js` | 專案 URL + anon key |
| `js/auth.js` | 登入 Modal、OAuth、Session |
| `js/account.js` | 帳戶頁、profile 更新 |
| `database.sql` | profile 表、RLS、trigger |
