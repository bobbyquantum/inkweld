# Use single stage build
FROM oven/bun

# Set memory limits and optimizations for Angular build
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

WORKDIR /app

# Copy and build frontend first
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN bun install --frozen-lockfile
RUN bun run clean 
RUN bun --max-old-space-size=4096 run build --verbose
RUN bun run compress

# Copy and build backend
WORKDIR /app
COPY server/ ./server/
WORKDIR /app/server
RUN bun install
RUN bun run build

# Install only production dependencies for runtime
RUN bun install --production && \
  # Explicitly install SQLite3
  bun add sqlite3

# Clean up frontend node_modules to save space
WORKDIR /app
RUN rm -rf frontend/node_modules

# Create directory for Yjs persistence
RUN mkdir -p /var/lib/yjs && chown -R bun:bun /var/lib/yjs

EXPOSE 8333
CMD ["bun", "server/dist/src/main.js"]
