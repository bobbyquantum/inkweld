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
 bun install
```

This installs all dependencies for the root, Angular frontend, and Bun backend.

## Configure environment files

```bash
 # From project root
 cp .env.example .env
```

Key backend settings (see `.env.example` at project root):

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

The Dockerfile bundles the Angular production build into a single Bun binary that serves both the SPA and API from the same container. Access `http://localhost:8333/` for the frontend and `/api/**` for the API.

```bash
docker build -t inkweld .
docker run -p 8333:8333 -v inkweld_data:/data \
  -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
  inkweld
```

Key runtime notes:

- `SESSION_SECRET` must be 32+ characters.
- Mount `/data` to persist SQLite database and Yjs documents between restarts.
- Set `SERVE_FRONTEND=false` to run in API-only mode (if hosting frontend separately).
- Drizzle migrations run automatically on container start.

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
docker exec -it inkweld \
   ./inkweld-server admin users approve <username>
```

The CLI loads the same `.env` values as the backend, so double-check database paths before pointing it at production data.

## Verify the Docker image locally

```bash
docker build -t inkweld:dev .
docker run --rm -p 8333:8333 \
  -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
  inkweld:dev
curl http://localhost:8333/api/v1/health
```

For multi-platform testing, use BuildKit: `docker buildx build --platform linux/amd64,linux/arm64 --load -t inkweld:dev .`

## Next steps

- Review the [Docker deployment guide](./hosting/docker) for production hardening.
- Learn how CI/CD publishes the container in [Deployment → CI/CD](./hosting/ci-cd).
- Keep commands handy with the [admin CLI reference](./hosting/admin-cli).
- If something breaks in production, start with the [Troubleshooting](./troubleshooting/cookies) section.
