# 營運與品質文件（Operational Excellence）

本目錄落實先前討論的：**備份可還原、非同步任務重試與告警、UAT/回歸、發布流程、報表追溯** 等做法，供 IT 與老闆簽核用。

| 文件 | 用途 |
|------|------|
| [backup-restore-runbook.md](./backup-restore-runbook.md) | 備份、每月還原演練、驗證步驟 |
| [disaster-recovery.md](./disaster-recovery.md) | RTO/RPO、聯絡人、災難宣告流程 |
| [async-jobs-retries-alerts.md](./async-jobs-retries-alerts.md) | 通知/排程/第三方 API：佇列、重試、死信、告警 |
| [uat-regression-checklist.md](./uat-regression-checklist.md) | 上線前 UAT 與煙霧測試清單 |
| [release-process.md](./release-process.md) | 分支、Staging、CI、回滾 |
| [report-traceability.md](./report-traceability.md) | 報表數字鑽取至單據/分錄的設計要點 |

## 專案內已提供的自動化

- **備份**：`scripts/backup-worker.mjs`（見既有備份設定與 `BackupConfig`）
- **排程觸發**：`scripts/scheduler.mjs`
- **備份檔基本驗證**：`node scripts/verify-backup-archive.mjs <檔案路徑>`
- **自動回歸**：`npm run test:regression`（lint + Vitest）  
- **單元 / API 測試**：`npm test`（Vitest，見 `tests/unit/`、`tests/api/`）  
- **E2E 煙霧**：`npm run test:e2e`（Playwright，見 `tests/e2e/`）

建議每月在行事曆建立重複事件：**還原演練**，並在 [backup-restore-runbook.md](./backup-restore-runbook.md) 附錄填寫紀錄表。
