---
title: CI/CD Pipeline
description: Understand how GitHub Actions builds, tests, and publishes the Inkweld backend image.
---

## Overview

GitHub Actions orchestrates linting, testing, and container publishing for Inkweld. Successful pushes to `main` build and push a Docker image to GitHub Container Registry (GHCR), while tagged releases produce versioned artifacts.

## Workflows

### Main CI (`.github/workflows/ci.yml`)

#### CI triggers

- Pushes to `main`
- Pull requests targeting `main`

#### Jobs

1. **Test**
   - Uses Ubuntu runners
   - Installs Bun + Node dependencies for both apps
   - Runs linting and the full Jest/Bun test suites
2. **Docker Publish** (only on `main` pushes)
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
6. Docker publish job produces the latest image

## Release workflow

1. Create a GitHub release (e.g., `v1.0.0`)
2. Release workflow tags and pushes versioned images
3. Clients can pin exact tags (`v1.0.0`) or floating majors (`1`)

## Troubleshooting CI failures

- Inspect the failing job logs in GitHub Actions
- Ensure `npm test`, `bun test`, and `docker build` pass locally
- Verify that secrets (GHCR token, etc.) exist in repository settings
- Re-run failed jobs from the Actions UI once the issue is fixed
