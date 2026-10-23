---
title: CI/CD Pipeline
description: Understand how GitHub Actions builds, tests, and publishes the Inkweld backend image.
---

## Overview

GitHub Actions orchestrates linting, type checking, testing, container publishing and the hosted Cloudflare deploys for Inkweld. Successful pushes to `main` build and push a `:dev` Docker image to GitHub Container Registry (GHCR) and deploy the preview instance, pushes to `production` deploy inkweld.app, and version tags (`v*`) publish the versioned release images, including `:latest`.

## Workflows

### Main CI (`.github/workflows/ci.yml`)

#### CI triggers

- Pushes to `main`
- Pull requests targeting `main`

A newer push to the same ref cancels the run in progress.

#### Jobs

Most jobs run in parallel on Ubuntu runners. Use `bun install --frozen-lockfile` from the repo root.

| Job                                                 | What it does                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAPI Spec + Client Freshness**                 | Regenerates `backend/openapi.json` and the Angular client (`frontend/src/api-client/**`) and fails if the committed files differ. Fix with `cd backend && bun run generate:openapi && bun run generate:angular-client` (needs a Java runtime). |
| **Lint**                                            | `bun run lint` (code formatting and lint rules).                                                                                                                                                                                               |
| **Type Check**                                      | `bun run typecheck`: `bun check` over every TypeScript project (frontend app, specs, e2e and Storybook, backend, shared packages). It is the only check on specs, e2e and the backend.                                                         |
| **Unit Tests (Shared Packages)**                    | Coverage runs for `packages/inkweld-prosemirror`, `inkweld-presence` and `inkweld-async`.                                                                                                                                                      |
| **Unit Tests (Frontend) - Shard 1/1**               | Vitest. One shard; raise `shardTotal` in `ci.yml` to split it across runners.                                                                                                                                                                  |
| **Unit Tests (Frontend) - Coverage**                | Merges the shards' coverage reports (runs even if a shard failed, unless the run was cancelled).                                                                                                                                               |
| **Unit Tests (Backend)**                            | Bun test runner with an in-memory database and coverage.                                                                                                                                                                                       |
| **SonarCloud Code Analysis**                        | Scans with the merged coverage. Skipped for Renovate dependency PRs, and waits on the `sonarcloud-analysis` environment.                                                                                                                       |
| **E2E Tests (Local)**                               | Playwright against the frontend in local (offline) mode.                                                                                                                                                                                       |
| **E2E Tests (Online) - 2 shards**                   | Playwright against a Bun backend.                                                                                                                                                                                                              |
| **E2E Tests (Wrangler) - 3 shards**                 | Playwright against the backend running as a Cloudflare Worker under `wrangler dev` (local D1).                                                                                                                                                 |
| **E2E Tests (Docker) - 2 shards**                   | Playwright against the Docker image.                                                                                                                                                                                                           |
| **E2E Tests (Screenshots)**                         | Builds the docs site, which runs the Playwright tests that capture the documentation screenshots.                                                                                                                                              |
| **Build Frontend for Docker**                       | Pushes to `main` only. Starts after lint, type check, every unit-test job and every e2e job above have passed (SonarCloud is not required). Builds and compresses the Angular app.                                                             |
| **Build Docker (amd64)** / **Build Docker (arm64)** | Pushes to `main` only. Build and push the platform images.                                                                                                                                                                                     |
| **Create Docker Manifest**                          | Pushes to `main` only. Combines the two platform images into the multi-arch `:dev` tag.                                                                                                                                                        |

Pull requests run everything except the four Docker jobs.

#### Docker tags published from `main`

- `ghcr.io/bobbyquantum/inkweld:dev` (multi-arch manifest)
- `ghcr.io/bobbyquantum/inkweld:dev-amd64`
- `ghcr.io/bobbyquantum/inkweld:dev-arm64`

`:latest` is **not** published from `main`. It only moves when a release is tagged (below) or someone runs the manual publish workflow with the latest option.

### Release Workflow (`.github/workflows/release.yml`)

#### Release triggers

- A published GitHub release
- A pushed git tag that matches `v*`

#### What it publishes

