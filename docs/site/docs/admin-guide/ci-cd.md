---
title: CI/CD Pipeline
description: Understand how GitHub Actions builds, tests, and publishes the Inkweld backend image.
---

## Overview

GitHub Actions orchestrates linting, testing, container publishing and the hosted Cloudflare deploys for Inkweld. Successful pushes to `main` build and push a Docker image to GitHub Container Registry (GHCR) and deploy the preview instance, pushes to `production` deploy inkweld.app, and tagged releases produce versioned artifacts.

## Workflows

### Main CI (`.github/workflows/ci.yml`)

#### CI triggers

- Pushes to `main`
- Pull requests targeting `main`

#### Jobs

1. **OpenAPI Spec + Client Freshness**
   - Regenerates `backend/openapi.json` and the Angular client
     (`frontend/src/api-client/**`) from the current routes
   - Fails if the committed artifacts differ, so the typed client can never
     drift from the API
   - Fix a failure with:
     `cd backend && bun run generate:openapi && bun run generate:angular-client`
2. **Test**
   - Uses Ubuntu runners
   - Installs Bun + Node dependencies for both apps
   - Runs linting and the full Vitest/Bun test suites
3. **Docker Publish** (only on `main` pushes)
   - Depends on the test job
   - Builds the Angular app, then the bundled backend Docker image
   - Pushes to GHCR with cache reuse enabled

Published tags:

- `ghcr.io/bobbyquantum/inkweld:latest`
- `ghcr.io/bobbyquantum/inkweld:main-<commit-sha>`

### Release Workflow (`.github/workflows/release.yml`)

#### Release triggers

- GitHub releases
- Git tags that match `v*`

#### Features

- Semantic versioning helpers
- Always updates the `latest` tag alongside semantic tags
- Publishes `v1.2.3`, `1.2`, and `1`

### Cloudflare deploys (`deploy-cloudflare*.yml`)

The hosted instances run on Cloudflare (Pages for the frontend, a Worker +
D1 + R2 for the backend). Both are deployed by one reusable workflow,
`.github/workflows/deploy-cloudflare-reusable.yml`, so preview and production
build and ship exactly the same way and only differ in their inputs:

|                            | Preview                                | Production                                                |
| -------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Caller workflow            | `deploy-cloudflare.yml`                | `deploy-cloudflare-production.yml`                        |
| Trigger                    | push to `main`                         | push to `production`, or **Run workflow** on `production` |
| GitHub environment         | `preview`                              | `production`                                              |
| Concurrency                | newer push cancels a running deploy    | queued, never cancelled mid-deploy                        |
| URL                        | `https://preview.inkweld.app`          | `https://inkweld.app`                                     |
| Pages project              | `inkweld-frontend-preview`             | `inkweld-frontend`                                        |
| D1 database / wrangler env | `inkweld_preview` / `--env preview`    | `inkweld_prod` / `--env production`                       |
| Angular configuration      | `preview` (`environment.preview.ts`)   | `cloudflare` (`environment.cloudflare.ts`)                |
| First visit                | setup screen, hosted server pre-filled | connects to the hosted server                             |

Each run writes `backend/wrangler.toml` from the environment's
`BACKEND_WRANGLER_TOML` variable, generates the frontend environment file
with `frontend/scripts/write-hosted-environment.mjs` (the version comes from
the root `package.json`), injects the Play app-signing fingerprint into
`/.well-known/assetlinks.json`, builds, deploys Pages, applies D1 migrations
and deploys the Worker. All variables and secrets are read from the GitHub
environment; see [Cloudflare installation](../installation/cloudflare.md#automated-deployment-via-github-actions)
for the full list.

#### Branch model

- `main` is the integration branch. Every merge deploys to preview.
- `production` is a long-lived branch that only ever points at a commit that
  is already on `main`. Pushing to it deploys inkweld.app. Nobody commits to
  it directly and it is never merged back.

#### Promoting a release

Check the commit on preview first, then fast-forward `production` to it:

```bash
git fetch origin
git push origin origin/main:production
```

To promote an older commit than the tip of `main`, push that commit instead:

```bash
git push origin <commit-sha>:production
```

The push is rejected unless it is a fast-forward, which keeps production
moving forward along `main`. If the `production` environment has required
reviewers, the deploy waits for an approval in the Actions run. **Run
workflow** on the production workflow redeploys the current `production`
commit (it refuses any other branch).

#### Hotfixes and rollbacks

Fix on `main` like any other change (it reaches preview first), then promote
it. To roll back, revert on `main` and promote the revert; Cloudflare's own
deployment rollback (Workers & Pages → Deployments) is the emergency option,
but D1 migrations are forward-only, so a rolled-back Worker must still work
with the newer schema.

### Manual Docker Publish (`.github/workflows/docker-publish.yml`)

**Use it when** you need a hotfix image or want to test a custom tag without merging to `main`.

- Triggered manually through the Actions UI
- Accepts a custom tag and optional `latest` toggle

## Image contents

- Bun runtime with the Hono API surface
- Angular production build served via the `bun-app.ts` static handler
- LevelDB + SQLite dependencies pre-installed
- Non-root user with `/data` as the writable volume

## Sample runtime configuration

```bash
 docker run -p 8333:8333 -v inkweld_data:/data \
   -e NODE_ENV=production \
   -e SESSION_SECRET=${SESSION_SECRET} \
   -e CLIENT_URL=https://app.inkweld.org \
   ghcr.io/bobbyquantum/inkweld:latest
```

## Build optimizations

- Docker layer caching via the `actions/cache` integration
- Bun dependency caching for both frontend and backend
- Frontend build artifacts cached between stages to avoid duplicate work

## Monitoring builds

- Status badges in `README.md` reflect the latest CI and Docker publish state
- GitHub Actions logs retain full console output for every job
- Image metadata embeds the source commit for traceability

## Contributor workflow

1. Create a feature branch
2. Make changes + add tests
3. Push and open a PR
4. CI runs linting + tests
5. Review + merge to `main`
6. Docker publish job produces the latest image and preview.inkweld.app is redeployed
7. When preview looks right, promote to inkweld.app by fast-forwarding `production`

## Release workflow

1. Create a GitHub release (e.g., `v1.0.0`)
2. Release workflow tags and pushes versioned images
3. Clients can pin exact tags (`v1.0.0`) or floating majors (`1`)

## Troubleshooting CI failures

- Inspect the failing job logs in GitHub Actions
- Ensure `npm test`, `bun test`, and `docker build` pass locally
- Verify that secrets (GHCR token, etc.) exist in repository settings
- Re-run failed jobs from the Actions UI once the issue is fixed
