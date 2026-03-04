# 營運儀表板 (Dashboard)

## Purpose

系統首頁儀表板，提供本月進貨/銷貨/毛利等關鍵營運指標 (KPI) 卡片、進銷貨趨勢概覽、4 個常用功能快捷按鈕，以及最近 10 筆進銷貨交易列表。

## Requirements

### Requirement: KPI 指標卡片
系統 SHALL 在儀表板顯示 4 張 KPI 卡片，呈現本月核心營運指標。

#### Scenario: 本月進貨總額
- **WHEN** 使用者查看儀表板
- **THEN** 系統以當前年月（`YYYY-MM` 字串前綴比對）查詢所有進貨主檔
- **AND** 加總 `totalAmount` 顯示為本月進貨總額
- **AND** 以藍色系卡片呈現

#### Scenario: 本月銷貨總額
- **WHEN** 使用者查看儀表板
- **THEN** 系統以同樣方式查詢所有銷貨主檔並加總 `totalAmount`
- **AND** 以綠色系卡片呈現

#### Scenario: 本月毛利與毛利率
- **WHEN** 使用者查看儀表板
- **THEN** 系統計算毛利 = 銷貨總額 - 銷貨成本
- **AND** 銷貨成本 = 逐筆 `salesDetail.quantity × product.costPrice`（使用產品當前成本價）
- **AND** 毛利率 = `(毛利 / 銷貨總額) × 100`，取小數第二位
- **AND** 以卡片呈現毛利金額與毛利率百分比

#### Scenario: 庫存商品數
- **WHEN** 使用者查看儀表板
- **THEN** 系統計算 `isInStock = true` 的產品總數
- **AND** 以紅色左邊框卡片呈現

### Requirement: 進銷貨趨勢
系統 SHALL 在儀表板顯示本月進銷貨趨勢概覽。

#### Scenario: 趨勢數據
- **WHEN** 使用者查看儀表板
- **THEN** 系統顯示本月進貨筆數與銷貨筆數

### Requirement: 快捷操作按鈕
系統 SHALL 在儀表板提供 4 個常用操作的快捷按鈕。

#### Scenario: 快捷按鈕
- **WHEN** 使用者查看儀表板
- **THEN** 系統顯示 4 個快捷按鈕：新增進貨單、新增銷貨單、查詢庫存、查看報表
- **AND** 點擊後導航至對應頁面

### Requirement: 近期交易列表
系統 SHALL 在儀表板顯示最近的進銷貨交易。

#### Scenario: 近期交易
- **WHEN** 使用者查看儀表板
- **THEN** 系統撈取最近 5 筆銷貨 + 5 筆進貨記錄
- **AND** 合併後依日期降冪排序取前 10 筆
- **AND** 以表格顯示：時間、類型（進貨/銷貨）、單號、金額、狀態

### Requirement: 儀表板錯誤容錯
系統 SHALL 在儀表板 API 發生錯誤時回傳預設零值結構。

#### Scenario: API 錯誤容錯
- **WHEN** Dashboard API 發生任何錯誤
- **THEN** 系統回傳 HTTP 200 與全零的預設結構
- **AND** 不回傳 500 錯誤

### Requirement: 金額格式化
系統 SHALL 統一使用新台幣格式顯示金額。

#### Scenario: 金額顯示格式
- **WHEN** 前端顯示金額
- **THEN** 使用 `NT$` + `toLocaleString()` 或 `toFixed(2)` 格式
- **AND** loading 狀態時顯示 `-`
