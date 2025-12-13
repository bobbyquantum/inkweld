# syntax=docker/dockerfile:1.20
#
# Inkweld Backend Dockerfile
# Uses Bun's --compile flag to create a single-file executable with embedded native modules.
# This produces a ~200MB image instead of ~1.5GB.
#
# The key challenge is native module embedding: node-gyp-build dynamically resolves .node
# files at runtime, but Bun's compiler needs static requires to embed them. We patch
# classic-level/binding.js to directly require the N-API prebuild before compilation.

# Frontend builder stage (Angular)
# Angular build outputs to dist/browser/ in production mode (default configuration)
FROM oven/bun:1.3.4 AS frontend-builder
WORKDIR /app/frontend

COPY frontend/bun.lock frontend/package.json ./
RUN bun install --frozen-lockfile

COPY frontend .
# Build frontend and verify output exists - fail early with clear error if build doesn't produce expected output
RUN bun run build \
  && if [ ! -d /app/frontend/dist ]; then \
  echo "ERROR: frontend build did not produce /app/frontend/dist"; \
  ls -la /app/frontend || true; \
  exit 1; \
  fi

# Backend builder stage - produces a single compiled binary
FROM oven/bun:1.3.4 AS backend-builder
WORKDIR /app/backend

# No build tools needed - we use bun:sqlite (native to Bun), not better-sqlite3
# better-sqlite3 is only needed for the Node.js runner (node-runner.ts)
# Native modules (classic-level, bcrypt) ship with prebuilds and are patched later

# Install dependencies with --ignore-scripts to skip better-sqlite3's node-gyp build
# (Bun doesn't support prebuild-install, causing it to fall back to node-gyp which fails)
# Then run postinstall for packages that need platform-specific binaries:
# - esbuild: downloads platform-specific binary
# - sharp: downloads prebuilt libvips binaries
COPY backend/bun.lock backend/package.json ./
RUN bun install --frozen-lockfile --ignore-scripts && \
    node node_modules/esbuild/install.js && \
    cd node_modules/sharp && node install/check.js || true

# Copy source and build scripts
COPY backend .

# Determine target architecture for native module patching and Bun compilation
ARG TARGETARCH

# Patch native modules for Bun binary compilation:
# This modifies classic-level/binding.js to directly require the Linux glibc prebuild
# instead of using node-gyp-build's runtime resolution. This allows Bun to statically
# analyze and embed the .node file in the compiled binary.
RUN PATCH_TARGET=$([ "${TARGETARCH}" = "arm64" ] && echo "linux-arm64-glibc" || echo "linux-x64-glibc") && \
  echo "Patching native modules for: $PATCH_TARGET" && \
  bun scripts/patch-native-modules.ts patch $PATCH_TARGET

# Copy frontend dist for binary embedding
# Angular outputs to dist/browser/ - copy entire dist directory for consistency
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Generate frontend imports file for binary embedding
# This scans the frontend dist and creates TypeScript imports with { type: 'file' }
# so Bun can embed all frontend assets in the compiled binary
RUN bun scripts/generate-frontend-imports.ts

# Build TypeScript and compile to single binary
# The --compile flag creates a standalone executable with embedded Bun runtime
# The patched native module is embedded because it's now a static require
RUN BUN_TARGET=$([ "${TARGETARCH}" = "arm64" ] && echo "bun-linux-arm64" || echo "bun-linux-x64") && \
  echo "Compiling with target: $BUN_TARGET" && \
  bun run build && \
  bun build --compile --minify --sourcemap \
  --target=$BUN_TARGET \
  ./src/bun-runner.ts \
  --outfile ./inkweld-server

# Runtime image - minimal with just the binary
FROM debian:bookworm-slim AS backend-runtime
WORKDIR /app

ENV NODE_ENV=production \
  PORT=8333 \
  HOST=0.0.0.0 \
  DB_TYPE=sqlite \
  DB_PATH=/data/sqlite.db \
  DATA_PATH=/data/yjs \
  DB_LOGGING=false \
  FRONTEND_DIST=/app/frontend/browser

# Install only runtime dependencies (curl for healthcheck, ca-certs for HTTPS)
RUN apt-get update && \
  apt-get install -y --no-install-recommends curl ca-certificates && \
  rm -rf /var/lib/apt/lists/* && \
  adduser --disabled-password --gecos "" inkweld && \
  mkdir -p /data && chown -R inkweld:inkweld /data /app

# Copy only the compiled binary and drizzle migrations (required for DB setup)
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/inkweld-server ./
COPY --from=backend-builder --chown=inkweld:inkweld /app/backend/drizzle ./drizzle

# Copy frontend assets from dist directory
# Angular outputs to dist/browser/ in production mode. We copy the entire dist/ directory
# to /app/frontend/, which creates /app/frontend/browser/ containing index.html and assets.
# FRONTEND_DIST env var points to /app/frontend/browser for serving.
COPY --from=frontend-builder --chown=inkweld:inkweld /app/frontend/dist /app/frontend

USER inkweld
VOLUME ["/data"]
EXPOSE 8333

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8333/api/v1/health || exit 1

CMD ["./inkweld-server"]
