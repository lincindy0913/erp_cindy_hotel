# 館別營運指標與採購預算分析 — 設計建議

## 一、需求摘要

1. **各館營運指標分析**：利用 住宿人數、早餐人數、住宿間數 做館別比較與趨勢分析。
2. **每月採購量是否超標**：設定預算／目標，掌握實際採購是否超過、並可預警。

---

## 二、資料面建議

### 2.1 營運指標（住宿／早餐／間數）

目前 PMS 匯入批次（`PmsImportBatch`）已有：
- `roomCount`（房間數）
- `occupancyRate`（住房率）
- `avgRoomRate`、`roomRevenue`

**建議擴充**（二擇一或並存）：

| 方案 | 作法 | 優點 |
|------|------|------|
| **A** | 在 `PmsImportBatch` 新增欄位 | 與既有匯入流程一致，不需新表 |
| **B** | 新增 `PmsDailyStats` 每日營運統計表 | 可手動補登、與匯入批次脫鉤，彈性大 |

**建議欄位（方案 A 擴充 PmsImportBatch）**：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `guestCount` | Int? | 住宿人數（當日住客數） |
| `breakfastCount` | Int? | 早餐人數 |
| `occupiedRooms` | Int? | 住宿間數（若與 roomCount 語意不同可並存；否則用 roomCount 即可） |

- 若 Excel 匯入檔已有「住宿人數」「早餐人數」等欄，在 **PMS 收入 → 解析 Excel** 時一併帶入並寫入上述欄位。
- 若目前沒有，可在 **PMS 收入** 或 **分析** 頁提供「每日營運數據」手動登錄（依館別、日期），再寫入同一批次的擴充欄位或 `PmsDailyStats`。

**方案 B 範例（獨立每日統計表）**：

```prisma
model PmsDailyStats {
  id              Int      @id @default(autoincrement())
  warehouse       String   @db.VarChar(100)   // 館別
  businessDate    String   @map("business_date") @db.VarChar(20)  // YYYY-MM-DD
  guestCount      Int?     @map("guest_count")   // 住宿人數
  breakfastCount  Int?     @map("breakfast_count") // 早餐人數
  occupiedRooms   Int?     @map("occupied_rooms")  // 住宿間數（可與 roomCount 二擇一）
  roomCount       Int?     @map("room_count")     // 總房間數（當日可用房數）
  note            String?  @db.VarChar(500)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([warehouse, businessDate])
  @@index([warehouse])
  @@index([businessDate])
  @@map("pms_daily_stats")
}
```

- 若採用 **方案 B**，分析時以 `PmsDailyStats` 為主，可再與 `PmsImportBatch` 的 roomCount / occupancyRate 對照或合併顯示。

### 2.2 採購預算／目標（掌握是否超標）

目前系統**沒有**「採購預算」或「採購目標」的結構，建議新增：

```prisma
model ProcurementBudget {
  id          Int      @id @default(autoincrement())
  warehouse   String?  @db.VarChar(100)   // 館別，null 表示全公司
  yearMonth   String   @map("year_month") @db.VarChar(7)  // 2026-03
  budgetAmount Decimal @map("budget_amount") @db.Decimal(14, 2)  // 預算金額
  note        String?  @db.VarChar(500)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([warehouse, yearMonth])
  @@index([yearMonth])
  @@map("procurement_budgets")
}
```

- **實際採購量**：沿用既有 `PurchaseMaster`（可依 `purchaseDate`、`warehouse` 彙總）。
- **是否超標**：當月實際採購金額 vs `ProcurementBudget.budgetAmount`，可計算 達成率 / 超標金額 / 超標比例。

---

## 三、分析功能建議

### 3.1 館別營運比較（住宿人數、早餐人數、住宿間數）

