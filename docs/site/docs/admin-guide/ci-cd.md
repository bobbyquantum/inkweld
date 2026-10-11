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
   - Depends on the test and e2e jobs
   - Builds the Angular app once, then the backend image natively on amd64
     and arm64 runners
   - Pushes the multi-arch development image `ghcr.io/bobbyquantum/inkweld:dev`

### Release Please (`.github/workflows/release-please.yml`)

Runs on every push to `main` and keeps a release PR open (titled
`chore(main): release X.Y.Z`). The PR bumps the version and prepends a
CHANGELOG entry built from the Conventional Commit titles merged since the
last release. Merging it tags `vX.Y.Z`, creates the GitHub release, and calls
the release workflow below. See [Releasing](#releasing).

Configuration lives in `release-please-config.json` and
`.release-please-manifest.json` at the repository root.

### Release Workflow (`.github/workflows/release.yml`)

Builds the multi-arch (amd64 + arm64) release image from a `vX.Y.Z` tag.

#### Release triggers

- Called by Release Please after it creates a release
- A `v*` tag pushed by hand (used for v1.0.0-beta.1)

Tags that Release Please creates with the workflow's `GITHUB_TOKEN` do not
trigger other workflows, which is why it calls this one directly; the tag
push trigger therefore never builds the same release twice. Creating a GitHub
release does not trigger it.

#### Published tags

For `v1.2.3`: `1.2.3`, `1.2`, `1` and `latest`.

For a pre-release such as `v1.0.0-beta.2`: `1.0.0-beta.2` and the channel
`beta`. Until the first stable `vX.Y.Z` tag exists, a pre-release also moves
`latest`, so the documented `ghcr.io/bobbyquantum/inkweld:latest` works
during the 1.0 beta. After that, `latest` only follows stable releases.

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
| First visit                | setup screen, hosted server pre-filled | setup screen, hosted server pre-filled                    |

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

## Releasing

Inkweld follows [Semantic Versioning](https://semver.org/). Versions are
driven by squash-merged PR titles, which must be
[Conventional Commits](https://www.conventionalcommits.org/) (enforced by the
**Validate PR Title** check):

| PR title                                                    | Version bump | In the changelog     |
| ----------------------------------------------------------- | ------------ | -------------------- |
| `fix: …`                                                    | patch        | Bug Fixes            |
| `feat: …`                                                   | minor        | Features             |
| `feat!: …` or a `BREAKING CHANGE:` footer                   | major        | Breaking changes     |
| `perf: …`, `revert: …`                                      | patch        | Performance, Reverts |
| `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `style` | none         | hidden               |

During the 1.0 beta every release is the next beta instead (see
[1.0 beta](#10-beta)).

Renovate titles every dependency update `chore(deps): …`, so dependency bumps
stay out of the changelog and never cut a release on their own. Retitle a
Renovate PR `fix(deps): …` before merging when the update fixes something
users would notice.

### 1.0 beta

Inkweld is feature complete for 1.0, and the betas are for testing and bug
fixing. `release-please-config.json` sets `"versioning": "prerelease"`,
`"prerelease": true` and `"prerelease-type": "beta"`, so every release PR
during the beta is the next beta (`1.0.0-beta.1` → `1.0.0-beta.2`), whatever
the commit types, and its GitHub release is marked as a pre-release.

#### First beta (v1.0.0-beta.1)

v1.0.0-beta.1 is released by hand with the curated notes in `CHANGELOG.md`:

1. Merge the PR that sets the version to `1.0.0-beta.1`. Release Please runs
   on that merge but finds no releasable commits (`bootstrap-sha` in
   `release-please-config.json` points at the commit before it), so it does
   not open a release PR yet.
2. If it was not filled in before merging, replace the `YYYY-MM-DD`
   placeholder in the `## [1.0.0-beta.1]` heading of `CHANGELOG.md` with the
   release date (a `docs:` PR, which Release Please ignores).
3. Tag that commit on `main` and push the tag. This runs the release workflow
   and publishes the Docker image:

   ```bash
   git fetch origin
   git tag -a v1.0.0-beta.1 origin/main -m "v1.0.0-beta.1"
   git push origin v1.0.0-beta.1
   ```

4. Create the GitHub pre-release from the existing tag, with the body of the
   `## [1.0.0-beta.1]` CHANGELOG entry as its notes:

   ```bash
   gh release create v1.0.0-beta.1 --verify-tag --prerelease \
     --title "v1.0.0-beta.1" --notes-file <notes.md>
   ```

Release Please finds the previous release by its GitHub release, so it needs
the v1.0.0-beta.1 release to exist. If it opens a release PR before then
(because a `feat:` or `fix:` PR was merged first), close that PR; it is
recreated correctly on the next push to `main`.

#### Releasing 1.0.0

When the beta is done, merge a PR that sets `"prerelease": false` in
`release-please-config.json` (leave `"versioning": "prerelease"` in place).
The release PR then proposes `1.0.0` instead of the next beta (if nothing
user-facing has merged since the last beta, put a `Release-As: 1.0.0` footer
in that PR's squash commit message so the release PR opens). Before merging
that release PR, edit its CHANGELOG entry into an overview of 1.0.0 (the beta
entries stay below it). From then on, versions bump normally (`fix` →
1.0.1, `feat` → 1.1.0). To run another beta series later, set
`"prerelease": true` again and add a `Release-As: 1.1.0-beta.1` footer to the
commit that starts it.

### Releases after the first beta

1. Merge PRs to `main` as usual. Release Please keeps the release PR up to
   date with the next version and the generated changelog entry.
2. Review the release PR and edit its CHANGELOG entry if needed.
3. Merge it. Release Please tags `vX.Y.Z`, creates the GitHub release, and the
   release workflow publishes the Docker image.

The release PR is opened with `GITHUB_TOKEN`, so pull-request workflows (CI,
PR title validation) do not run on it. It only changes version strings and
`CHANGELOG.md`, and the merge to `main` runs CI as usual.

To force a specific version, add a `Release-As: X.Y.Z` footer to a commit
merged to `main`.

### Where the version lives

Release Please updates all of these in the release PR. Do not bump them by
hand:

- `package.json`, `frontend/package.json`, `backend/package.json`
- `backend/src/config/env.ts` and `frontend/src/environments/environment*.ts`,
  on the lines marked `// x-release-please-version`. A new hardcoded version
  needs the same marker and an entry under `extra-files` in
  `release-please-config.json`.

The hosted Cloudflare builds write their environment file with
`frontend/scripts/write-hosted-environment.mjs`, which reads the version from
the root `package.json`; the PR preview reads `frontend/package.json`. The in-app changelog (About → Changelog) reads
`CHANGELOG.md`, so its `## [X.Y.Z]` headings must keep the format Release
Please writes.

The OpenAPI `info.version` is the API contract version, not the app version,
and is not tied to releases.

### Deploying inkweld.app

Publishing a release does not deploy the hosted instance. inkweld.app is
deployed from the `production` branch: once the release commit has been
checked on preview, fast-forward `production` to it (see
[Promoting a release](#promoting-a-release)):

```bash
git fetch origin
git push origin vX.Y.Z^{commit}:production
```

### Repository settings

Release Please needs **Settings → Actions → General → Allow GitHub Actions to
create and approve pull requests** to open its release PR.

## Troubleshooting CI failures

- Inspect the failing job logs in GitHub Actions
- Ensure `npm test`, `bun test`, and `docker build` pass locally
- Verify that secrets (GHCR token, etc.) exist in repository settings
- Re-run failed jobs from the Actions UI once the issue is fixed
