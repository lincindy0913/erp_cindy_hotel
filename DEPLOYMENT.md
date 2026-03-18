# 部署與健康檢查說明

## Next.js 與 Docker 設定

- **next.config.js** 已設定 `output: 'standalone'`，建置後會產出獨立運行所需的檔案（含 `server.js`）。
- **Dockerfile** 使用 `node server.js` 啟動，與 standalone 輸出一致；若 404 或路徑異常，請確認：
  1. `next.config.js` 內 `output: 'standalone'` 未被關閉或覆蓋。
  2. Docker 的 CMD 為 `node server.js`（在 standalone 目錄下執行），不要改為 `npm start` 或 `next start`。

## 健康檢查（Health Check）

部署後可透過健康檢查端點確認服務是否正常。

### 端點

- **URL**: `GET /api/health`
- **成功**: HTTP 200，JSON 範例：
  ```json
  {
    "status": "ok",
    "timestamp": "2025-03-08T12:00:00.000Z",
    "version": "1.0.0",
    "environment": "production"
  }
  ```

### 使用方式

1. **手動排錯**  
   瀏覽器或 curl：
   ```bash
   curl -s https://your-app.railway.app/api/health
   ```

2. **Railway**  
   在服務設定中可將 Health Check Path 設為 `/api/health`（若平台支援）。

3. **Docker / 編排**  
   可設定 healthcheck 指令，例如：
   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
     CMD wget -q -O - http://localhost:3000/api/health | grep -q '"status":"ok"' || exit 1
   ```
   或使用 curl（若映像內有）：
   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/api/health || exit 1
   ```

### 注意

- `/api/health` 僅檢查應用是否啟動，不檢查資料庫連線；若需連線檢查，可另建 `/api/health/db` 等端點。

---

## 更新到最新版並保留資料（Docker + Railway）

### Docker 本地重建並啟動（保留所有資料）

1. 確定 `.env` 已設定好 `DATABASE_URL`（若用 docker-compose 的 db，可設為 `postgresql://erp:erp_secret@db:5432/erp`）。
2. 重建映像並重啟（資料庫 volume 會保留）：
   ```bash
   docker compose build --no-cache app
   docker compose up -d
   ```
3. 容器啟動時會自動執行：
   - `prisma generate`
   - `prisma db push`（**不含** `--accept-data-loss`，僅同步 schema，不刪資料）
   - `prisma/seed.js`（僅補齊預設角色/館別等，不覆寫既有資料）
   - `node server.js`

### Railway 更新到最新版並同步資料庫

1. **推送程式碼**（觸發 Railway 用 Dockerfile 重建）：
   ```bash
   git add .
   git commit -m "chore: update app and Docker for safe DB sync"
   git push origin main
   ```
   若 Railway 已連線此 repo，會自動建置並部署。

2. **環境變數**：在 Railway 專案中確認已設定：
   - `DATABASE_URL`（Railway PostgreSQL 或外部連線字串）
   - `NEXTAUTH_URL`（例如 `https://your-app.railway.app`）
   - `NEXTAUTH_SECRET`

3. **資料庫同步（保留資料）**：`Dockerfile` 啟動時依序嘗試 `prisma migrate deploy`，失敗時再 `prisma db push --skip-generate`，**皆不使用** `--accept-data-loss`，既有資料會保留。推送 `main` 後 Railway 會用同一 Dockerfile 重建並部署最新版。

4. **確認健康狀態**：
   ```bash
   curl -s https://你的服務.railway.app/api/health
   ```
   應回傳 `{"status":"ok",...}`。
