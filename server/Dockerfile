# Stage 1: Build the NestJS backend
FROM oven/bun AS build-backend

WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install
COPY server/ ./
RUN bun run build

# Stage 2: Create the final image
FROM oven/bun
WORKDIR /app

# Copy built code and package files
COPY --from=build-backend /app/server/dist ./server/dist
COPY server/package.json server/bun.lock ./server/

# Install production dependencies
WORKDIR /app/server
RUN bun install --production && \
  # Explicitly install SQLite3
  bun add sqlite3

WORKDIR /app

# Copy the pre-built frontend static files
COPY frontend/dist/browser ./frontend/dist/browser

# Create directory for Yjs persistence
RUN mkdir -p /var/lib/yjs && chown -R bun:bun /var/lib/yjs

EXPOSE 8333
CMD ["bun", "server/dist/src/main.js"]
