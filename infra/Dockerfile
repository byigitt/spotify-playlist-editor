# ── Stage 1: Install all deps & build ────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Root deps (concurrently etc.)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Client deps & build
COPY client/package.json client/bun.lock* client/
RUN cd client && bun install --frozen-lockfile

COPY client/ client/
RUN cd client && bun run build

# Server deps & build
COPY server/package.json server/bun.lock* server/
RUN cd server && bun install --frozen-lockfile

COPY server/ server/
RUN cd server && bun run build

# ── Stage 2: Production image ────────────────────────────────────
FROM oven/bun:1-slim AS production

WORKDIR /app

# Server runtime deps only
COPY server/package.json server/bun.lock* ./server/
RUN cd server && bun install --frozen-lockfile --production

# Server build output
COPY --from=builder /app/server/dist ./server/dist

# Client build output → server will serve this
COPY --from=builder /app/client/dist ./client-dist

ENV NODE_ENV=production
ENV PORT=3001
ENV DEV_MODE=false

EXPOSE 3001

RUN echo "BUILD_TIME=$(date -u +%Y%m%d_%H%M%S)" > /app/build-info.txt
CMD ["bun", "server/dist/index.js"]
