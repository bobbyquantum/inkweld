# Stage 1: Build the Angular frontend
FROM oven/bun AS build-frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install
COPY frontend/ ./


# Stage 2: Build the NestJS backend
FROM oven/bun AS build-backend
WORKDIR /app/worm-server
COPY worm-server/package.json worm-server/bun.lock ./
RUN bun install
COPY worm-server/ ./
RUN bun run build

# Stage 3: Create the final image
FROM oven/bun:alpine
WORKDIR /app
COPY --from=build-backend /app/worm-server/dist ./worm-server/dist
COPY --from=build-frontend /app/frontend/dist ./frontend/dist
COPY worm-server/package.json worm-server/bun.lock ./
RUN bun install --production

# Create directory for Yjs persistence
RUN mkdir -p /var/lib/yjs && chown -R bun:bun /var/lib/yjs

EXPOSE 8333
CMD ["bun", "worm-server/dist/src/main.js"]
