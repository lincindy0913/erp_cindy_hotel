# 發票登錄/核銷管理 (Sales / Invoice)

## Purpose

管理銷貨發票登錄與核銷完整流程，將進貨品項與發票連結，支援未核銷品項篩選、發票資訊填寫（含營業稅自動計算與金額驗證）、發票抬頭管理、廠商折讓，以及核銷狀態追蹤。

## Requirements

### Requirement: 銷貨主檔管理
系統 SHALL 提供銷貨主檔（SalesMaster）完整 CRUD 管理功能，記錄發票登錄與核銷資訊。

銷貨主檔資料模型包含：銷貨單號（唯一自動產生）、發票號碼、發票日期、發票抬頭、稅別（應稅/零稅率/免稅）、發票金額、廠商折讓、金額、稅額、總金額、狀態。

#### Scenario: 建立銷貨單（發票登錄）
- **WHEN** 使用者輸入發票資訊（發票號碼與品項列表為必填）
- **THEN** 系統自動產生銷貨單號，格式為 `INV-YYYYMMDD-XXXX`
- **AND** 預設狀態為「待核銷」
- **AND** 若未提供 totalAmount，系統自動計算 `amount + tax`

#### Scenario: 銷貨單號自動產生
- **WHEN** 系統產生新銷貨單號
- **THEN** 格式為 `INV-YYYYMMDD-XXXX`
- **AND** XXXX 為當日已建銷貨單數量 + 1，以 4 位數零填充

#### Scenario: 查詢銷貨單列表
- **WHEN** 使用者查詢銷貨單（`/api/sales`）
- **THEN** 系統回傳所有銷貨主檔，包含明細，依 ID 升冪排序

#### Scenario: 查詢銷貨單含詳細資訊
- **WHEN** 使用者查詢含詳細資訊的銷貨單（`/api/sales/with-info`）
- **THEN** 系統回傳銷貨主檔、明細、以及透過明細反查的進貨資訊與廠商名稱

#### Scenario: 查詢未付款銷貨單
- **WHEN** 使用者查詢未付款銷貨單（`/api/sales/unpaid`）
- **THEN** 系統回傳狀態非「已核銷」之外的需付款發票

#### Scenario: 更新銷貨單
- **WHEN** 使用者修改銷貨單
- **THEN** 系統更新銷貨主檔及明細

#### Scenario: 刪除銷貨單
- **WHEN** 使用者刪除銷貨單
- **THEN** 系統移除銷貨主檔（cascade 刪除明細）

### Requirement: 銷貨明細管理
系統 SHALL 提供銷貨明細（SalesDetail）管理功能，記錄核銷品項並保留進貨溯源資訊。

銷貨明細以反正規化方式存儲進貨資訊：purchaseItemId、purchaseId、purchaseNo、purchaseDate、warehouse、supplierId、productId、quantity、unitPrice、note、subtotal。

#### Scenario: 核銷進貨品項
- **WHEN** 使用者勾選未核銷的進貨品項
- **THEN** 系統建立銷貨明細，保留完整進貨溯源資訊
- **AND** 支援多選（checkbox 勾選）與全選/取消全選

### Requirement: 未核銷進貨品項查詢
系統 SHALL 提供未核銷進貨品項查詢功能，供發票核銷流程使用。

#### Scenario: 篩選未核銷品項
- **WHEN** 使用者指定進貨年月、廠商、館別進行查詢
- **THEN** 系統回傳符合條件且尚未被任何銷貨單核銷的進貨品項（`/api/purchasing/uninvoiced`）
- **AND** 已被核銷的品項不顯示

### Requirement: 發票資訊管理
系統 SHALL 提供完整的發票資訊欄位管理。

#### Scenario: 發票基本資訊
- **WHEN** 使用者填寫發票
- **THEN** 系統提供以下欄位：發票號碼、發票日期、發票抬頭、稅別、發票金額

#### Scenario: 營業稅自動計算
- **WHEN** 稅別為「應稅」
- **THEN** 系統自動以 5% 計算營業稅
- **WHEN** 稅別為「零稅率」或「免稅」
- **THEN** 營業稅為 0

#### Scenario: 金額驗證
- **WHEN** 使用者儲存發票
- **THEN** 系統驗證 `銷售金額 + 營業稅 - 廠商折讓 = 發票金額`
- **AND** 若不相等則阻止儲存並顯示錯誤

#### Scenario: 發票抬頭管理
- **WHEN** 使用者管理發票抬頭選項
- **THEN** 預設選項為「麗格大飯店」、「麗軒國際大飯店」
- **AND** 支援新增/刪除自訂抬頭

### Requirement: 進貨單號跳轉
系統 SHALL 支援從發票頁面跳轉至進貨單編輯頁面。

#### Scenario: 點擊進貨單號跳轉
- **WHEN** 使用者在發票頁面點擊進貨單號
- **THEN** 系統跳轉至 `/purchasing?editPurchaseNo=xxx`

### Requirement: 連續新增支援
系統 SHALL 在儲存發票後提供連續新增選項。

#### Scenario: 儲存後連續新增
- **WHEN** 發票儲存成功
- **THEN** 系統以 confirm 對話框詢問是否繼續新增
- **AND** 確認後清空表單供下一筆輸入