- **資料來源**：`PmsImportBatch` 擴充欄位 或 `PmsDailyStats`（依採用方案）。
- **維度**：館別、日／週／月。
- **建議報表／圖表**：
  1. **館別比較表**：選定區間（如本月、本季），各館的 住宿人數、早餐人數、住宿間數 合計或平均，可排序。
  2. **趨勢圖**：單館或全館的 住宿人數／早餐人數／住宿間數 依日或依月折線圖。
  3. **衍生指標**（可選）：
     - 早餐率 = 早餐人數 / 住宿人數
     - 平均每房住客數 = 住宿人數 / 住宿間數
  4. **與收入的交叉**：同一區間各館的 roomRevenue 或 PMS 收入，與 住宿人數／間數 並列，方便看「每房／每人」貢獻。

**API 建議**：
- `GET /api/analytics/occupancy-stats?startDate=&endDate=&warehouse=&groupBy=day|month`  
  回傳依館別、日或月彙總的 住宿人數、早餐人數、住宿間數（及可選的 roomCount、occupancyRate）。

### 3.2 每月採購量是否超標

- **資料來源**：
  - 實際：`PurchaseMaster`（依 `purchaseDate` 所屬月份、`warehouse` 彙總）。
  - 目標：`ProcurementBudget`（同館別、同年月）。
- **邏輯**：
  - 當月實際採購金額 vs 當月預算金額。
  - 超標 = 實際 > 預算；可算 達成率(%)、超標金額、超標率(%)。
- **建議報表**：
  1. **月度採購 vs 預算表**：欄位例如 館別、年月、預算、實際、差異、達成率、是否超標。
  2. **超標警示**：列出「當月超標」的館別或總計，並可搭配簡單門檻（例如超標 > 10% 標示為警示）。
  3. **趨勢**：各月「實際 vs 預算」長條圖或折線圖，方便看整年是否穩定在預算內。

**API 建議**：
- `GET /api/analytics/procurement-budget?yearMonth=&warehouse=`  
  回傳該月、該館（或全部）的預算、實際、差異、達成率、是否超標。
- 預算的 CRUD：`GET/POST/PUT/DELETE /api/settings/procurement-budgets`（或放在既有設定或分析模組）。

---

## 四、操作流程建議

### 4.1 營運指標（住宿／早餐／間數）

1. **資料取得**  
   - 若 PMS 或報表 Excel 已有 住宿人數、早餐人數、住宿間數：在 **PMS 收入** 匯入時一併解析並寫入 `PmsImportBatch` 或 `PmsDailyStats`。  
   - 若沒有：在 **分析** 或 **PMS 收入** 提供「每日營運數據」表單，依 館別 + 日期 登錄。

2. **分析使用**  
   - 在 **分析** 頁新增分頁「館別營運比較」：選擇區間、館別、群組（日/月），顯示比較表與趨勢圖，並可匯出。

### 4.2 採購預算與超標掌握

1. **設定預算**  
   - 在 **設定** 或 **分析** 新增「採購預算」：選擇 館別（或全公司）、年月、預算金額，存檔。

2. **每月檢視**  
   - 在 **分析** 頁新增分頁「採購預算」：選擇月份（及館別），顯示 預算 vs 實際、是否超標、超標金額/比例。  
   - 可搭配儀表板或通知：當月累計採購超過預算時顯示警示（例如在首頁或分析頁頂端）。

---

## 五、實作優先順序建議

| 階段 | 項目 | 說明 |
|------|------|------|
| **1** | 採購預算表 + 設定 CRUD + 分析 API | 先能「設定預算」與「看當月是否超標」，效益最直觀 |
| **2** | 分析頁「採購預算」分頁 | 表列月度預算 vs 實際、超標警示、可選趨勢圖 |
| **3** | PmsImportBatch 擴充 或 PmsDailyStats | 依資料來源決定用擴充或新表，並接好 PMS 匯入或手動登錄 |
| **4** | 館別營運比較 API + 分析頁分頁 | 住宿人數、早餐人數、住宿間數 館別比較與趨勢 |
| **5** | 進階：每人/每房採購、早餐率等 | 營運指標與採購的交叉分析、衍生指標 |

若您希望先做「採購預算」或先做「館別營運比較」，可指定優先順序，再依此拆成具體的 schema 變更、API 與畫面規格逐步實作。
