# ASSTUDIOHK POS 設定說明

## 1. Supabase 資料庫

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 開啟你的專案（或新建專案）
3. 進入 **SQL Editor**
4. 開啟 [`database_migration.sql`](database_migration.sql)，複製整段內容並執行

這會建立 `pos_*` 資料表、示範分類/商品，以及預設管理員（PIN: `1234`）。

若你先前已執行過舊版 migration，請再執行 [`database_migration_patch.sql`](database_migration_patch.sql)（新增 **實收**、**找續**、**客戶顯示屏狀態表**，並移除 `customer_name`、`contact`、`email`）。

### 啟用客戶顯示屏 Realtime（必須）

1. Supabase Dashboard → **Database** → **Replication**
2. 找到 `pos_display_state`，開啟 **Realtime**
3. 若客戶屏不會即時更新，請確認此項已啟用

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
| `display.html` | **客戶顯示屏**（第二螢幕／平板全螢幕） |
| `manager.html` | 後台資料 CRUD（與 kahoot manager 相同模式） |

## 4.1 客戶顯示屏使用

1. 在第二螢幕或平板開啟 `display.html`（收銀台側欄 → **客戶顯示屏**）
2. 建議按 F11 全螢幕
3. 收銀台加購物車時，客戶屏即時顯示商品與金額
4. 按 **結帳** → 客戶屏顯示應付金額
5. 按 **確認收款** → 顯示多謝惠顧、實收、找續（約 8 秒後回到歡迎畫面）

## 5. 登入

- 預設員工：**Admin**，PIN：**1234**
- 可在 `manager.html` → 員工 新增更多員工

## 6. 安全提醒

Migration 使用寬鬆 RLS（anon 可讀寫）方便開發。正式營運請改為 Supabase Auth + 嚴格 RLS。
