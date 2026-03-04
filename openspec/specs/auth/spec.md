# 認證與權限管理 (Authentication & Authorization)

## Purpose

管理使用者認證（NextAuth.js JWT 策略）、角色（admin/user）與細粒度功能模組權限控制，保護系統管理頁面，並提供使用者 CRUD 管理功能。支援 DB 優先、demo-users.json fallback 的雙重認證模式。

## Requirements

### Requirement: 使用者認證
系統 SHALL 使用 NextAuth.js 提供 JWT 策略的使用者認證機制。

#### Scenario: 登入流程
- **WHEN** 使用者輸入 email 和 password
- **THEN** 系統優先以 DB 驗證（bcrypt 比對）
- **AND** 若 DB 驗證失敗，fallback 至 demo-users.json（明文比對）
- **AND** 驗證成功回傳 JWT token
- **AND** Session 有效期為 24 小時

#### Scenario: 登入頁面
- **WHEN** 使用者瀏覽登入頁面
- **THEN** 系統顯示居中卡片式登入表單（email + password）
- **AND** 顯示預設管理員帳號提示 `admin@hotel.com`
- **AND** 登入成功後導航至首頁並重新整理

#### Scenario: 登入失敗
- **WHEN** 使用者提供無效的認證資訊
- **THEN** 系統顯示紅色錯誤 banner
- **AND** 不透露具體失敗原因（帳號或密碼）

#### Scenario: 登出
- **WHEN** 使用者點擊登出按鈕
- **THEN** 系統清除 session 並導航至登入頁面

### Requirement: 角色與權限管理
系統 SHALL 提供角色與細粒度權限控制。

支援兩種角色：`admin`（管理員）、`user`（一般使用者）。

權限以 JSON 陣列存儲，包含 10 個功能模組：dashboard、products、suppliers、purchasing、sales、finance、inventory、analytics、expenses、payment-voucher。

#### Scenario: 管理員角色
- **WHEN** 使用者角色為 `admin`
- **THEN** 擁有所有功能模組的存取權限

#### Scenario: 一般使用者角色
- **WHEN** 使用者角色為 `user`
- **THEN** 權限依 `permissions` JSON 陣列中所列的模組而定

### Requirement: 路由保護
系統 SHALL 透過 middleware 保護管理頁面，並在前端控制操作權限。

#### Scenario: Admin 路由保護
- **WHEN** 使用者存取 `/admin/*` 路由
- **THEN** middleware 檢查使用者是否登入
- **AND** 檢查 `token.role === 'admin'`
- **AND** 非 admin 角色 redirect 至 `/unauthorized`

#### Scenario: API 路由保護現況
- **WHEN** 使用者存取 API 路由
- **THEN** 僅 `/api/users` 有 server-side session 驗證
- **AND** 其餘所有 API 路由無 auth 保護（依賴前端控制）

#### Scenario: 前端操作權限控制
- **WHEN** 使用者未登入
- **THEN** 所有頁面仍可瀏覽（唯讀）
- **AND** 新增/編輯/刪除按鈕根據 `isLoggedIn` 狀態隱藏

### Requirement: 使用者管理
系統 SHALL 提供使用者 CRUD 管理功能，僅限管理員存取。

#### Scenario: 使用者列表查詢
- **WHEN** 管理員查詢使用者列表（`GET /api/users`）
- **THEN** 系統驗證 admin 角色（非 admin 回傳 403）
- **AND** 回傳使用者列表：id、email、name、role、permissions、isActive、createdAt
- **AND** 不回傳密碼欄位

#### Scenario: 建立使用者
- **WHEN** 管理員建立使用者（email、password、name 為必填）
- **THEN** 系統驗證 admin 角色
- **AND** 驗證 email 唯一性
- **AND** 密碼以 `bcrypt.hash(password, 10)` 加密儲存
- **AND** 建立使用者記錄

#### Scenario: 更新使用者
- **WHEN** 管理員修改使用者資料
- **THEN** email 不可修改
- **AND** 若密碼欄位留空則不修改密碼
- **AND** 可修改角色、權限、啟用狀態

#### Scenario: 權限 checkbox 介面
- **WHEN** 管理員編輯使用者權限
- **THEN** 系統顯示 10 個權限 checkbox
- **AND** 提供全選/清除功能
- **AND** admin 角色自動擁有所有權限

#### Scenario: Demo 模式 Fallback
- **WHEN** DB 連線失敗
- **THEN** 系統 fallback 至 demo-users.json 進行使用者管理
- **AND** demo 模式使用明文密碼

### Requirement: 預設管理員帳號
系統 SHALL 提供預設管理員帳號供初始存取。

#### Scenario: 預設帳號
- **WHEN** 系統初始化
- **THEN** 預設管理員帳號為 `admin@hotel.com`，密碼為 `admin123`

### Requirement: 導航列認證狀態
系統 SHALL 在全域導航列顯示使用者認證狀態。

#### Scenario: 已登入狀態
- **WHEN** 使用者已登入
- **THEN** 導航列右側顯示使用者名稱
- **AND** 若為 admin 角色，顯示「管理員」badge
- **AND** 顯示登出按鈕

#### Scenario: 未登入狀態
- **WHEN** 使用者未登入
- **THEN** 導航列右側顯示登入按鈕
