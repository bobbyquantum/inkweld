---
id: getting-started
title: Getting Started
description: Set up the Inkweld monorepo, run the dev servers, and understand the workflow before you deploy.
sidebar_position: 2
---

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js 20+](https://nodejs.org/) (Angular dev server runs on Node)
- [Bun 1.3+](https://bun.sh/) (backend + workspace scripts)
- [Docker](https://www.docker.com/) optional but recommended for parity testing
- Cloudflare account (optional, only for the Worker build)

## Install dependencies

```bash
 git clone https://github.com/bobbyquantum/inkweld.git
 cd inkweld
 bun run install-all
```

The `install-all` script installs root tools, the Angular frontend, and the Bun backend in one go.

## Configure environment files

```bash
 # Backend
 cd backend
 cp .env.example .env

 # Frontend (only if you need overrides)
 cd ../frontend
 cp .env.example .env
```

Key backend settings (see `backend/.env.example`):

- `PORT`, `HOST`, `CLIENT_URL`
- `DB_TYPE`, `DB_PATH`, `DATA_PATH`
- `SESSION_SECRET`, `ALLOWED_ORIGINS`
- Optional GitHub OAuth flags

## Run in development

From the repo root, start both servers with one command:

```bash
 npm start
```

That launches the Bun backend on port `8333` and the Angular dev server on port `4200`. If you prefer to control them independently:

```bash
 # Backend (Bun runtime)
 cd backend
 bun run dev

 # Alternative runners
 bun run dev:node
 bun run dev:worker

 # Frontend
 cd ../frontend
 bun run start
```

## Testing and linting

```bash
 # Full workspace helpers
 bun run lint
 bun run test

 # Backend only
 cd backend
 bun run lint
 bun test

 # Frontend only
 cd ../frontend
 npm run lint
 npm test
 npm run e2e
```

Frontend unit tests use Jest, while end-to-end coverage runs through Playwright with fixtures in `frontend/e2e/fixtures.ts`. Backend tests run via Bun.

## Building artifacts

### Frontend

```bash
 cd frontend
 bun run clean
 bun run build
 bun run compress   # optional bundle compression
```

### Backend

```bash
 cd backend
 bun run build          # Bun target
 bun run build:node     # Node target
 bun run build:worker   # Cloudflare Worker preview
```

Backend builds land in `backend/dist/` and include the Bun runner, the Node runner, and Worker bundles.

## Docker and Compose

The backend Dockerfile bundles the Angular production build and serves it from the same container as the API, so `http://localhost:8333/` loads the SPA while `/api/**` remains JSON-only.

```bash
 docker build -t inkweld-backend -f backend/Dockerfile .
 docker run -p 8333:8333 -v inkweld_data:/data \
   -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
   -e CLIENT_URL=http://localhost:4200 \
   inkweld-backend
```

Key runtime notes:

- `SESSION_SECRET` must be 32+ characters.
- Mount `/data` to keep SQLite + LevelDB data between restarts.
- Override `FRONTEND_DIST` if you need to serve a different static bundle.
- Drizzle migrations from `/app/backend/drizzle` run automatically on container start; set `DRIZZLE_MIGRATIONS_DIR` to override.

For compose-based deployments:

```bash
 docker compose -f compose.yaml up -d --build
```

See [Deployment → Docker](./hosting/docker) for production-focused guidance.

## Cloudflare Worker / Durable Objects

```bash
 cd backend
 cp wrangler.toml.example wrangler.toml
 npx wrangler d1 create inkweld_dev
 npx wrangler d1 create inkweld_prod
 bun run deploy:dev
```

Add your D1 IDs and Durable Object bindings to `wrangler.toml`, then use `bun run logs:dev` (or `logs:prod`) to inspect deployments.

## Admin CLI quick reference

The Bun-based CLI (`backend/admin-cli.ts`) manages users, projects, and stats without requiring the UI:

```bash
 cd backend

 # Inspect pending registrations
 bun run admin users pending

 # Approve a user
 bun run admin users approve <username>

 # Review overall stats
 bun run admin stats
```

Inside Docker you can reuse the CLI against the running container:

```bash
 docker exec -it inkweld-backend \
   bun run admin-cli.ts users approve <username>
```

The CLI loads the same `.env` values as the backend, so double-check `DATABASE_URL` and `DATA_PATH` before pointing it at production data.

## Verify the backend image locally

```bash
 docker build -t inkweld/backend:dev -f backend/Dockerfile .
 docker run --rm -p 8333:8333 \
   -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
   -e CLIENT_URL=http://localhost:4200 \
   inkweld/backend:dev
 curl http://localhost:8333/health
```

For multi-platform testing, use BuildKit: `docker buildx build --platform linux/amd64,linux/arm64 --load -t inkweld/backend:dev -f backend/Dockerfile .`

## Next steps

- Review the [Docker deployment guide](./hosting/docker) for production hardening.
- Learn how CI/CD publishes the container in [Deployment → CI/CD](./hosting/ci-cd).
- Keep commands handy with the [admin CLI reference](./hosting/admin-cli).
- If something breaks in production, start with the [Troubleshooting](./troubleshooting/cookies) section.
