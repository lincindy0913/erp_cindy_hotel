# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL 3 for Prisma engine
RUN apk add --no-cache openssl

# Prisma schema first (postinstall runs prisma generate)
COPY prisma ./prisma/
COPY package.json package-lock.json* ./
RUN npm ci

# App source and Next.js build (ensure public exists for runner)
COPY . .
RUN mkdir -p public
# PDF 傳票中文字型（避免亂碼）
RUN mkdir -p lib/fonts && (node scripts/download-pdf-font.js || true)
# Alpine uses musl; ensure Next.js SWC binary is available for linux-x64-musl
RUN npm install @next/swc-linux-x64-musl --save-optional
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install OpenSSL 3 for Prisma engine compatibility
RUN apk add --no-cache openssl libssl3 libcrypto3

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (public ensured by mkdir in builder)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma CLI + client (for migrate deploy at runtime)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
# 傳票 PDF 中文字型
COPY --from=builder /app/lib/fonts ./lib/fonts

USER nextjs

EXPOSE 3000

# Optional: Docker healthcheck (Railway uses deploy.healthcheckPath in railway.json)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Wait for DB then run migrations and start server (Railway/Docker)
# npx is not available in standalone; use node to invoke prisma CLI directly
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy 2>/dev/null || node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss 2>/dev/null; exec node server.js"]