Builds the `Dockerfile` image once and pushes it to GHCR as `v1.2.3` (the tag), `1.2.3`, `1.2`, `1` and `latest`. It does not re-run the test suite; tag a commit that has already passed CI on `main`.

### Cloudflare deploys (`deploy-cloudflare*.yml`)

The hosted instances run on Cloudflare (Pages for the frontend, a Worker +
D1 + R2 for the backend). Both are deployed by one reusable workflow,
`.github/workflows/deploy-cloudflare-reusable.yml`, so preview and production
build and ship exactly the same way and only differ in their inputs:

|                            | Preview                                | Production                                                    |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Caller workflow            | `deploy-cloudflare.yml`                | `deploy-cloudflare-production.yml`                            |
| Trigger                    | push to `main`                         | push to `production`, or **Run workflow** on `production`     |
| GitHub environment         | `preview`                              | `production`                                                  |
| Concurrency                | newer push cancels a running deploy    | queued, never cancelled mid-deploy                            |
| URL                        | `https://preview.inkweld.app`          | `https://inkweld.app`                                         |
| Pages project              | `inkweld-frontend-preview`             | `inkweld-frontend`                                            |
| D1 database / wrangler env | `inkweld_preview` / `--env preview`    | `inkweld_prod` / `--env production`                           |
| Angular configuration      | `preview` (`environment.preview.ts`)   | `cloudflare` (`environment.cloudflare.ts`)                    |
| First visit                | setup screen, hosted server pre-filled | setup screen, no server suggested (`advertise-server: false`) |

Each run writes `backend/wrangler.toml` from the environment's
`BACKEND_WRANGLER_TOML` variable, generates the frontend environment file
with `frontend/scripts/write-hosted-environment.mjs` (the version comes from
the root `package.json`), builds, deploys Pages, applies D1 migrations
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
- Accepts a custom tag (default `manual`) and a **Also tag as latest** toggle (off by default)

### Other workflows

| Workflow                                                                                      | Trigger                                                            | Purpose                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `deploy-pr-preview.yml`                                                                       | PR labelled `deploy:preview:frontend`, and new pushes to such a PR | Deploys the PR's frontend to a Cloudflare Pages branch preview (`https://pr-<number>.<pages project>.pages.dev`). |
| `cleanup-pr-preview.yml`                                                                      | PR closed, or the `deploy:preview:frontend` label removed          | Deletes that PR's Pages deployments.                                                                              |
| `docs.yml`                                                                                    | Push to `main` touching `docs/**`, `backend/openapi.json`; manual  | Builds this documentation site and publishes it to GitHub Pages.                                                  |
| `validate-pr-title.yml`                                                                       | PR opened, edited, synchronized or reopened                        | Requires a Conventional Commit title (`feat`, `fix`, `docs`, `ci`, ...) with a lowercase subject.                 |
| `deploy-cloudflare.yml`, `deploy-cloudflare-production.yml`, `deploy-cloudflare-reusable.yml` | Push to `main` / push to `production`                              | Hosted deploys, described in the section above.                                                                   |

## Image contents

- Bun runtime with the Hono API surface
- Angular production build served via the `bun-app.ts` static handler
- LevelDB + SQLite dependencies pre-installed
- Non-root user with `/data` as the writable volume

## Sample runtime configuration

`SESSION_SECRET`, `ALLOWED_ORIGINS` and `WEBAUTHN_RP_ID` are the settings a
production container needs. See [Configuration](/docs/configuration) for the
full list.

```bash
 docker run -p 8333:8333 -v inkweld_data:/data \
   -e NODE_ENV=production \
   -e SESSION_SECRET=${SESSION_SECRET} \
   -e ALLOWED_ORIGINS=https://app.inkweld.org \
   -e WEBAUTHN_RP_ID=app.inkweld.org \
   ghcr.io/bobbyquantum/inkweld:latest
```

## Build optimizations

- Docker layer caching via the `actions/cache` integration
- Bun dependency caching for both frontend and backend
- Frontend build artifacts cached between stages to avoid duplicate work

## Monitoring builds

- The build status badge in `README.md` reflects the latest `ci.yml` run on `main`
- Published images are listed on the repository's [GHCR package page](https://github.com/bobbyquantum/inkweld/pkgs/container/inkweld)
- GitHub Actions logs retain full console output for every job
- Image metadata embeds the source commit for traceability

