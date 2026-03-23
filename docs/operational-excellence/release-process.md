# 發布流程（Release Process）

## 1. 分支策略（建議）

- `main`：可部署正式  
- `develop` 或 short-lived feature branches：開發合併前需 PR + review  
- **Hotfix**：從 `main` 開分支，修完合回 `main` 並 tag

## 2. 標準發布步驟

1. **凍結**：確認無未合併的關鍵 PR。  
2. **Changelog**：列出使用者可見變更與風險。  
3. **CI**：`lint` → Vitest（單元/API）→ `build` → Playwright 煙霧（見 `.github/workflows/ci.yml`）。  
4. **Staging**：部署與正式相同設定（匿名化資料）。  
5. **UAT**：依 [uat-regression-checklist.md](./uat-regression-checklist.md) 執行並簽核。  
6. **備份**：正式 DB（或平台快照）在 **大版本 / 含 migration** 前備份。  
7. **部署正式**：記錄時間與操作人。  
8. **煙霧**：上線後 15 分鐘內跑煙霧測試。  
9. **監控**：檢查錯誤率、5xx、關鍵 API 延遲。

## 3. 回滾

| 情境 | 作法 |
|------|------|
| 僅程式問題 | 重新部署上一個 **已知良好** image / commit |
| DB migration 有問題 | 依團隊規範：**禁止**在無演練下直接 `down`；優先從備份還原至維護窗 |

## 4. Feature Flag（建議）

大功能預設關閉，上線後逐步開啟，降低「一次爆多點」風險。

## 5. 與本 repo 的對應

- 部署說明可併入既有 `RAILWAY-DEPLOY.md` / `SETUP-INSTRUCTIONS.md`  
- CI 定義：`.github/workflows/ci.yml`（含 `npm test` 與 `npx playwright test`）
