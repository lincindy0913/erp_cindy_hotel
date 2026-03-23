# 非同步任務：重試、死信與告警

> 解決「通知、排程、匯入匯出、第三方 API 失敗卻沒人知道」的問題。

## 1. 設計原則

1. **同步 API 只負責受理**：回傳 `jobId` 或 `batchId`，長時間工作丟給 **Worker / 佇列**。  
2. **每個任務有狀態**：`pending` → `processing` → `completed` | `failed`，並記錄 `attempts`、`lastError`。  
3. **冪等**：同一業務鍵（例如 `notification:{userId}:{date}`）重送不應重複副作用。  
4. **重試**：對 **網路逾時、429、5xx** 使用指數退避；對 **4xx 業務錯誤** 通常不重試，改人工。  
5. **死信（DLQ）**：超過最大重試 → `failed`，進入後台可 **一鍵重送** 並寫審計。

## 2. 技術選型（由簡到繁）

| 階段 | 作法 |
|------|------|
| **MVP** | DB 表 `AsyncJob` + `node scripts/scheduler.mjs` 或 cron 輪詢 `pending` |
| **成長** | Redis + BullMQ / 雲端 Cloud Tasks、SQS |
| **觀測** | 結構化 log + `traceId` + 佇列深度 metric |

本專案目前已有 **`scripts/scheduler.mjs`** 與 **`scripts/backup-worker.mjs`**，新增第三方呼叫時建議：

- 不要只在 `setTimeout` 內 `fetch`；改為 **寫入 job 表** 或由佇列消費。  
- 失敗時 **更新 job 狀態**，而非只 `console.error`。

## 3. 告警門檻（建議）

| 指標 | 門檻 | 動作 |
|------|------|------|
| `failed` 任務數（1h） | > N | LINE / Slack Webhook |
| 佇列深度 | > M 超過 10 分鐘 | 通知 on-call |
| 備份未成功 | 超過 24h 無 `completed` | 見備份手冊 |

實作可為：每分鐘 cron 查 DB 或呼叫監控 API，超標則 `POST` 到 Webhook。

## 4. 匯入 / 匯出

- **匯入**：批次表保存每列錯誤原因；完成後通知上傳者；支援 **重新處理失敗列**。  
- **匯出**：大檔非同步；提供 **下載連結過期時間** 與 **job 狀態查詢**。

## 5. 實作待辦（給開發）

- [ ] 定義共用 `AsyncJob`（或沿用現有 domain 表擴充狀態欄位）  
- [ ] 第三方呼叫統一包一層：`fetchWithRetry` + 記錄 status / body 摘要  
- [ ] 管理後台：依狀態篩選、重送、顯示 `lastError`  
- [ ] 環境變數：`ALERT_WEBHOOK_URL`（可選）

將上述待辦納入 sprint 時，請標註 **與 RTO 相關的任務優先**。