## Contributor workflow

1. Create a feature branch
2. Make changes + add tests
3. Push and open a PR
4. CI runs linting, type checking, unit tests and the e2e suites
5. Review + merge to `main`
6. The Docker jobs publish the `:dev` image and preview.inkweld.app is redeployed
7. When preview looks right, promote to inkweld.app by fast-forwarding `production`

## Release workflow

1. Create a GitHub release or push a tag (e.g., `v1.0.0`)
2. The release workflow pushes the versioned images and moves `latest`
3. Clients can pin exact tags (`1.0.0`, `v1.0.0`), a minor (`1.0`), or a floating major (`1`)

## Wrangler version pin

`backend/package.json` pins `wrangler` to an **exact** `4.116.0` (no caret), and Renovate is disabled for it in `renovate.json`. Do not change it to a range.

- **Why**: wrangler ≥ 4.121 pulls miniflare 5.x-alpha, where any transient ProxyWorker disconnect ("Network connection lost.") makes `wrangler dev` exit with an **empty** `[ERROR]` mid-run, and every test after it fails with `ECONNREFUSED ::1:9333`. This flaked the `e2e-wrangler` job constantly after the 2026-08-12 lockfile maintenance (#1300). It does not reproduce on dev machines; CI runner contention provides the dropped connections.
- **Upstream**: cloudflare/workers-sdk#15317 (also #15203, #4562). 4.116.0 is the last release on the miniflare 4.x line.
- **The pin alone is not enough**: 4.116.0 has the same defect at a lower frequency (two crashes on 2026-08-25 while pinned). The mechanism: a client aborting an in-flight request rejects the ProxyWorker's internal proxy fetch with "Network connection lost."; the ProxyWorker posts a `type: "error"` message; `DevEnv.handleErrorEvent` re-emits it as a fatal `"error"` event; the dev command's `await events.once(devEnv, "teardown")` rejects (Node's `events.once` rejects on `"error"`), and the process exits.
- **Local patch**: `backend/patches/wrangler@4.116.0.patch` (applied through `patchedDependencies` in `backend/package.json`) makes "Error inside ProxyWorker" events non-fatal. They log as `Non-fatal error in ProxyController: ...` warnings, the affected request fails, and the server keeps running. It also fixes `castErrorCause` so the cause's message and stack reach the log instead of an empty `[ERROR]`. To reproduce, send POSTs with a partial body and reset the socket mid-request: unpatched wrangler dies on the first one, patched wrangler logs a warning and keeps serving.
- **Unpin when** #15317 ships a fixed release: restore `"wrangler": "^<ver>"`, re-lock, drop the patch (`backend/patches/` + `patchedDependencies`), and re-enable the Renovate rule. If you bump wrangler while the patch is still needed, regenerate it against the new version (`bun patch wrangler`); a stale version key in `patchedDependencies` fails the install.
- The wrangler e2e job sets `WRANGLER_LOG=debug` + `WRANGLER_LOG_PATH` and uploads wrangler's diagnostic log as an artifact (`wrangler-diag-log-shard-*`). The real crash cause only appears there, not in the console's empty `[ERROR]`.
- **Retries (since 2026-09-09)**: `playwright.wrangler.config.ts` retries once in CI like the online/local/docker configs. It used to be `retries: 0` so a backend crash would surface immediately, but with the crash fixed the only thing that caught was one-off frontend flakes (a page that never rendered after `goto`, a UI race) that hit the other jobs at the same rate and pass there on retry. Don't set it back to 0 to find bugs: every e2e job traces the first attempt of each test (`trace: 'retain-on-first-failure'`) and uploads `frontend/test-results/` as `playwright-test-results-*` even when the job is green. Open a flaky test's trace with `npx playwright show-trace <trace.zip>`.

## Troubleshooting CI failures

- Inspect the failing job logs in GitHub Actions
- Ensure `npm test` (frontend), `bun test` (backend), `bun run lint`, `bun run typecheck` and `docker build` pass locally
- Verify that secrets (GHCR token, etc.) exist in repository settings
- Re-run failed jobs from the Actions UI once the issue is fixed
