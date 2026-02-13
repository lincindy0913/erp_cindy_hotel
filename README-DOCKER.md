# Docker 本機部署指南

## 快速開始

### 1. 環境準備
確保已安裝:
- Docker Desktop (v20.10+)
- Docker Compose (v2.0+)

檢查版本：
```bash
docker --version
docker-compose --version
```

### 2. 環境變數設定
```bash
# 複製環境變數範本
cp .env.docker .env

# 編輯 .env 檔案,修改以下重要變數:
# - POSTGRES_PASSWORD: 資料庫密碼（請使用強密碼）
# - NEXTAUTH_SECRET: 至少 32 字元的隨機字串
```

生成 NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

### 3. 啟動服務
```bash
# 構建並啟動所有服務
docker-compose up -d

# 查看啟動日誌
docker-compose logs -f app
```

等待看到以下訊息表示啟動成功：
- ✅ Database is ready!
- 📊 Syncing database schema...
- 🌱 Seeding database...
- 🎉 Application is starting on port 3000...

### 4. 訪問應用
- 應用網址: http://localhost:3000
- 預設管理員帳號:
  - Email: `admin@hotel.com`
  - Password: `admin123`

⚠️ **首次登入後請立即修改密碼!**

---

## 常用指令

### 服務管理
```bash
# 啟動服務
docker-compose up -d

# 停止服務
docker-compose down

# 停止服務並刪除資料卷 (⚠️ 危險操作! 會刪除所有資料)
docker-compose down -v

# 重啟服務
docker-compose restart

# 重新構建並啟動
docker-compose up -d --build

# 查看服務狀態
docker-compose ps
```

### 日誌查看
```bash
# 查看所有服務日誌
docker-compose logs -f

# 僅查看應用日誌
docker-compose logs -f app

# 僅查看資料庫日誌
docker-compose logs -f db

# 查看最近 100 行日誌
docker-compose logs --tail=100 app
```

### 進入容器
```bash
# 進入應用容器
docker-compose exec app sh

# 進入資料庫容器
docker-compose exec db sh

# 直接連接資料庫
docker-compose exec db psql -U erp_user -d erp_database
```

### 資料庫操作
```bash
# 執行 Prisma Studio (在容器內)
docker-compose exec app npx prisma studio

# 重新同步資料庫結構
docker-compose exec app npx prisma db push

# 重新執行種子資料
docker-compose exec app npx prisma db seed

# 資料庫備份
docker-compose exec db pg_dump -U erp_user erp_database > backup_$(date +%Y%m%d_%H%M%S).sql

# 資料庫還原
docker-compose exec -T db psql -U erp_user -d erp_database < backup_20260213_120000.sql
```

---

## 目錄結構
```
erp/
├── Dockerfile              # 應用容器定義
├── docker-compose.yml      # 服務編排配置
├── docker-entrypoint.sh    # 容器啟動腳本
├── .dockerignore           # Docker 忽略檔案
├── .env.docker             # 環境變數範本
├── .env                    # 實際環境變數 (不提交到 Git)
└── README-DOCKER.md        # 本文件
```

---

## 資料持久化

資料庫資料儲存在 Docker volume: `postgres_data`

查看資料卷:
```bash
# 列出所有 volumes
docker volume ls | grep postgres

# 查看 volume 詳細資訊
docker volume inspect erp_postgres_data
```

資料位置:
- macOS: `/var/lib/docker/volumes/erp_postgres_data/_data`
- Linux: `/var/lib/docker/volumes/erp_postgres_data/_data`
- Windows: `\\wsl$\docker-desktop-data\version-pack-data\community\docker\volumes\erp_postgres_data\_data`

---

## 故障排除

### 問題 1: 端口被佔用
```
Error: bind: address already in use
```

解決方案：
```bash
# 檢查端口使用情況
lsof -i :3000
lsof -i :5432

# 修改 docker-compose.yml 中的端口映射
# 將 "3000:3000" 改為 "3001:3000"
# 同時更新 .env 中的 NEXTAUTH_URL=http://localhost:3001
```

### 問題 2: 資料庫連線失敗
```
Database is unavailable
```

解決方案：
```bash
# 檢查資料庫健康狀態
docker-compose ps

# 查看資料庫日誌
docker-compose logs db

# 重啟資料庫
docker-compose restart db

# 如果問題持續,完全重置
docker-compose down -v
docker-compose up -d
```

### 問題 3: 應用無法啟動
```
Application failed to start
```

解決方案：
```bash
# 查看詳細日誌
docker-compose logs app

# 重新構建容器
docker-compose down
docker-compose up -d --build --force-recreate

# 檢查環境變數
docker-compose exec app env | grep -E '(DATABASE_URL|NEXTAUTH)'
```

### 問題 4: Prisma 錯誤
```
PrismaClient initialization error
```

解決方案：
```bash
# 清除並重新生成 Prisma Client
docker-compose exec app npx prisma generate
docker-compose restart app

# 重新同步資料庫
docker-compose exec app npx prisma db push --accept-data-loss
```

### 問題 5: 磁碟空間不足

解決方案：
```bash
# 清理未使用的 Docker 資源
docker system prune -a

# 僅清理未使用的 volumes
docker volume prune

# 查看 Docker 佔用空間
docker system df
```

