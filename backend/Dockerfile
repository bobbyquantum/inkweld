# syntax=docker/dockerfile:1.20

# Frontend builder stage (Angular)
FROM oven/bun:1.3.3 AS frontend-builder
WORKDIR /app/frontend

COPY frontend/bun.lock frontend/package.json ./
RUN bun install --frozen-lockfile

COPY frontend .
RUN bun run build

# Backend builder stage (Bun runtime)
FROM oven/bun:1.3.3 AS backend-builder
WORKDIR /app/backend

# Build prerequisites for native modules (better-sqlite3, sharp/libvips, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY backend/bun.lock backend/package.json ./
ENV CLASSIC_LEVEL_FORCE_BUILD=1
RUN bun install --frozen-lockfile \
  && cd node_modules/classic-level \
  && env npm_config_build_from_source=true ../.bin/node-gyp-build \
  && cd ../..

# Copy source
COPY backend .

# Copy frontend dist from frontend-builder stage (needed for frontend-assets.ts imports)
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Build (now has access to frontend dist for embedding)
RUN bun run build

# Runtime image
FROM oven/bun:1.3.3 AS backend-runtime
WORKDIR /app/backend

ENV NODE_ENV=production \
  PORT=8333 \
  HOST=0.0.0.0 \
  DB_TYPE=sqlite \
  DB_PATH=/data/sqlite.db \
  DATA_PATH=/data/yjs \
  DB_LOGGING=false \
  FRONTEND_DIST=/app/frontend

# Install runtime dependencies & create non-root user
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/* && \
  adduser --disabled-password --gecos "" inkweld && \
  mkdir -p /data && chown -R inkweld:inkweld /data

# Copy build artifacts and runtime deps
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/dist ./dist
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/package.json ./package.json
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/drizzle ./drizzle
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/src ./src
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/admin-cli.ts ./admin-cli.ts
COPY --from=frontend-builder --chown=inkweld:inkweld /app/frontend/dist/browser ${FRONTEND_DIST}

USER inkweld
VOLUME ["/data"]
EXPOSE 8333

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8333/health || exit 1

CMD ["bun", "dist/bun-runner.js"]
