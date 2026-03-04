# 庫存管理 (Inventory)

## Purpose

即時追蹤商品進出狀況，基於進貨與銷貨明細以計算型方式自動產生庫存資料（唯讀），提供庫存狀態判定與視覺化呈現。

## Requirements

### Requirement: 即時庫存計算
系統 SHALL 提供即時庫存追蹤功能，基於進貨與銷貨資料自動計算商品現存量。

庫存為計算型數據，非獨立儲存，由以下公式得出：
`現存量 = 進貨量（purchaseDetail.sum(quantity)）- 銷貨量（salesDetail.sum(quantity)）`

#### Scenario: 計算所有庫存產品
- **WHEN** 使用者查詢庫存（`GET /api/inventory`）
- **THEN** 系統撈取所有 `isInStock = true` 的產品
- **AND** 以 `purchaseDetail.groupBy(productId)` 計算各產品進貨總量
- **AND** 以 `salesDetail.groupBy(productId)` 計算各產品銷貨總量
- **AND** `currentQty = purchaseQty - salesQty`（`beginningQty` 固定為 0）

#### Scenario: 庫存狀態判定
- **WHEN** 系統計算出現存量
- **THEN** 依以下規則判定狀態：
  - `currentQty < 0` → 「不足」
  - `currentQty < 10` → 「偏低」
  - `currentQty > 1000` → 「過多」
  - 其他 → 「正常」

#### Scenario: 庫存狀態視覺呈現
- **WHEN** 前端顯示庫存列表
- **THEN** 各狀態以不同圖示顯示：正常🟢、偏低🟠、不足🔴、過多🔵
- **AND** 負數量以紅色、小於 10 以橘色顯示

### Requirement: 庫存查詢介面
系統 SHALL 提供庫存查詢的唯讀列表介面。

#### Scenario: 庫存列表顯示
- **WHEN** 使用者瀏覽庫存頁面
- **THEN** 系統顯示所有庫存產品的列表
- **AND** 欄位包含：序號、產品名稱、倉庫位置、期初量、進貨量、銷貨量、現存量、狀態
- **AND** 提供搜尋框篩選

### Requirement: 庫存數據特性
系統的庫存計算 SHALL 具備以下特性。

#### Scenario: 不區分進貨單狀態
- **WHEN** 系統計算進貨量
- **THEN** 加總所有 purchaseDetail 的 quantity，不區分進貨單狀態（含待入庫）

#### Scenario: 期初庫存為零
- **WHEN** 系統計算庫存
- **THEN** `beginningQty` 固定為 0，不支援期初庫存設定