---

## 生產環境建議

### 1. 安全性
- ✅ 修改預設資料庫密碼（使用強密碼）
- ✅ 使用強隨機字串作為 NEXTAUTH_SECRET
- ✅ 不要暴露資料庫端口到外部（移除 `ports: 5432:5432`）
- ✅ 使用環境變數管理敏感資訊
- ✅ 定期更新 Docker 鏡像

### 2. 性能優化
- 使用 nginx 作為反向代理
- 啟用 Gzip 壓縮
- 配置適當的資源限制：
  ```yaml
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
  ```

### 3. 監控與日誌
- 設定容器資源監控（如 cAdvisor, Prometheus）
- 配置日誌輪轉：
  ```yaml
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
  ```

### 4. 備份策略
- 定期備份資料庫（建議每日）
- 使用外部存儲保存備份
- 定期測試還原流程
- 自動化備份腳本範例：
  ```bash
  #!/bin/bash
  # backup.sh
  DATE=$(date +%Y%m%d_%H%M%S)
  docker-compose exec -T db pg_dump -U erp_user erp_database > "backups/backup_${DATE}.sql"
  # 保留最近 7 天的備份
  find backups/ -name "backup_*.sql" -mtime +7 -delete
  ```

### 5. 高可用性
- 使用 Docker Swarm 或 Kubernetes 進行容器編排
- 配置資料庫主從複製
- 使用負載均衡器分散流量

---

## 環境變數說明

| 變數名稱 | 必填 | 預設值 | 說明 |
|---------|------|--------|------|
| `POSTGRES_USER` | ✅ | erp_user | PostgreSQL 使用者名稱 |
| `POSTGRES_PASSWORD` | ✅ | - | PostgreSQL 密碼 |
| `POSTGRES_DB` | ✅ | erp_database | 資料庫名稱 |
| `NEXTAUTH_SECRET` | ✅ | - | NextAuth 加密密鑰（至少 32 字元） |
| `NEXTAUTH_URL` | ✅ | http://localhost:3000 | 應用 URL |
| `NODE_ENV` | ⚪ | production | Node.js 環境 |

---

## 技術規格

| 組件 | 版本 |
|------|------|
| Node.js | 18-alpine |
| PostgreSQL | 16-alpine |
| Next.js | 14.0.4 |
| Prisma | 5.7.1 |
| NextAuth | 4.24.5 |
| Docker Compose | 3.8 |

---

## 網路架構

```
┌─────────────────────────────────────────┐
│              使用者                      │
└──────────────┬──────────────────────────┘
               │ http://localhost:3000
               ▼
┌─────────────────────────────────────────┐
│          Docker Network                 │
│         (erp-network)                   │
│                                         │
│  ┌──────────────┐   ┌──────────────┐   │
│  │   app        │   │     db       │   │
│  │ (Next.js)    │──▶│(PostgreSQL)  │   │
│  │ Port: 3000   │   │ Port: 5432   │   │
│  └──────────────┘   └──────────────┘   │
│                            │            │
│                            ▼            │
│                    ┌──────────────┐     │
│                    │postgres_data │     │
│                    │  (Volume)    │     │
│                    └──────────────┘     │
└─────────────────────────────────────────┘
```

---

## 開發工作流程

### 本機開發模式
```bash
# 使用 npm run dev 進行本機開發
npm run dev

# Docker 環境僅用於測試生產環境部署
docker-compose up -d
```

### 程式碼更新後重新部署
```bash
# 停止服務
docker-compose down

# 重新構建（會重新執行 npm install 和 next build）
docker-compose up -d --build

# 查看日誌確認部署成功
docker-compose logs -f app
```

### 資料庫 Schema 更新
```bash
# 1. 修改 prisma/schema.prisma
# 2. 重新啟動容器（會自動執行 prisma db push）
docker-compose restart app

# 或手動執行
docker-compose exec app npx prisma db push
```

---

## 常見問題 (FAQ)

**Q: 如何重置所有資料？**
```bash
docker-compose down -v  # 刪除所有資料
docker-compose up -d    # 重新啟動（會重新創建管理員）
```

**Q: 如何查看資料庫內容？**
```bash
# 方法 1: 使用 Prisma Studio
docker-compose exec app npx prisma studio
# 訪問 http://localhost:5555

# 方法 2: 使用 psql
docker-compose exec db psql -U erp_user -d erp_database
```

**Q: 如何修改端口？**
修改 `docker-compose.yml`:
```yaml
app:
  ports:
    - "3001:3000"  # 將 3000 改為 3001
```
同時修改 `.env`:
```
NEXTAUTH_URL=http://localhost:3001
```

**Q: 容器啟動後可以關閉終端嗎？**
可以，使用 `-d` 參數後容器在背景執行，關閉終端不影響運行。

**Q: 如何停止並移除所有容器？**
```bash
docker-compose down       # 停止並移除容器
docker-compose down -v    # 同時刪除資料卷
```

---

## 授權與支援

如有問題，請聯繫系統管理員或參考：
- 主要文檔: [README.md](README.md)
- Prisma 文檔: https://www.prisma.io/docs
- Next.js 文檔: https://nextjs.org/docs
- Docker 文檔: https://docs.docker.com

---

**最後更新**: 2026-02-13
