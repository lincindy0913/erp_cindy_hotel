# 進銷存暨營運決策分析系統

## 📋 專案簡介

本系統是一套整合進銷存、財務對帳與決策分析的企業資源規劃(ERP)系統，採用 OpenSpec 規範驅動開發。

## 🏗️ 系統架構

### 五層模組化設計

1. **主資料層** - 產品、廠商、客戶基礎資料管理
2. **交易層** - 進貨與銷貨交易流程
3. **財務層** - 發票與付款對帳管理
4. **庫存層** - 即時庫存追蹤與自動更新
5. **分析層** - 歷史價格、比價分析、部門支出、儀表板

## 📁 專案結構

```
erp/
├── src/
│   ├── data/
│   │   └── definitions.js          # 資料結構定義
│   ├── services/
│   │   ├── master-data-service.js   # 主資料服務
│   │   ├── purchasing-service.js    # 進貨服務
│   │   ├── sales-service.js         # 銷貨服務
│   │   ├── inventory-service.js     # 庫存服務
│   │   ├── finance-service.js       # 財務服務
│   │   └── analytics-service.js     # 分析服務
│   └── tests/
│       └── inventory-test.js        # 測試檔案
├── openspec/
│   ├── project.md                   # 專案文件
│   └── changes/
│       └── initial-inventory-system/ # 初始建置變更提案
└── README.md
```

## 🚀 快速開始

### 安裝依賴

```bash
npm install
```

### 執行測試

```bash
npm test                 # Vitest：單元 + API 路由測試（與 CI 一致）
npm run test:watch       # 開發時監聽模式
npm run test:regression  # Lint + Vitest（發 PR 前建議）
npm run test:e2e         # Playwright 煙霧（會 build 並起 production server，首次較久）

# 既有腳本（若專案中仍存在）
node src/tests/inventory-test.js
```

### 營運、備份還原與 UAT

- 備份／還原演練、災難復原、非同步任務重試與告警、UAT 清單、發布流程、報表追溯等：**[`docs/operational-excellence/README.md`](docs/operational-excellence/README.md)**
- 備份檔快速檢查：`npm run verify-backup-file -- path/to/backup.sql.gz`

## 📊 核心功能

### 1. 主資料管理

- ✅ 產品主檔管理
- ✅ 廠商資料管理
- ✅ 客戶資料管理

**相關任務**: 1.1 - 1.7

### 2. 進貨管理

- ✅ 進貨單建立
- ✅ 進貨明細管理
- ✅ 自動更新庫存
- ✅ 歷史價格記錄

**相關任務**: 2.1 - 2.6

### 3. 銷貨管理

- ✅ 銷貨單建立
- ✅ 銷貨明細管理
- ✅ 自動更新庫存
- ✅ 信用額度檢查
- ✅ 庫存不足警示

**相關任務**: 3.1 - 3.6

### 4. 財務管理

- ✅ 付款紀錄管理
- ✅ 應收帳款計算
- ✅ 部分付款支援
- ✅ 對帳報表

**相關任務**: 4.1 - 4.5

### 5. 庫存管理

- ✅ 即時庫存追蹤
- ✅ 自動計算現存量
- ✅ 庫存警示機制

**相關任務**: 5.1 - 5.6

### 6. 分析功能

- ✅ 歷史價格查詢
- ✅ 供應商比價
- ✅ 部門支出分析
- ✅ 營運儀表板

**相關任務**: 6.1 - 6.10

## 🧪 測試

### 資料驗證

- ✅ 主鍵唯一性測試
- ✅ 外鍵參照完整性測試
- ✅ 進貨後庫存增加測試
- ✅ 銷貨後庫存減少測試
- ✅ 付款金額驗證測試

**相關任務**: 7.1 - 7.8

## 📚 OpenSpec 規範

本專案採用 OpenSpec 進行規範驅動開發：

```bash
# 查看變更提案
openspec show initial-inventory-system

# 驗證規範
openspec validate initial-inventory-system --strict

# 套用變更
openspec apply initial-inventory-system
```

## 🛠️ 技術棧

- **平台**: Excel (初期) → Access/SQL Server (未來)
- **語言**: JavaScript (Node.js)
- **規範**: OpenSpec
- **測試**: 單元測試
- **文件**: Markdown

## 📝 任務進度

根據 `openspec/changes/initial-inventory-system/tasks.md`：

### 已完成
- [x] 主資料層建置（程式碼）
- [x] 進貨模組建置（程式碼）
- [x] 銷貨模組建置（程式碼）
- [x] 財務模組建置（程式碼）
- [x] 庫存模組建置（程式碼）
- [x] 分析模組建置（程式碼）

### 進行中
- [ ] Excel 工作表實作
- [ ] 資料驗證與測試
- [ ] 使用者操作手冊

## 📖 文件

- [專案文件](./openspec/project.md)
- [變更提案](./openspec/changes/initial-inventory-system/proposal.md)
- [設計文件](./openspec/changes/initial-inventory-system/design.md)
- [任務清單](./openspec/changes/initial-inventory-system/tasks.md)
- [UI 設計](./openspec/changes/initial-inventory-system/ui-design.md)

## 🤝 貢獻

本專案採用 OpenSpec 開發流程，所有變更都需通過 OpenSpec 驗證。

## 📄 授權

[授權資訊]

## 📞 聯絡方式

[聯絡資訊]

---

**最後更新**: 2024-01-XX
**版本**: 1.0.0

