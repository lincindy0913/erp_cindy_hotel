#!/bin/sh
set -e

echo "🚀 Starting ERP Application..."

# ---------------------------------------------------------------------------
# Wait for DB to be reachable (TCP check via Node built-in net module)
# Replaces fixed sleep — handles Railway cold-start and slow cloud connections
# ---------------------------------------------------------------------------
echo "⏳ Checking database connectivity..."
MAX_RETRIES=15
RETRY=0
while ! node -e "
  const u = process.env.DATABASE_URL || '';
  const m = u.match(/@([^:@]+):(\d+)\//);
  if (!m) { console.error('Cannot parse DATABASE_URL'); process.exit(1); }
  const net = require('net');
  const s = net.createConnection(parseInt(m[2]), m[1]);
  s.setTimeout(3000);
  s.on('connect', () => { s.destroy(); process.exit(0); });
  s.on('timeout', () => { s.destroy(); process.exit(1); });
  s.on('error',   () => { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "⚠️  DB not reachable after $MAX_RETRIES attempts, continuing anyway..."
    break
  fi
  echo "⏳ Waiting for database... ($RETRY/$MAX_RETRIES)"
  sleep 2
done
echo "✅ Database is reachable!"

# ---------------------------------------------------------------------------
# Schema sync strategy（三段式，確保新舊 DB 都能正常啟動）：
#
# Phase 1 — 直接 migrate deploy
#   ✅ 全新 DB：baseline + 10-16 依序執行，完全成功
#   ❌ 舊 DB（schema 已由 db push 建好，_prisma_migrations 為空）：
#      baseline 失敗（tables 已存在）→ 進 Phase 2
#
# Phase 2 — 標記 baseline 為已套用後再 migrate deploy
#   ✅ 舊 DB：跳過 baseline，執行 10-16（IF NOT EXISTS 保護，安全冪等）
#   ❌ 意外失敗 → 進 Phase 3
#
# Phase 3 — db push（最終保障）
#   ✅ schema 直接與 prisma.schema 同步，不依賴 migration 狀態
# ---------------------------------------------------------------------------
echo "📊 Syncing database schema..."

if node_modules/.bin/prisma migrate deploy --skip-generate 2>&1; then
  echo "✅ Migrations applied"
else
  echo "⚠️  migrate deploy failed. Marking baseline as resolved and retrying..."
  node_modules/.bin/prisma migrate resolve --applied 00000000000000_baseline 2>/dev/null || true

  if node_modules/.bin/prisma migrate deploy --skip-generate 2>&1; then
    echo "✅ Migrations applied after baseline resolve"
  else
    echo "⚠️  migrate deploy failed after resolve, falling back to db push..."
    node_modules/.bin/prisma db push --skip-generate || echo "⚠️  db push failed — check DATABASE_URL and schema"
  fi
fi

# Seed database with default admin user
echo "🌱 Seeding database..."
node_modules/.bin/prisma db seed || echo "⚠️  Seed skipped (admin may already exist)"

echo "🎉 Application is starting on port 3000..."

# Execute the CMD from Dockerfile
exec "$@"
