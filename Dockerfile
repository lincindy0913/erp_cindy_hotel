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
RUN npm install --prefer-offline || npm install

# App source and build
COPY . .
RUN mkdir -p public
RUN npm run build

# ============================================
# Stage 2: Runtime (standalone)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

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

USER nextjs

EXPOSE 3000

# Sync DB schema, then start (seed is one-time setup only — run manually if needed)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate 2>/dev/null || true; exec node server.js"]
