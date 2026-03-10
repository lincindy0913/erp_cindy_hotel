# 從備份還原資料庫

## 若您有 Tier1 備份檔（.dump）

系統「全量備份」會產生 PostgreSQL 自訂格式的 `.dump` 檔（通常曾存在本機 `backup-data/tier1_full/` 或您設定的 `BACKUP_ROOT`）。

### 方法一：從本機用 pg_restore 還原到 Docker 的 PostgreSQL

1. 確認 Docker 的 DB 正在跑：`docker compose up -d`
2. 本機需安裝 PostgreSQL 用戶端工具（含 `pg_restore`），例如：
   - Windows: 安裝 [PostgreSQL](https://www.postgresql.org/download/windows/) 或僅安裝 [Command Line Tools](https://www.postgresql.org/download/windows/)
   - 或使用 Docker 內建（見方法二）
3. 在**本機**執行（將 `你的備份.dump` 換成實際路徑）：

```bash
# 先清空現有資料再還原（會刪除目前 DB 內所有資料）
set PGPASSWORD=erp_secret
pg_restore -h localhost -p 5432 -U erp -d erp --clean --if-exists --no-owner --no-privileges "你的備份.dump"
```

- 若連線被拒絕，請確認 `docker compose up -d` 已啟動且 port 5432 未被其他程式占用。

### 方法二：用 Docker 容器內的 pg_restore

若本機沒有 pg_restore，可把 .dump 檔放到專案目錄（例如 `D:\erp_cindy\restore.dump`），再執行：

```bash
# 將備份檔複製進 DB 容器
docker cp "D:\erp_cindy\restore.dump" erp_cindy-db-1:/tmp/restore.dump

# 在容器內還原（會清空並還原）
docker exec -it erp_cindy-db-1 sh -c "PGPASSWORD=erp_secret pg_restore -h localhost -U erp -d erp --clean --if-exists --no-owner --no-privileges /tmp/restore.dump"

# 刪除暫存檔
docker exec erp_cindy-db-1 rm /tmp/restore.dump
```

### 若沒有 .dump 備份檔

- 之前若**沒有**在系統內做過「全量備份」，或備份檔只存在已刪除的 Docker volume 裡，則**無法從系統內撈回**該份資料。
- 若您有**其他環境**的 PostgreSQL（例如本機安裝的 Postgres）仍保留舊資料，可從該處用 `pg_dump` 匯出後，再用上述步驟還原到 Docker。

## 之後避免再遺失：掛載備份目錄

在 `docker-compose.yml` 的 `app` 服務下加入 volume，讓備份寫到本機目錄：

```yaml
app:
  build: .
  volumes:
    - ./backup-data:/app/backup-data
  environment:
    - BACKUP_ROOT=/app/backup-data
  # ... 其餘不變
```

之後在系統內執行的備份會存到專案下的 `backup-data/`，重啟或重建容器也不會消失。
