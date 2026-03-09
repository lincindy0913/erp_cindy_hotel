# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# App source and Next.js build
COPY . .
RUN mkdir -p public && npm run build

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma CLI + client (for migrate deploy at runtime)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

USER nextjs

EXPOSE 3000

# Wait for DB then run migrations and start server
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy || node node_modules/prisma/build/index.js db push --accept-data-loss; node server.js"]
