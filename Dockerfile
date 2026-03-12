# ============================================
# Stage 1: Dependencies & Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Install dependencies (copy prisma schema first for postinstall generate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# App source and build
COPY . .
RUN npm run build

# ============================================
# Stage 2: Runtime (standalone)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install OpenSSL for Prisma engine
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma: copy schema, CLI, and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy font files if they exist
COPY --from=builder /app/lib/fonts ./lib/fonts

USER nextjs

EXPOSE 3000

# Sync schema (no destructive changes; keeps existing data) then start Next.js
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate 2>/dev/null || true; exec node server.js"]
