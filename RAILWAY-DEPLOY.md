# 部署到 Docker 與 Railway

## Docker（本機）

```bash
cd D:\erp_cindy
docker compose build app
docker compose up -d app
```

本機訪問：http://localhost:3000

- 健康檢查：容器會對 `/api/health` 做 healthcheck，可用 `docker compose ps` 查看狀態。
- 環境變數：在 `.env` 或 shell 中設定 `DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`；compose 會帶入容器。

---

## Railway 部署

專案已設定 `railway.json`，使用 **Dockerfile** 建置；健康檢查使用 `/api/health`（避免首頁導向登入造成誤判）。

### 方式一：Git 推送（建議）

若專案已連結 Railway 的 GitHub/GitLab 倉庫，推送後會自動建置並部署：

```bash
git add .
git commit -m "Docker & Railway 設定更新"
git push origin main
```

在 [Railway Dashboard](https://railway.app/dashboard) 可查看建置與部署狀態。

### 方式二：Railway CLI

```bash
cd D:\erp_cindy
railway login
railway link    # 選既有專案或新建
railway up      # 上傳並依 Dockerfile 建置部署
```

### 環境變數（Railway）

在 Railway 專案 **Variables** 中設定：

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串（使用 Railway PostgreSQL 時可自動帶入） |
| `NEXTAUTH_URL` | 正式環境網址，例如 `https://你的專案.up.railway.app` |
| `NEXTAUTH_SECRET` | 至少 32 字元隨機字串 |

### 部署後資料庫

容器啟動時會自動執行 `prisma migrate deploy`（若有 migration）或 `prisma db push`，以同步 schema。若專案有新增 Prisma 欄位（例如租賃合約/維護費會計科目、貸款會計科目），首次部署後資料庫會自動更新，無需手動執行。

---

**近期更新**：庫存邏輯改為「進貨入庫後，僅以領用、調撥扣數量」（不扣銷貨）；庫存查詢表已移除銷貨欄。Docker / Railway 已設定 healthcheck `/api/health`。推送後自動建置部署；本機可執行 `docker compose build app` 與 `docker compose up -d app` 取得最新程式。
