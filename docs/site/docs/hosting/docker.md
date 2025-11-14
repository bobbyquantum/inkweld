---
title: Docker Deployment
description: Build and run the bundled backend+SPA container, configure volumes, and customize runtime options.
---

## Overview

The backend Dockerfile produces a single image that serves the Angular production bundle and the Bun API from the same container. Every `docker run` exposes port `8333`, hosts the SPA at `/`, and continues to answer API requests under `/api/**`.

## Build the image

From the repo root:

```bash
 docker build -t inkweld/backend:local -f backend/Dockerfile .
```

For multi-platform testing, enable BuildKit and run:

```bash
 docker buildx build --platform linux/amd64,linux/arm64 \
   -t inkweld/backend:local -f backend/Dockerfile --load .
```

## Runtime essentials

```bash
 docker run -p 8333:8333 -v inkweld_data:/data \
   -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
   -e CLIENT_URL=https://app.inkweld.org \
   --name inkweld-backend \
   inkweld/backend:local
```

Key flags:

- **Port mapping**: always expose port `8333` (configurable via env vars but defaults to `8333`).
- **Volume**: mount `/data` to persist SQLite databases, LevelDB stores, and uploaded project files.
- **Secrets**: `SESSION_SECRET` must be 32+ characters; keep it private.
- **CORS**: set `CLIENT_URL`/`ALLOWED_ORIGINS` to whatever serves the SPA (even though the SPA is bundled, other clients may exist).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 8333) |
| `SESSION_SECRET` | Session encryption key (required) |
| `CLIENT_URL` | Frontend origin allowed for CORS |
| `ALLOWED_ORIGINS` | Comma-separated list for CORS + CSRF |
| `DB_TYPE` | `sqlite` or `postgres` (container defaults to SQLite) |
| `DB_PATH` | SQLite path, defaults to `/data/sqlite.db` |
| `DATA_PATH` | LevelDB + Yjs storage location (`/data/yjs`) |
| `FRONTEND_DIST` | Path to static assets; override if you mount a different bundle |
| `DRIZZLE_MIGRATIONS_DIR` | Custom migrations directory (defaults to `/app/backend/drizzle`) |

## Automatic migrations

On boot the image runs `bun run drizzle-kit migrate` against the bundled migrations folder. Provide your own folder by mounting into `/app/backend/drizzle` or overriding `DRIZZLE_MIGRATIONS_DIR`. Set `SKIP_MIGRATIONS=true` if you must disable the behavior.

## Admin CLI inside the container

The admin CLI ships with the image. Use it via `docker exec` to approve users or inspect stats without copying files out:

```bash
 docker exec -it inkweld-backend \
   bun run admin-cli.ts users approve <username>
```

All commands reuse the running container's environment, so you never have to maintain a separate `.env` file for the CLI.

## Docker Compose

`compose.yaml` wires the backend together with its persistent volume:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8333:8333"
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET}
      - CLIENT_URL=${CLIENT_URL}
      - ALLOWED_ORIGINS=${CLIENT_URL}
    volumes:
      - inkweld_data:/data
volumes:
  inkweld_data:
```

For production, consider the hardened compose file at `compose.deploy.yaml`, which adds restart policies and externalized secrets.

## Health checks

Every container exposes `GET /health`, which returns JSON similar to:

```json
{"status":"ok","uptime":1.23,"backend":"bun"}
```

Use it in load balancers or Compose `healthcheck` blocks to ensure the instance is ready before accepting traffic.
