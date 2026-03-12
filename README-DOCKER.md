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

首次啟動時容器內會自動執行 `prisma db push` 同步資料庫結構（**不會刪除既有資料**）。

## 更新映像並保留資料

要更新程式後重新建置並啟動，且**保留資料庫與 volume 資料**：

```bash
# 只重建 app 映像並重啟，不刪除 volume（資料庫資料會保留）
docker compose up -d --build

# 或分開執行：
docker compose build --no-cache app
docker compose up -d
```

- **不要**使用 `docker compose down -v`（`-v` 會刪除 named volumes，包含 `postgres_data`）。
- 僅使用 `docker compose down` 再 `docker compose up -d --build` 時，`postgres_data` volume 會保留，資料不會遺失。

## 常用指令

```bash
# 查看日誌
docker compose logs -f app

# 停止
docker compose down

# 停止（保留 volume，資料保留）
docker compose down

# 停止並刪除資料庫 volume（會清空所有資料，請謹慎使用）
docker compose down -v
```

## 備份與還原

- 備份檔案會寫入本機 `./backup-data/`（已掛載進容器），重建容器後仍可保留。
- 若有舊的 **Tier1 全量備份檔（.dump）**，可依 `scripts/restore-from-dump.md` 用 `pg_restore` 還原到目前 Docker 的資料庫。
- 若從未做過備份或備份檔已不存在，則無法從系統內撈回已刪除的 volume 資料。

## 種子資料（可選）

若需匯入種子資料，可於啟動後在本機（需可連到 DB）執行：

```bash
# 本機需已設定 DATABASE_URL=postgresql://erp:erp_secret@localhost:5432/erp
npm run db:seed
# 或
npx prisma db seed
```
