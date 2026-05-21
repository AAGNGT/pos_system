# ASSTUDIOHK POS

三欄式零售 POS（Sale / Restock / Return / Damage + 管理後台），資料儲存於 Supabase。

## 快速開始

1. 執行 [`database_migration.sql`](database_migration.sql)（Supabase SQL Editor）
2. 確認 [`config.js`](config.js) 指向正確專案
3. 開啟 [`index.html`](index.html)（建議用本地靜態伺服器）
4. 登入：**Admin** / PIN **1234**

## 測試清單

- [ ] 分類 pill 篩選（All / 許願球 / 紀念品 / 鎖匙扣）
- [ ] Sale：加入購物車、調整數量、折扣、Charge 結帳
- [ ] 結帳後庫存減少、`pos_orders` 有記錄
- [ ] Restock：選商品、輸入數量、庫存增加
- [ ] Return / Damage：庫存異動正確
- [ ] History / Dashboard / EOD 有資料
- [ ] Settings 可儲存
- [ ] Dark Mode 切換
- [ ] Logout 後需重新登入
- [ ] [`manager.html`](manager.html) 可 CRUD 各表

## 檔案

| 路徑 | 說明 |
|------|------|
| `index.html` | 主 POS |
| `manager.html` | 資料管理 |
| `SETUP_INSTRUCTIONS.md` | 詳細設定 |

Powered by **ASSTUDIOHK**
