---
id: getting-started
title: Developer Setup
description: Set up the Inkweld monorepo, run the dev servers, and understand the workflow before you deploy.
sidebar_position: 2
---

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 22.22.3+, 24.15+ or 26+ (the Angular CLI rejects other versions)
- [Bun 1.4+](https://bun.sh/) (backend + workspace scripts)
- [Docker](https://www.docker.com/) optional but recommended for parity testing
- Cloudflare account (optional, only for the Worker build)

## Install dependencies

```bash
 git clone https://github.com/bobbyquantum/inkweld.git
 cd inkweld
 bun install
```

This installs all dependencies for the root, Angular frontend, Bun backend, and the shared `packages/*`. Always install from the repo root with `bun install`; never run `npm install` inside `frontend/`, `backend/` or `docs/site/` (a guard script will refuse). The `npm run ...` scripts used below are fine, they only invoke tools.

## Configure environment files

```bash
 # From project root
 cp .env.example .env
```

Key backend settings (see `.env.example` at project root):

- `PORT`, `NODE_ENV`
- `DB_PATH`, `DATA_PATH`
- `SESSION_SECRET` (32+ characters; required outside development), `ALLOWED_ORIGINS` (every URL you open the app from, default `http://localhost:4200`; add `http://localhost:8333` if you open the app from the backend port)
- `SERVE_FRONTEND`, `FRONTEND_DIST`
- `PASSKEYS_ENABLED`, `PASSWORD_LOGIN_ENABLED`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`
- Optional GitHub OAuth flags

Every variable is documented in the [Configuration reference](./configuration.md).

:::note Signing in on localhost
Inkweld is passwordless-first: `PASSWORD_LOGIN_ENABLED` defaults to `false`, so in a fresh dev setup you register and sign in with a **passkey** (your device's biometrics or a security key). `localhost` works as a WebAuthn relying party, and the frontend on `:4200` and the backend on `:8333` share it. If you want username/password forms for development or scripting, add `PASSWORD_LOGIN_ENABLED=true` to `.env` and restart the backend.
:::

## Run in development

From the repo root, start both servers with one command:

```bash
 npm run dev
```

That launches the Bun backend on port `8333` and the Angular dev server on port `4200`. If you prefer to control them independently:

```bash
 # Backend (Bun runtime)
 cd backend
 bun run dev

 # Alternative runners
 bun run dev:node
 bun run dev:worker

 # Frontend (Bun runs Angular CLI via Node.js)
 cd ../frontend
 bun run start
```

## Testing and linting

```bash
 # Full workspace helpers (from root)
 npm run lint
 npm test
 npm run typecheck   # bun check across packages, frontend and backend

 # Backend only
 cd backend
 bun run lint
 bun test

 # Frontend only
 cd ../frontend
 npm run lint
 npm test            # not `bun test`: Bun's runner can't run the Angular tests
 npm run e2e
```

Frontend unit tests use Vitest (`npm test`), while end-to-end coverage runs through Playwright. Its fixtures live next to the specs, one set per category: `frontend/e2e/local/fixtures.ts` (Browser profile, no backend), `frontend/e2e/online/fixtures.ts` (real backend), `frontend/e2e/mcp/fixtures.ts` and `frontend/e2e/screenshots/fixtures.ts`. `npm run e2e` runs the local and online suites; see `frontend/e2e/README.md`. Backend tests run via `bun test`.

`npm run typecheck` runs `bun check` (a fast TypeScript port) over every project, including specs, e2e tests and the backend, which Vitest, Playwright and `bun test` do not type check. CI runs it as the Type Check job. A git pre-commit hook (Husky + lint-staged) formats staged files automatically.

## Building artifacts

### Frontend

```bash
 cd frontend
 bun run clean
 bun run build
 bun run compress-wasm   # optional: Brotli-compress the .wasm files in place
```

From the repo root, `npm run build` builds the frontend, embeds it for the backend, and builds the backend in one go.

### Backend

```bash
 cd backend
 bun run build          # Bun target
 bun run build:node     # Node target
 bun run build:worker   # wrangler deploy --dry-run: validates the Worker bundle, writes nothing to dist/
```

`bun run build` and `bun run build:node` write to `backend/dist/` (the Bun and Node runners). `build:worker` only checks that the Worker bundles; it needs a `wrangler.toml` (see below) and produces no output.

## Docker and Compose

The Dockerfile bundles the Angular production build into a single Bun binary that serves both the SPA and API from the same container. Access `http://localhost:8333/` for the frontend and `/api/**` for the API.

```bash
docker build -t inkweld .
docker run -p 8333:8333 -v inkweld_data:/data \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e WEBAUTHN_RP_ID=localhost \
  -e ALLOWED_ORIGINS=http://localhost:8333 \
  inkweld
```

Key runtime notes:

- The image runs with `NODE_ENV=production`, so `SESSION_SECRET` (32+ characters) and `WEBAUTHN_RP_ID` are required or the container exits at startup. Keep the secret: a new one signs everyone out.
- Mount `/data` to persist SQLite database and Yjs documents between restarts.
- Set `SERVE_FRONTEND=false` to run in API-only mode (if hosting frontend separately).
- Drizzle migrations run automatically on container start.

For compose-based deployments:

```bash
 docker compose -f compose.yaml up -d --build
```

See [Deployment → Docker](./installation/docker) for production-focused guidance.

## Cloudflare Worker / Durable Objects

```bash
 # Interactive setup from the repo root: copies wrangler.toml.example,
 # creates the resources and fills in the IDs
 bun run cloudflare:setup
```

Or by hand: `cd backend && cp wrangler.toml.example wrangler.toml`, create the D1 databases it names (`inkweld_preview`, `inkweld_prod`), and add their IDs and the Durable Object bindings to `wrangler.toml`. The example has `preview` and `production` environments. Then use the root scripts:

```bash
 bun run cloudflare:preview:deploy   # build, deploy the frontend, migrate D1, deploy the Worker (--env preview)
 bun run cloudflare:preview:migrate  # D1 migrations only
 bun run cloudflare:preview:logs     # wrangler tail --env preview
 bun run cloudflare:prod:deploy      # same for production
 bun run cloudflare:prod:migrate
 bun run cloudflare:prod:logs
 bun run cloudflare:undeploy         # DESTRUCTIVE: removes a Cloudflare deployment
```

For local Worker development use `cd backend && bun run dev:worker` (`wrangler dev`). The hosted preview and production sites are deployed by CI, see [CI/CD](./admin-guide/ci-cd.md).

## Admin panel

All user management, system stats, and configuration are handled through the web-based admin panel at `/admin`. Log in as an admin user to:

- Approve or reject pending registrations
- View system health statistics (user counts, project counts, uptime)
- Configure settings, announcements, and AI features
- Manage email settings

## Deployment wizard

To set up a new deployment interactively, run the deployment wizard from the project root:

```bash
bun run deploy
```

It supports Docker, Docker Compose, and Cloudflare Workers deployment methods.

## Verify the Docker image locally

```bash
docker build -t inkweld:dev .
docker run --rm -p 8333:8333 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e WEBAUTHN_RP_ID=localhost \
  -e ALLOWED_ORIGINS=http://localhost:8333 \
  inkweld:dev
curl http://localhost:8333/api/v1/health
```

For multi-platform testing, use BuildKit: `docker buildx build --platform linux/amd64,linux/arm64 --load -t inkweld:dev .`

## Next steps

- Review the [Docker deployment guide](./installation/docker) for production hardening.
- Learn how CI/CD publishes the container in [Admin Guide → CI/CD](./admin-guide/ci-cd).
- If something breaks in production, start with the [Troubleshooting](./troubleshooting/logging) section.
