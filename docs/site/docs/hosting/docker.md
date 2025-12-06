---
title: Docker Deployment
description: Build and run the bundled backend+SPA container, configure volumes, and customize runtime options.
---

## Quick Start with Deployment Wizard

The easiest way to deploy Inkweld with Docker is using the interactive deployment wizard:

```bash
cd backend
bun run admin-cli.ts deploy
```

Select option **1. Docker** and follow the prompts. The wizard will:

- ✅ Check if Docker is installed
- ✅ Detect existing configuration or gather settings interactively
- ✅ Generate `.env` file with secure defaults
- ✅ Build the Docker image
- ✅ Create data volume
- ✅ Start the container
- ✅ Show you how to access Inkweld

**Configuration options include:**

- Port number (default: 8333)
- Database type (SQLite or PostgreSQL)
- Session secret (auto-generated)
- Domain/URL
- User approval requirements
- GitHub OAuth (optional)

---

## Manual Deployment

If you prefer manual control, follow these steps:

## Overview

The Dockerfile produces a single ~200MB image that compiles the Angular frontend and Bun backend into a standalone binary. The container serves both the SPA at `/` and the API at `/api/**` from port `8333`.

## Build the image

From the repo root:

```bash
docker build -t inkweld:local .
```

For multi-platform testing, enable BuildKit and run:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t inkweld:local --load .
```

## Runtime essentials

```bash
docker run -p 8333:8333 -v inkweld_data:/data \
  -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
  --name inkweld \
  inkweld:local
```

Key flags:

- **Port mapping**: expose port `8333` (configurable via `PORT` env var).
- **Volume**: mount `/data` to persist SQLite database and Yjs documents.
- **Secrets**: `SESSION_SECRET` must be 32+ characters; keep it private.

## Environment variables

| Variable                 | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `PORT`                   | HTTP port (default 8333)                                         |
| `SESSION_SECRET`         | Session encryption key (required, 32+ chars)                     |
| `ALLOWED_ORIGINS`        | Comma-separated list for CORS                                    |
| `DB_TYPE`                | `sqlite` or `d1` (container defaults to SQLite)                  |
| `DB_PATH`                | SQLite path, defaults to `/data/sqlite.db`                       |
| `DATA_PATH`              | Yjs document storage location (`/data/yjs`)                      |
| `SERVE_FRONTEND`         | Set to `false` to disable frontend serving (API-only mode)       |
| `GITHUB_ENABLED`         | Enable GitHub OAuth (default: false)                             |
| `USER_APPROVAL_REQUIRED` | Require admin approval for new users (default: true)             |

## Automatic migrations

On boot, the image runs Drizzle migrations against the SQLite database. The migrations are bundled in the image at `/app/drizzle`.

## Docker Compose

`compose.yaml` wires everything together with persistent volume:

```yaml
services:
  inkweld:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '8333:8333'
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    volumes:
      - inkweld_data:/data
volumes:
  inkweld_data:
```

For production deployment with pre-built images, use `compose.deploy.yaml` which pulls from GitHub Container Registry.

## Health checks

Every container exposes `GET /health`, which returns JSON similar to:

```json
{ "status": "ok", "uptime": 1.23, "backend": "bun" }
```

Use it in load balancers or Compose `healthcheck` blocks to ensure the instance is ready before accepting traffic.
