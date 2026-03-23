# 備份與還原演練手冊（Backup / Restore Runbook）

> 目標：**證明「還原後系統可用」**，而非僅「備份檔存在」。

## 1. 備份涵蓋範圍

| 資產 | 說明 | 本專案參考 |
|------|------|------------|
| PostgreSQL 全庫 | 業務與設定主體 | `DATABASE_URL`、`scripts/backup-worker.mjs` Tier1 `pg_dump` |
| 應用產生的 JSON/檔案備份 | 若 worker 另有匯出 | `BACKUP_ROOT` 目錄 |
| 附件儲存 | 若存在本機或 S3 | 需另行納入快照策略（本手冊無法自動涵蓋雲端 bucket，請在「災難復原」補連結） |
| 秘密與環境變數 | **勿**明文寫進 DB dump | 使用平台秘密管理（Railway / 1Password / Azure Key Vault 等） |

## 2. 還原前準備

1. **隔離環境**：使用 **Staging 或全新 DB instance**，禁止直接覆蓋正式庫。  
2. **取得備份**：從 `backup-data/` 或雲端儲存下載一份 **近 7 日內隨機一日** 的備份（避免永遠只測最新檔）。  
3. **工具**：已安裝 `psql` / `pg_restore`（或平台提供的還原主控台）。  
4. **環境變數**：Staging 的 `DATABASE_URL` 指向還原目標。

## 3. 還原步驟（PostgreSQL 邏輯備份示例）

以下為常見 `pg_dump` 自訂格式或 plain SQL，依實際副檔名調整：

```bash
# Plain SQL（示例）
psql "$DATABASE_URL" -f backup.sql

# Custom format
pg_restore -d "$DATABASE_URL" --clean --if-exists backup.dump
```

還原後執行：

```bash
npx prisma generate
# 若 schema 與 dump 一致，通常不需 migrate；若有 drift 請依團隊規範處理
npm run build
```

## 4. 還原後驗證（必做）

| 步驟 | 檢查 |
|------|------|
| DB 連線 | `psql` 或 Prisma Studio 可連線 |
| 資料量 | 關鍵表 `COUNT(*)` 與預期數量級一致（非 0、非暴量） |
| 應用 | Staging 指向還原庫後，可登入、開啟一張關鍵報表 |
| 附件 | 隨機抽 3 筆附件可開啟（若附件不在 DB 內） |
| 健康檢查 | `GET /api/health` 回 `status: ok` |

可選：將 Staging 的 base URL 設給監控，每週 ping `/api/health`。

## 5. 備份檔完整性（自動）

在備份產出後或演練前，對單一檔案執行：

```bash
node scripts/verify-backup-archive.mjs path/to/backup.sql.gz
```

（腳本會檢查存在性、大小門檻與 gzip 可讀性。）

## 6. 每月還原演練紀錄表（複製使用）

| 日期 | 備份檔識別 | 環境 | 還原耗時 | DB 驗證 | 應用驗證 | 問題與改善 | 執行人 | 業務確認 |
|------|------------|------|----------|---------|----------|------------|--------|----------|
| YYYY-MM-DD | | Staging | 分鐘 | 通過/否 | 通過/否 | | | |

**簽核原則**：未通過驗證，不視為當月演練完成；須開 issue 追蹤至關閉。

## 7. 常見失敗原因

- 還原到錯誤的 `DATABASE_URL`（誤傷正式）  
- Prisma schema 與 dump 版本不一致  
- 只備份 DB、未備份附件儲存體  
- 備份檔損毀（未做 gzip/ checksum 驗證）

## 8. 與 `backup-worker` 的關係

本專案 `scripts/backup-worker.mjs` 會依設定產出備份並寫入 `BackupRecord`。演練時應 **挑選一筆已 completed 的紀錄對應檔案** 還原，並在驗證通過後於內部 wiki 更新連結。
