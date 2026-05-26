# ============================================
# Stage 1: Dependencies & Build
# ============================================
# Node 22 Active LTS — align with local `engines` if set
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Install dependencies (copy prisma schema first for postinstall generate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# App source and build
COPY . .
RUN mkdir -p public
ARG BUILD_TS=20260526_06
RUN npm run build

# ============================================
# Stage 2: Runtime (standalone)
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install OpenSSL for Prisma engine + pg_dump for Tier 1 backup + su-exec for permission fix
RUN apk add --no-cache openssl postgresql17-client su-exec

ARG BUILD_DATE
ARG GIT_COMMIT
LABEL org.opencontainers.image.title="erp-inventory-system"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"

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

# Copy bcryptjs for seed script
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy jsPDF and dependencies for PDF generation (voucher print)
COPY --from=builder /app/node_modules/jspdf ./node_modules/jspdf
COPY --from=builder /app/node_modules/jspdf-autotable ./node_modules/jspdf-autotable
COPY --from=builder /app/node_modules/fflate ./node_modules/fflate
COPY --from=builder /app/node_modules/fast-png ./node_modules/fast-png
COPY --from=builder /app/node_modules/iobuffer ./node_modules/iobuffer
COPY --from=builder /app/node_modules/pako ./node_modules/pako
COPY --from=builder /app/node_modules/@babel/runtime ./node_modules/@babel/runtime

# Copy xlsx for Excel parsing (BNB import + OTA reconcile)
COPY --from=builder /app/node_modules/xlsx ./node_modules/xlsx

# Copy font files if they exist
COPY --from=builder /app/lib/fonts ./lib/fonts

# Copy backup worker script (not included in standalone build output)
COPY --from=builder /app/scripts ./scripts

# Pre-create backup directory (ownership fixed at startup via su-exec)
RUN mkdir -p /app/backup-data

# Package version for /api/health (standalone does not set npm_package_version)
COPY --from=builder /app/package.json ./package.json

# NOTE: Do not set USER here — CMD runs as root to fix volume permissions,
# then su-exec drops to nextjs for the actual app process.
EXPOSE 3000

# Fix backup-data ownership (Railway volume mounts as root), then start as nextjs
CMD ["sh", "-c", "chown -R nextjs:nodejs /app/backup-data 2>/dev/null || true; exec su-exec nextjs sh -c 'node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss || echo WARNING: db push failed; exec node server.js'"]
