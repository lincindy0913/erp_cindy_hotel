#!/bin/sh
set -e

echo "🚀 Starting ERP Application..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
echo "   Giving database time to initialize..."
sleep 10

echo "✅ Database should be ready!"

# Run database migrations and push schema
echo "📊 Syncing database schema..."
node_modules/.bin/prisma db push --accept-data-loss --skip-generate

# Seed database with default admin user
echo "🌱 Seeding database..."
node_modules/.bin/prisma db seed || echo "⚠️  Seed skipped (admin may already exist)"

echo "🎉 Application is starting on port 3000..."

# Execute the CMD from Dockerfile
exec "$@"
