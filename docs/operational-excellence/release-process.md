# 發布流程：測試 → 預備 → 正式（Release Process）

## 0. 三個環境定義

| 階段 | 環境名稱 | 目的 | 典型設定 |
|------|----------|------|----------|
| **測試** | Test / CI | 每次 PR、自動化驗證 | GitHub Actions（無真實營業資料） |
| **預備** | Staging / UAT | 與正式**相同版本與設定**，用**匿名化或複本資料**驗收 | 獨立 Railway 服務、或獨立 `DATABASE_URL` |
| **正式** | Production | 真實使用者與資料 | Railway 正式服務、正式網域 |

**原則**：程式進 **正式** 前，必須至少在 **預備** 跑過 UAT；**禁止**跳過預備直接對正式「試錯」。

---

## 1. 分支與程式流動（建議）

```
feature/* ──PR──► develop（可選）──► 部署預備 ──UAT+審批──► main ──► 部署正式
                      │                                      │
                      └────────────── hotfix/* ──────────────┘
```

| 分支 | 說明 |
|------|------|
| `feature/*` | 功能開發，經 PR Code Review 合併 |
| `develop` | 整合分支（若團隊採用）；**預備環境**建議由此分支或 `release/*` 建置 |
| `main` | **僅放已通過 UAT 與審批的版本**；與正式部署 commit 一致 |
| `hotfix/*` | 從 `main` 開出，修畢合回 `main` 並同步 `develop` |

若目前只有 `main`：**短期**可維持直推 `main`，但預備環境仍應用「上一個穩定版 + 候選版」區分；**中期**應拉出 `develop` 或 `release/x.y` 分支。

---

## 2. 關卡（Gate）— 測試 → 預備 → 正式

### 關卡 A：測試（自動）

- PR 觸發 **CI**（`.github/workflows/ci.yml`）：`lint` → `npm test` → `build` → Playwright 煙霧。  
- **未綠燈不得合併**（建議在 GitHub **Branch protection** 開啟「Require status checks」）。

### 關卡 B：預備（UAT）

1. 將**候選版本**部署到 **Staging**（見 `RAILWAY-DEPLOY.md`：可開第二個 Railway 服務指向 `develop` 或手動選 commit）。  
2. 依 [uat-regression-checklist.md](./uat-regression-checklist.md) 執行煙霧 + 本次變更範圍測試。  
3. 填寫 [change-approval-template.md](./change-approval-template.md) 之 **預備／UAT 段落**。

### 關卡 C：正式（變更審批 — **須老闆同意**）

1. 依 [change-approval-template.md](./change-approval-template.md) 完成簽核，其中 **老闆（負責人）同意為強制項目**；業務 UAT、開發負責人亦應簽核。  
2. 執行 **Release gate** workflow：GitHub Environment **`production`** 的 **Required reviewers 應包含老闆（或其授權帳號）**，通過人工核准後，才進行正式部署。  
3. **備份**：大版本或含 schema 變更前，備份正式 DB（見 [backup-restore-runbook.md](./backup-restore-runbook.md)）。  
4. **部署正式**：推送 `main`（若 Railway 連 `main`）或於 Railway 儀表板 **Redeploy** 指定映像／commit。  
5. **上線後 15 分鐘內**：煙霧測試 + 看 log／健康檢查。

---

## 3. 變更審批（誰點頭）

| 變更等級 | 範例 | 建議審批 |
|----------|------|----------|
| **標準** | 小修正、無 DB 結構變更 | 開發負責人 + 1 位業務代表（UAT 勾選） |
| **重大** | 改帳務邏輯、改權限、改 schema、大改版 | + IT 主管／老闆（擇一）書面（或表單）同意 |

**產出物**：每次上正式建議留存  
- PR 連結、  
- UAT 勾選表、  
- [change-approval-template.md](./change-approval-template.md) 填寫結果（可貼在 PR 或內部 wiki）。

---

## 4. GitHub 審批閘門（正式）

本 repo 提供 **手動觸發** 的工作流：`.github/workflows/release-approval-gate.yml`。

1. 在 GitHub 專案：**Settings → Environments → New environment**  
   - 建立名稱 **`production`**（必須與 workflow 內一致）。  
   - 勾選 **Required reviewers**，**必須包含老闆（負責人）或其 GitHub 帳號**（老闆不操作時可改為唯一授權代理人帳號，與表單授權一致）。  
2. 要上正式前：Actions → **Release gate (production approval)** → **Run workflow**，填變更摘要。  
3. Workflow 會先跑 **lint + test**，再進入 **`production` environment** — **須老闆（或設定之 reviewer）按 Approve** 後才可繼續。  
4. **核准後**：依 Summary 說明執行 **Railway 正式部署**（推送 `main` 或儀表板 Redeploy）。

> 若尚未設定 `production` environment，workflow 仍會跑，但不會有審批暫停；請務必完成 Environment 設定。

---

## 5. Railway 與 Docker 對應（雙環境）

| 環境 | 建議作法 |
|------|----------|
| **預備** | 第二個 Railway **Service**，變數：`DATABASE_URL`＝預備 DB、`NEXTAUTH_URL`＝預備網址；可連結 **`develop`** 分支自動部署。 |
| **正式** | 現有正式 Service，連結 **`main`**；僅在審批通過後合併／推送 `main`。 |

本機 Docker：僅作開發／驗證映像，**不當作正式**。

---

## 6. 回滾

| 情境 | 作法 |
|------|------|
| 僅程式問題 | Railway **Rollback** 至上一成功 Deployment，或重新部署上一 **tag／commit** |
| DB 與 schema 問題 | 依 [backup-restore-runbook.md](./backup-restore-runbook.md)；禁止未演練的破壞性 `migrate down` |

---

## 7. Feature Flag

大功能預設關閉，預備驗收後再在正式逐步開啟，降低一次釋出風險。

---

## 8. 相關檔案

- CI：`.github/workflows/ci.yml`  
- 正式審批閘門：`.github/workflows/release-approval-gate.yml`  
- UAT 清單：[uat-regression-checklist.md](./uat-regression-checklist.md)  
- 變更審批範本：[change-approval-template.md](./change-approval-template.md)  
- 部署：`RAILWAY-DEPLOY.md`
