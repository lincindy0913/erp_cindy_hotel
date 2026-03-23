#!/bin/sh
set -e

echo "🚀 Starting ERP Application..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
# depends_on + healthcheck 已確保 db 就緒，短暫緩衝即可
sleep 3

echo "✅ Database should be ready!"

# Sync schema without destructive flags (保留既有資料；若與 DB 不相容請手動處理 migration)
echo "📊 Syncing database schema..."
if node_modules/.bin/prisma migrate deploy --skip-generate 2>/dev/null; then
  echo "✅ Migrations applied"
else
  node_modules/.bin/prisma db push --skip-generate || echo "⚠️  db push failed — check DATABASE_URL and schema"
fi

# Seed database with default admin user
echo "🌱 Seeding database..."
node_modules/.bin/prisma db seed || echo "⚠️  Seed skipped (admin may already exist)"

echo "🎉 Application is starting on port 3000..."

# Execute the CMD from Dockerfile
exec "$@"
