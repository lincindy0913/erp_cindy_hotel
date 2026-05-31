#!/bin/sh
set -e

echo "🚀 Starting ERP Application..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
# depends_on + healthcheck 已確保 db 就緒，短暫緩衝即可
sleep 3

echo "✅ Database should be ready!"

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
