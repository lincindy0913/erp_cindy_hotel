# 分析與決策模組 (Analytics)

## Purpose

提供歷史進貨價格趨勢分析、多廠商比價（含最低價標示）、部門支出年度彙整等商業智慧功能，支援成本控制、供應商評估與營運決策。

## Requirements

### Requirement: 歷史價格分析
系統 SHALL 提供歷史進貨價格（PriceHistory）查詢與分析功能。

歷史價格於進貨單建立時自動寫入，資料模型包含：廠商 ID、產品 ID、進貨日期、單價。

#### Scenario: 自動記錄歷史價格
- **WHEN** 進貨單建立成功
- **THEN** 系統為每個有 productId 及 unitPrice 的品項自動建立 PriceHistory 記錄
- **AND** 記錄包含廠商 ID、產品 ID、進貨日期、單價

#### Scenario: 查詢歷史價格
- **WHEN** 使用者查詢歷史價格（`GET /api/price-history`）
- **THEN** 系統回傳價格記錄，包含產品名稱與廠商名稱
- **AND** 依進貨日期降冪排序
- **AND** 支援 `productId` 與 `supplierId` 篩選參數

#### Scenario: 前端價格趨勢顯示
- **WHEN** 使用者在分析頁面選擇產品
- **THEN** 系統顯示該產品最近 10 筆採購價格
- **AND** 以表格呈現日期、供應商、價格

### Requirement: 供應商比價分析
系統 SHALL 提供比價分析（PriceComparison）功能，比較不同廠商提供同一產品的價格。

比價資料使用複合主鍵：productId + supplierId + date。

#### Scenario: 查詢比價資料
- **WHEN** 使用者查詢比價分析（`GET /api/price-comparison`）
- **THEN** 系統回傳所有比價資料，包含產品名稱與廠商名稱
- **AND** 支援 `productId` 篩選
- **AND** 計算每個產品的最低價廠商並標記 `isMinPrice = true`

#### Scenario: 前端最低價標示
- **WHEN** 前端顯示比價表格
- **THEN** 最低價以綠色 badge 標示

### Requirement: 部門支出分析
系統 SHALL 提供部門支出（DepartmentExpense）查詢與分析功能。

部門支出資料模型包含：年、月、部門、類別、稅額、總金額。

#### Scenario: 查詢部門支出
- **WHEN** 使用者查詢部門支出（`GET /api/department-expenses`）
- **THEN** 系統回傳支出記錄
- **AND** 依年月降冪、部門升冪排序
- **AND** 支援 `year` 與 `month` 篩選參數

#### Scenario: 前端年份篩選
- **WHEN** 使用者在分析頁面選擇年份
- **THEN** 系統篩選並顯示該年度的部門支出
- **AND** 以表格呈現年月、部門、類別、稅額、總金額

### Requirement: 分析頁面佈局
系統 SHALL 提供統一的分析報表頁面，整合三大分析功能。

#### Scenario: 分析頁面三區塊
- **WHEN** 使用者瀏覽分析頁面
- **THEN** 頁面分為三大區塊：歷史價格分析、供應商比價、部門支出分析
- **AND** 使用 cyan 色系主題
