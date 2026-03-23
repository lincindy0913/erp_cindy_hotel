# 報表追溯性（Report Traceability）

## 已實作（本專案）

### 分析 → 館別損益表（`pnl-by-warehouse`）

- 報表 API：`GET /api/analytics/pnl-by-warehouse`  
  各科目列已帶 **`subjectKey`**（與彙總用鍵相同：有科目代碼用代碼，否則用顯示名稱）。
- **鑽取 API**：`GET /api/analytics/pnl-by-warehouse/drilldown`  
  - 參數：`startDate`、`endDate`、`flowType`=`income`|`expense`、`subjectKey`  
  - 選填：`warehouse`（與報表館別篩選一致）  
  - 特殊值：`warehouse=__NULL__` 表示「未指定館別」（對應 DB `warehouse` 為 null 或空字串），與報表列「未指定館別」一致。
- **畫面**：`app/analytics/page.js` — 點科目**金額**開啟明細彈窗，列出現金流交易編號、日期、帳戶、`sourceType`/`sourceRecordId` 解析後之**來源說明與站內連結**（若有）。
- **共用邏輯**：`lib/pnl-by-warehouse-shared.js`（與主報表相同科目鍵，避免改一邊壞一邊）  
- **來源解析**：`lib/resolve-cash-transaction-source.js`（依 `sourceType` 對應模組路徑；無分錄表時以現金流交易為「單據層」）

> 說明：系統無獨立「總帳分錄」表時，**可追溯終點為 `CashTransaction` + `sourceType`/`sourceRecordId`**；若日後導入傳票明細，可於鑽取列再掛 `journalLineId` 與連結。

## 待擴充（建議優先序）

1. **損益（PMS/進貨/費用）** 舊版 `GET /api/analytics/pnl` — 可加 `drilldown` 至 `PmsIncomeRecord` / `PurchaseMaster` / `Expense`。  
2. **租屋收入月報表** — 鑽取至 `RentalIncome` / `RentalUtilityIncome`。  
3. **現金流列表頁** — 列上直接顯示「來源」連結（重用 `resolve-cash-transaction-source`）。

## 測試

- `tests/unit/pnl-by-warehouse-shared.test.js`  
- `tests/unit/resolve-cash-transaction-source.test.js`
