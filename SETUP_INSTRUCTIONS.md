# ASSTUDIOHK POS 設定說明

## 1. Supabase 資料庫

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 開啟你的專案（或新建專案）
3. 進入 **SQL Editor**
4. 開啟 [`database_migration.sql`](database_migration.sql)，複製整段內容並執行

這會建立 `pos_*` 資料表、示範分類/商品，以及預設管理員（PIN: `1234`）。

若你先前已執行過舊版 migration，請再執行 [`database_migration_patch.sql`](database_migration_patch.sql)（新增 **實收**、**找續**，並移除 `customer_name`、`contact`、`email`）。

## 2. 前端連線

編輯 [`config.js`](config.js)：

```js
const SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};
```

預設已填入 kahoot 測試專案；若使用其他專案請務必修改並在該專案執行 migration。

## 3. 本機預覽

在 `POS[system]` 資料夾啟動靜態伺服器，例如：

```bash
npx serve .
```

瀏覽 `http://localhost:3000/index.html`

## 4. 頁面

| 檔案 | 說明 |
|------|------|
| `index.html` | 主 POS（Sale / Restock / Return / Damage 等） |
| `manager.html` | 後台資料 CRUD（與 kahoot manager 相同模式） |

## 5. 登入

- 預設員工：**Admin**，PIN：**1234**
- 可在 `manager.html` → 員工 新增更多員工

## 6. 安全提醒

Migration 使用寬鬆 RLS（anon 可讀寫）方便開發。正式營運請改為 Supabase Auth + 嚴格 RLS。
