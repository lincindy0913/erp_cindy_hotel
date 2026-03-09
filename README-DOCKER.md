# Docker 部署說明

## 快速啟動

```bash
# 建置並啟動（app + PostgreSQL）
docker compose up -d --build

# 應用： http://localhost:3000
# 資料庫： localhost:5432（使用者 erp / 密碼 erp_secret / 資料庫 erp）
```

## 環境變數

可建立 `.env` 覆寫預設值，或於 `docker-compose.yml` 中設定：

| 變數 | 說明 | 預設（compose） |
|------|------|------------------|
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgresql://erp:erp_secret@db:5432/erp` |
| `NEXTAUTH_URL` | 登入回調網址 | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth 密鑰（至少 32 字元） | 需自行設定 |

首次啟動時會自動執行 `prisma migrate deploy`（無 migrations 時會改為 `prisma db push`）同步資料庫。

## 常用指令

```bash
# 查看日誌
docker compose logs -f app

# 停止
docker compose down

# 停止並刪除資料庫 volume
docker compose down -v
```

## 種子資料（可選）

若需匯入種子資料，可於啟動後執行：

```bash
docker compose exec app npx prisma db seed
```
