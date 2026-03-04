# 現金流管理 (Cash Flow)

## Purpose

管理現金帳戶（現金/銀行/代墊款/信用卡）、收支分類、現金流交易（收入/支出/帳戶間移轉）、帳戶餘額自動重算、現金流量報表（按分類彙總收支），以及基於歷史數據的未來 30 日資金預測。

## Requirements

### Requirement: 現金帳戶管理
系統 SHALL 提供現金帳戶（CashAccount）完整 CRUD 管理功能。

帳戶資料模型包含：帳戶序號（唯一，如 P001/B001）、名稱、類型、館別、期初餘額、當前餘額、啟用狀態、備註。

四種帳戶類型：現金、銀行存款、代墊款、信用卡。

#### Scenario: 建立帳戶
- **WHEN** 使用者輸入帳戶資訊（名稱、類型為必填）
- **THEN** 系統建立帳戶
- **AND** `currentBalance` 初始化等於 `openingBalance`（預設 0）
- **AND** `isActive` 固定設為 true
- **AND** 若提供 `accountCode`，系統驗證唯一性

#### Scenario: 帳戶序號自動產生
- **WHEN** 使用者在資金管理頁面新增帳戶
- **THEN** 前端依帳戶類型自動產生序號：P(現金)/B(銀行)/D(信用卡)/E(代墊款) + 3 位數字遞增

#### Scenario: 查詢帳戶列表
- **WHEN** 使用者查詢帳戶
- **THEN** 系統回傳所有帳戶，排序：館別升冪 → 類型升冪 → 名稱升冪
- **AND** Decimal 欄位轉為 Number 型別

#### Scenario: 更新帳戶
- **WHEN** 使用者修改帳戶資訊
- **THEN** 系統更新帳戶資料

#### Scenario: 刪除帳戶
- **WHEN** 使用者刪除帳戶
- **THEN** 系統移除該帳戶記錄

### Requirement: 收支分類管理
系統 SHALL 提供收支分類（CashCategory）CRUD 管理功能。

分類資料模型包含：名稱、類型（收入/支出）、所屬館別、啟用狀態。

#### Scenario: 建立分類
- **WHEN** 使用者新增分類
- **THEN** 系統建立收入或支出分類

#### Scenario: 查詢分類
- **WHEN** 使用者查詢分類
- **THEN** 系統回傳所有分類
- **AND** 前端按類型（收入/支出）分兩張表顯示

#### Scenario: 更新分類
- **WHEN** 使用者修改分類
- **THEN** 系統更新分類資料

#### Scenario: 刪除分類
- **WHEN** 使用者刪除分類
- **THEN** 系統移除該分類記錄

### Requirement: 現金流交易管理
系統 SHALL 提供現金流交易（CashTransaction）管理功能，支援收入、支出、移轉三種交易類型。

交易資料模型包含：交易編號（唯一自動產生）、交易日期、類型、館別、帳戶 ID、分類 ID、廠商 ID、付款單號、金額、手續費、是否有手續費、會計科目、付款條件、說明、移轉目標帳戶 ID、配對交易 ID、狀態。

#### Scenario: 建立收入/支出交易
- **WHEN** 使用者建立收入或支出交易（transactionDate、type、accountId、amount 為必填，amount > 0）
- **THEN** 系統驗證 type 為「收入」/「支出」/「移轉」之一
- **AND** 自動產生交易編號，格式為 `CF-YYYYMMDD-XXXX`
- **AND** 建立交易記錄
- **AND** 重新計算帳戶餘額

#### Scenario: 建立移轉交易
- **WHEN** 使用者建立移轉交易
- **THEN** 必須提供 `transferAccountId`，且不可等於 `accountId`
- **AND** 系統在 `$transaction` 內建立 2 筆配對交易：一筆「移轉」（出）、一筆「移轉入」（入）
- **AND** 兩筆交易透過 `linkedTransactionId` 互相指向
- **AND** 重新計算兩個帳戶的餘額

#### Scenario: 帳戶餘額重算
- **WHEN** 交易建立、更新或刪除後
- **THEN** 系統從帳戶的 `openingBalance` 開始，加總所有交易（收入/移轉入加、支出/移轉扣、手續費扣）重新計算 `currentBalance`
- **AND** 此為全量重算，非增量更新

#### Scenario: 交易編號自動產生
- **WHEN** 系統產生新交易編號
- **THEN** 格式為 `CF-YYYYMMDD-XXXX`，XXXX 為當日序號自動遞增
- **AND** 移轉入的交易編號嘗試使用移轉出編號 +1

#### Scenario: 查詢交易列表
- **WHEN** 使用者查詢交易（`GET /api/cashflow/transactions`）
- **THEN** 系統回傳交易列表，包含帳戶、分類、移轉目標帳戶的關聯資料
- **AND** 依交易日期降冪、ID 降冪排序
- **AND** 支援篩選：`startDate`、`endDate`、`warehouse`、`type`、`accountId`

#### Scenario: 手續費處理
- **WHEN** 交易設定 `hasFee = true`
- **THEN** 手續費（fee）只在「支出」和「移轉（出帳）」時從帳戶餘額扣除

#### Scenario: 更新交易
- **WHEN** 使用者修改交易
- **THEN** 系統更新交易記錄並重算帳戶餘額

#### Scenario: 刪除交易
- **WHEN** 使用者刪除交易
- **THEN** 系統移除交易記錄並重算帳戶餘額

### Requirement: 現金流量報表
系統 SHALL 提供現金流量報表功能，按日期範圍與館別彙總收支資料。

#### Scenario: 查詢現金流量報表
- **WHEN** 使用者指定 startDate 與 endDate 查詢報表（`GET /api/cashflow/report`，兩者皆必填）
- **THEN** 系統撈取指定期間的收入與支出交易（排除移轉）
- **AND** 按分類 (category) 分組加總收入與支出
- **AND** 計算手續費（僅支出類）
- **AND** `netCashFlow = totalIncome - totalExpense - totalFees`
- **AND** 金額四捨五入至小數第二位
- **AND** 支援 `warehouse` 選填篩選

#### Scenario: 報表前端呈現
- **WHEN** 前端顯示現金流量報表
- **THEN** 顯示 4 張摘要卡片：營業收入、支出、手續費、淨現金流
- **AND** 收入/支出明細含各分類占比

### Requirement: 資金預測
系統 SHALL 提供資金預測功能，基於歷史數據預估未來 30 日現金流。

#### Scenario: 資金預測計算
- **WHEN** 使用者查看資金預測 Tab
- **THEN** 系統計算：目前總餘額、近 30 日收支、日均淨流量
- **AND** 顯示各類帳戶餘額與各館別餘額
- **AND** 預測未來 30 日每日餘額

#### Scenario: 預測狀態判定
- **WHEN** 系統計算預測餘額
- **THEN** 依餘額水準標記狀態：正常、偏低、資金不足
- **AND** 以橫條圖與狀態 badge 視覺化呈現

### Requirement: 現金流頁面佈局
系統 SHALL 提供 5 個 Tab 頁面的統一現金流管理介面。

#### Scenario: Tab 頁面結構
- **WHEN** 使用者瀏覽現金流頁面
- **THEN** 頁面提供 5 個 Tab：帳戶總覽、交易紀錄、類別管理、現金流量表、資金預測
- **AND** 使用 emerald 色系主題
- **AND** 帳戶總覽顯示 4 類帳戶總額卡片（現金/銀行/代墊款/信用卡）
