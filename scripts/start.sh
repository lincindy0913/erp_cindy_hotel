#!/bin/bash

PORT_TO_USE=${PORT:-3000}

echo "🚀 使用 port: $PORT_TO_USE"

echo "🗄️  嘗試同步資料庫..."
npx prisma db push --accept-data-loss >/dev/null 2>&1 && echo "✅ 資料庫已同步" || echo "⚠️  無法連線資料庫，改用模擬資料"

echo "📊 啟動 Next.js..."

SCHEDULER_ENABLED=${ENABLE_SCHEDULER:-true}
if [ "$SCHEDULER_ENABLED" = "true" ]; then
  echo "⏰ 啟動排程器..."
  node scripts/scheduler.mjs &
  SCHEDULER_PID=$!
  trap "kill $SCHEDULER_PID 2>/dev/null" EXIT
fi

next start -p "$PORT_TO_USE"
