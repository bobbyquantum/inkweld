---
id: cloudflare
title: Cloudflare Workers Deployment
description: Deploy Inkweld to Cloudflare's global edge network with the interactive setup wizard.
sidebar_position: 2
---

# Cloudflare Workers Deployment

Deploy Inkweld to Cloudflare's global edge network for low-latency access worldwide. This guide walks you through the **interactive setup wizard** - the easiest way to get started.

## Overview

Cloudflare deployment uses:

- **Cloudflare Workers** - Serverless backend API at the edge
- **Cloudflare Pages** - Global CDN for the Angular frontend
- **D1 Database** - SQLite-based database for user data and projects
- **R2 Storage** - Object storage for uploads (covers, avatars, inline images). Required: without the `STORAGE` bucket binding every upload fails
- **Durable Objects** - Real-time collaborative editing with Yjs

## Prerequisites

Before you begin:

1. **Cloudflare Account** - [Sign up free](https://dash.cloudflare.com/sign-up)
2. **Git** - For cloning the repository
3. **Bun 1.4+** - Backend runtime and package manager
4. **Node.js 22.22.3+** (or 24.15+ / 26+) - Builds the Angular frontend during deploy

:::tip[Free Tier Available]
Cloudflare offers generous free tiers for all required services. You can run Inkweld without any charges for development and small-scale use.
:::

## Quick Start with Setup Wizard

The setup wizard automates the entire deployment process:

```bash
# Clone the repository
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld

# Install dependencies
bun install

# Run the Cloudflare setup wizard
npm run cloudflare:setup
```

### What the Wizard Does

The wizard guides you through each step:

```
============================================================
  Inkweld Cloudflare Setup
============================================================

✅ Wrangler CLI is installed
✅ Logged in to Cloudflare

============================================================
  Environment Selection
============================================================

Available environments:

  preview     - Pre-production environment for testing
  production  - Live production environment

Set up PREVIEW environment? (Y/n): y
Set up PRODUCTION environment? (Y/n): y
```

If `backend/wrangler.toml` already exists, the wizard reads its worker names, database IDs and backend domains as defaults, then recreates the file from `wrangler.toml.example`.

### Step 1: Worker Configuration

The wizard detects your Cloudflare account, asks for your **workers.dev subdomain** (needed to build the correct API URLs; find it under **Workers & Pages → Overview** in the dashboard) and suggests unique worker names:

```
============================================================
  Worker Configuration
============================================================

ℹ️  Worker names must be globally unique across all Cloudflare accounts.
ℹ️  Detected account: your-account-name
ℹ️  Your workers.dev subdomain is required to generate the correct API URLs.

Your workers.dev subdomain (default: your-account): your-account
✅ Using subdomain: your-account

Worker name for PREVIEW (default: your-account-inkweld-preview):
ℹ️  Preview worker URL: https://your-account-inkweld-preview.your-account.workers.dev
Continue with this? (Y/n): y

Worker name for PRODUCTION (default: your-account-inkweld):
ℹ️  Production worker URL: https://your-account-inkweld.your-account.workers.dev
Continue with this? (Y/n): y
```

:::info[Worker Name Uniqueness]
Worker names must be globally unique across all Cloudflare accounts. The wizard suggests names based on your account to avoid conflicts.
:::

### Step 2: Import Existing Configuration

If you're setting up on a new machine with existing deployments, the wizard can import your configuration:

```
Try to import existing environment variables from Cloudflare? (Y/n): y
✅ Found existing preview configuration
✅ Found existing production configuration
```

### Step 3: Create Resources

The wizard creates all required Cloudflare resources:

```
============================================================
  Creating D1 Databases
============================================================

ℹ️  Creating D1 database: inkweld_preview...
✅ Created database "inkweld_preview" with ID: abc123...

ℹ️  Creating D1 database: inkweld_prod...
✅ Created database "inkweld_prod" with ID: def456...

============================================================
  Creating R2 Storage Buckets
============================================================

✅ Created R2 bucket: inkweld-storage-preview
✅ Created R2 bucket: inkweld-storage

============================================================
  Creating Cloudflare Pages Projects
============================================================

✅ Created Pages project: inkweld-frontend-preview
✅ Created Pages project: inkweld-frontend

============================================================
  Custom Domains (Optional)
============================================================

Configure custom domains for preview? (Y/n): n
```

Custom domains are optional; see [Custom Domain](#custom-domain). The wizard also writes `ALLOWED_ORIGINS` and **`WEBAUTHN_RP_ID`** into `wrangler.toml`, derived from the frontend domain (your custom frontend domain, or `<pages-project>.pages.dev` when you skip custom domains).

:::warning[WEBAUTHN_RP_ID is permanent]
`WEBAUTHN_RP_ID` is the domain passkeys are bound to. It **cannot be changed after any user registers a passkey** without invalidating every credential. If you will later move from `*.pages.dev` to a custom domain, set up the custom domain before inviting users.
:::

### Step 4: Generate Frontend Configuration

The wizard automatically generates environment files for the frontend:

```
============================================================
  Generating Frontend Environment Files
============================================================

ℹ️  Frontend environment files configure the API URLs for each environment.
ℹ️  Workers will be available at:
ℹ️    Preview:    https://your-account-inkweld-preview.your-account.workers.dev
ℹ️    Production: https://your-account-inkweld.your-account.workers.dev

✅ Generated environment.preview.ts
✅ Generated environment.cloudflare.ts
```

### Step 5: Run Migrations

Apply the database schema:

```
============================================================
  Running Database Migrations
============================================================

Run database migrations now? (Y/n): y
ℹ️  Running migrations on inkweld_preview...
✅ Preview database migrated
ℹ️  Running migrations on inkweld_prod...
✅ Production database migrated
```

### Step 6: Set Secrets

Configure sensitive values securely:

```
============================================================
  Setting Secrets
============================================================

ℹ️  SESSION_SECRET is required for each environment.
ℹ️  This is a cryptographic key used to sign session tokens.
⚠️  CRITICAL: If this key is used for database encryption, changing it will
    make existing data unreadable!

Some secrets are missing. Would you like to set them now? (Y/n): y
Generate a secure random secret? (recommended) (Y/n): y
✅ Generated secret: AbCdEf12...WxYz
ℹ️  (Full secret will be set but not displayed for security)
✅ Preview secret set
Use a DIFFERENT secret for production? (more secure) (Y/n): y
✅ Production secret set
```

If `SESSION_SECRET` already exists on Cloudflare, the wizard reports that and only offers to **overwrite** it (default: no). Do not overwrite it once you have data, because it also protects values encrypted in the database.

### Step 7: Workers AI (Optional)

The wizard finishes by offering to configure [Cloudflare Workers AI](../admin-guide/ai-image-generation) for image generation (default: no):

```
Configure Workers AI for image generation? (y/N): y
Your Cloudflare Account ID: <account id>
Your Workers AI API Token (leave empty to skip): <token with Workers AI → Read>
✅ Workers AI configured!
```

It stores `WORKERSAI_ACCOUNT_ID` and `WORKERSAI_API_TOKEN` as secrets on each environment. Enable the feature afterwards under **Admin → AI Image Generation**. You can also set the secrets later with `bun run wrangler secret put WORKERSAI_ACCOUNT_ID --env <environment>`.

The wizard ends with a summary of the next commands: deploy with `npm run cloudflare:preview:deploy` / `npm run cloudflare:prod:deploy`, and stream logs with `npm run cloudflare:preview:logs` / `npm run cloudflare:prod:logs`.

## Deploy Your Application

After setup, deploy with:

```bash
# Deploy to preview (for testing)
npm run cloudflare:preview:deploy

# Deploy to production
npm run cloudflare:prod:deploy
```

The deploy commands:

1. Build the Angular frontend with the correct environment
2. Build the Cloudflare Worker backend
3. Run any pending database migrations
4. Deploy both frontend and backend

:::info[About Preview Environments]
Inkweld provides **one shared preview environment** and **one production environment**, plus optional **per-PR frontend previews** triggered by a label.

The shared **preview** environment is what `cloudflare:preview:deploy` deploys to. It always points at your custom (or workers.dev) domain, so it can only show one branch at a time. This is the environment used for testing feature branches before merging and, via the `deploy-cloudflare.yml` workflow, the latest `main`.

The hosted preview and production builds set `autoConfigure: false` in their generated environment file (`environment.preview.ts` / `environment.cloudflare.ts`, via the workflow's `auto-configure` input): the hosted server URL is still baked in (and pre-fills the server step), but first run shows the setup screen so visitors choose **Browser**, **Cloud Sync**, or **Server** mode instead of being auto-connected. Set `auto-configure: true` in the calling workflow (or the flag to `true`) for a hosted-only deployment that skips the setup screen and auto-connects. Auto-connecting is only a first-run convenience: to stop people adding Browser or Cloud Sync profiles at all, set [`APP_MODE=ONLINE`](../configuration.md#app_mode) on the backend.

If the backend is private and the public app should not offer it at all, set `advertise-server: false` in the calling workflow (production does this). The frontend is then built with no server URL and `frontendOnly: true`, so the setup screen's server field starts empty and visitors enter their own server's address. The backend is still deployed; it just isn't suggested.

**Per-PR previews** are separate. When you add the `deploy:preview:frontend` label to a pull request, GitHub Actions deploys the frontend to Cloudflare Pages under a stable `pr-<number>` branch, giving each PR a predictable URL:

- Frontend: `https://pr-<number>.inkweld-frontend-preview.pages.dev`

Per-PR previews are **frontend-only** — no backend is provisioned. The build ships with an empty `apiUrl`, so the app starts with a Browser profile; you can point it at an existing server at runtime through the setup flow. This keeps the preview lightweight and avoids exposing any Cloudflare account details. When the PR is closed or the `deploy:preview:frontend` label is removed, a cleanup workflow attempts to delete this branch's Pages deployments. See [Per-PR previews](#per-pr-previews) below.

**Manual deployments always go live:** When you run `cloudflare:preview:deploy` or `cloudflare:prod:deploy` from any branch, the deployment will immediately go live on your custom domain. A warning is shown if you're not on the `main` branch, but the deployment proceeds normally.

For a typical workflow:

- Use **preview** environment for testing feature branches before merging
- Use **per-PR previews** to review many PRs in parallel without stepping on each other
- Use **production** environment for your live application from `main`
  :::

## Per-PR Previews

Per-PR previews give every labeled pull request its own frontend deployment on Cloudflare Pages so you can review many PRs at once.

### How it works

- Adding the `deploy:preview:frontend` label to a PR triggers `.github/workflows/deploy-pr-preview.yml`.
- The workflow writes a frontend-only `environment.preview.ts` (empty `apiUrl`/`wssUrl`), builds the Angular app, and deploys it to Cloudflare Pages on the `pr-<number>` branch (stable URL).
- It comments the preview URL back on the PR.
- `.github/workflows/cleanup-pr-preview.yml` lists that branch's Pages deployments and deletes each one when the PR is closed or the label is removed. Cloudflare does not allow deleting the latest deployment for a branch, so the branch's most recent preview URL may remain reachable after cleanup.

### Required configuration

Per-PR previews use the same Cloudflare secrets as the shared preview (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). No extra variables are required.

Optionally override the Pages project name with a `PAGES_PROJECT` variable (default: `inkweld-frontend-preview`). The per-PR frontend URL is derived as `https://pr-<number>.<PAGES_PROJECT>.pages.dev`.

### Usage

1. Add the `deploy:preview:frontend` label to a pull request.
2. GitHub Actions deploys a frontend-only preview and comments the URL on the PR.
3. Review the preview. Multiple PRs can be deployed at once.
4. Remove the label or close the PR to trigger the cleanup workflow, which attempts to delete the branch's Pages deployments. Because Cloudflare keeps the latest deployment for a branch, the most recent preview URL may remain reachable.

> **Note:** Per-PR previews are frontend-only. They start with a Browser profile; to exercise backend features, point the preview at an existing server at runtime through the setup flow. No data is persisted by the preview itself.

## Manual Setup

If you prefer manual configuration, see the detailed steps below.

### 1. Login to Cloudflare

```bash
cd backend
bun run wrangler login
```

### 2. Create D1 Databases

```bash
bun run wrangler d1 create inkweld_preview
bun run wrangler d1 create inkweld_prod
```

Note the `database_id` values from the output.

### 3. Configure wrangler.toml

```bash
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and update the database IDs:

```toml
[[env.preview.d1_databases]]
binding = "DB"
database_name = "inkweld_preview"
database_id = "your-preview-database-id"
migrations_dir = "drizzle"

[[env.production.d1_databases]]
binding = "DB"
database_name = "inkweld_prod"
database_id = "your-production-database-id"
migrations_dir = "drizzle"
```

### 4. Create R2 Buckets

```bash
bun run wrangler r2 bucket create inkweld-storage-preview
bun run wrangler r2 bucket create inkweld-storage
```

### 5. Set WEBAUTHN_RP_ID and ALLOWED_ORIGINS

`wrangler.toml.example` ships placeholder values. In each `[env.*.vars]` section set both to your frontend's domain, for example:

```toml
[env.production.vars]
WEBAUTHN_RP_ID = "yoursite.com"            # domain only: no protocol, no port
ALLOWED_ORIGINS = "https://yoursite.com"   # full origin(s) users visit
```

Use the domain users actually open in the browser (a custom domain, or `<project>.pages.dev` if you have none).

:::danger[WEBAUTHN_RP_ID cannot be changed later]
Passkeys are bound to this value. Changing it after any user has registered a passkey invalidates every credential. Decide the final domain before inviting users.
:::

### 6. Run Migrations

```bash
bun run db:migrate:preview
bun run db:migrate:prod
```

### 7. Set Secrets

```bash
bun run wrangler secret put SESSION_SECRET --env preview
bun run wrangler secret put SESSION_SECRET --env production
```

### 8. Deploy

```bash
npm run cloudflare:preview:deploy
npm run cloudflare:prod:deploy
```

## Automated Deployment via GitHub Actions

Two workflows deploy the hosted environments, both through the shared `.github/workflows/deploy-cloudflare-reusable.yml`:

- `deploy-cloudflare.yml` deploys **preview** on every push to `main` (GitHub environment `preview`, `--env preview`, Pages project `inkweld-frontend-preview`, D1 `inkweld_preview`).
- `deploy-cloudflare-production.yml` deploys **production** on every push to the `production` branch, or from **Run workflow** on that branch (GitHub environment `production`, `--env production`, Pages project `inkweld-frontend`, D1 `inkweld_prod`). Promote a release by fast-forwarding `production` to a commit on `main`; see [CI/CD](../admin-guide/ci-cd.md#promoting-a-release).

Configure the following on each GitHub **environment** (**Settings → Environments → _name_**). The deploy job declares the environment and reads its variables and secrets directly, so the two deployments never share configuration. Restrict the `production` environment's deployment branches to `production`, and optionally add required reviewers so each promotion waits for an approval.

### Required GitHub _variables_ (visible, editable)

These hold non-secret configuration. Using a variable (not a secret) means you can read and tweak the value in the GitHub UI without a round-trip through a secret manager.

| Variable                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_WRANGLER_TOML` | The full contents of `backend/wrangler.toml` for your deployment — D1 IDs, R2 bucket names, custom domains, `ALLOWED_ORIGINS`, etc. Use `SESSION_SECRET = "placeholder-set-via-wrangler-secret"` in the `[vars]` block; the real value is injected from the `SESSION_SECRET` GitHub secret at deploy time (see below). Include an `[env.<name>.observability] enabled = true` block (`preview` or `production`) so Workers Logs stay on across redeploys, and set `WEBAUTHN_RP_ID` to the frontend host (`inkweld.app` for production) — without it, every `wrangler deploy` resets observability to off. |
| `BASE_URL`              | Public backend URL, e.g. `https://api.preview.inkweld.app`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `FRONTEND_URL`          | Public frontend URL, e.g. `https://preview.inkweld.app`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `APP_NAME`              | Display name shown in the UI, e.g. `Inkweld`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `DROPBOX_APP_KEY`       | (Optional) Public OAuth app key of your Dropbox app, enabling the **Cloud Sync** setup option. Register a "Scoped access" app with **App folder** access at the Dropbox App Console and add `https://<your-frontend-host>/cloud-sync/callback/dropbox` as a redirect URI. Leave unset to hide Cloud Sync.                                                                                                                                                                                                                                                                                                 |

### Required GitHub _secrets_ (hidden)

| Secret                  | Purpose                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Wrangler API token with Workers/Pages/D1/R2 permissions                                                                                                                                                                                                                                                                                                            |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                                                                                                                                                                                                                                                                                                                         |
| `SESSION_SECRET`        | The real session-signing key (32+ characters). **Optional** when `SESSION_SECRET` is already set as a Cloudflare Worker secret (via `wrangler secret put`) — in that case it persists across deploys and no GitHub secret is needed. When provided, CI injects it via `wrangler deploy --secrets-file`, which atomically overrides the placeholder `[vars]` value. |
| `PREVIEW_API_URL`       | Frontend environment file: API base URL. Production uses `PRODUCTION_API_URL` (e.g. `https://api.inkweld.app`)                                                                                                                                                                                                                                                     |
| `PREVIEW_WSS_URL`       | Frontend environment file: WebSocket URL for Yjs sync. Production uses `PRODUCTION_WSS_URL` (e.g. `wss://api.inkweld.app`)                                                                                                                                                                                                                                         |

### How the deploy works

1. CI writes `backend/wrangler.toml` from the `BACKEND_WRANGLER_TOML` variable and generates the frontend environment file (`environment.preview.ts` or `environment.cloudflare.ts`) with `frontend/scripts/write-hosted-environment.mjs`, taking the app version from the root `package.json`.
2. If a `SESSION_SECRET` GitHub secret exists, CI writes a temporary `backend/.secrets.env` containing it.
3. `wrangler deploy --env <preview|production> …` pushes the Worker after `wrangler d1 migrations apply` has run. The `--secrets-file .secrets.env` flag is only added when the file exists — wrangler rejects an empty secrets file, so when no GitHub secret is set the deploy falls back to the existing Cloudflare Worker secret (set once via `wrangler secret put`), which persists across deploys and overrides the `[vars]` placeholder at runtime. Cloudflare's secret store has no difference to your Worker between a secret and an environment variable, and secrets are never deleted by a deployment.

### Why not keep the whole toml as a secret?

Earlier versions stored the entire `wrangler.toml` in a single GitHub secret. That worked but was awkward: every tweak (toggling observability, changing a domain, bumping an origin) required editing an opaque blob in the secret manager, and there was no way to read the current value back. The current split keeps the non-secret toml in a visible variable and pushes only the genuinely sensitive `SESSION_SECRET` through Cloudflare's secret mechanism — which is what Cloudflare's own docs recommend ("Do not use vars to store sensitive information").

### Migrating from the old single-secret setup

If you previously set `BACKEND_WRANGLER_TOML` as a **secret**:

1. Copy the secret's current value.
2. Replace any real `SESSION_SECRET = "…"` line with `SESSION_SECRET = "placeholder-set-via-wrangler-secret"`.
3. Add `[env.preview.observability] enabled = true` so observability stays on. **TOML ordering matters**: place the `[env.preview.observability]` subtable **after** any `routes = [...]` line and **before** the next `[env.*]` section — keys that appear after a `[table]` header belong to that table, so `routes` placed after `[env.preview.observability]` would be parsed as a (invalid) field of `observability` rather than of `env.preview`.
4. Create a GitHub **variable** named `BACKEND_WRANGLER_TOML` with the edited contents.
5. Create a GitHub **secret** named `SESSION_SECRET` with the real session key (optional — see the secrets table above).
6. Delete the old `BACKEND_WRANGLER_TOML` secret.

## Custom Domain

To use your own domain instead of `*.workers.dev` and `*.pages.dev`:

### Prerequisites

1. **Add your domain to Cloudflare** - Transfer DNS or use Cloudflare as your DNS provider
2. **Verify domain ownership** - Follow Cloudflare's verification steps

### Using the Setup Wizard

The setup wizard prompts for custom domains for both preview and production environments:

```
Configure custom domains for preview? (Y/n): y
Preview backend API domain (e.g., api.preview.yoursite.com): api.preview.inkweld.app
Preview frontend domain (e.g., preview.yoursite.com): preview.inkweld.app

Configure custom domains for production? (Y/n): y
Production backend API domain (e.g., api.yoursite.com): api.inkweld.app
Production frontend domain (e.g., yoursite.com): inkweld.app
```

The wizard will:

- Configure backend custom domains via `routes` in `wrangler.toml` (Workers support this)
- Add frontend custom domains to `ALLOWED_ORIGINS` for CORS
- Remind you to configure frontend custom domains in the Cloudflare Dashboard

### Manual Configuration

#### Backend Custom Domain

Edit `backend/wrangler.toml` and uncomment/update the routes configuration:

```toml
# Preview
[env.preview]
name = "inkweld-backend-preview"
routes = [{ pattern = "api.preview.yoursite.com", custom_domain = true }]

# Production
[env.production]
name = "inkweld-backend-prod"
routes = [{ pattern = "api.yoursite.com", custom_domain = true }]
```

Or via Cloudflare Dashboard:

1. Go to **Workers & Pages** → Your worker → **Settings** → **Triggers**
2. Click **Add Custom Domain**
3. Enter your domain (e.g., `api.yoursite.com`)

#### Frontend Custom Domain

**Important**: Unlike Workers, Cloudflare Pages does not support custom domain configuration via `wrangler.toml`. Custom domains for Pages must be configured in the Cloudflare Dashboard.

**Via Cloudflare Dashboard** (required for Pages):

1. Go to **Workers & Pages** → Your Pages project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g., `preview.yoursite.com` or `yoursite.com`)
4. Follow the DNS verification steps

### Update ALLOWED_ORIGINS

After setting up custom domains, update `ALLOWED_ORIGINS` in `backend/wrangler.toml`:

```toml
[env.preview.vars]
ALLOWED_ORIGINS = "https://preview.yoursite.com"

[env.production.vars]
ALLOWED_ORIGINS = "https://yoursite.com,https://www.yoursite.com"
```

### Redeploy

After making changes, redeploy both frontend and backend:

```bash
# Preview
npm run cloudflare:preview:deploy

# Production
npm run cloudflare:prod:deploy
```

## Free Tier Limits

Cloudflare's free tier is generous for development and small teams:

| Service             | Free Tier Limit               | Notes                   |
| ------------------- | ----------------------------- | ----------------------- |
| **Workers**         | 100K requests/day             | 10ms CPU per request    |
| **D1 Database**     | 5M reads/day, 100K writes/day | 5GB storage             |
| **Durable Objects** | 100K requests/day             | 13K GB-seconds/day      |
| **R2 Storage**      | 10GB storage                  | Requires payment method |
| **Pages**           | Unlimited sites               | 500 builds/month        |

:::info[Understanding GB-seconds]
Durable Objects are billed by memory × time. 13,000 GB-seconds translates to roughly **21 hours** of continuous real-time collaboration per day.
:::

## Workers Paid Plan

For production use, consider the Workers Paid plan at **$5/month**:

- 10 million requests/month (included)
- 30 seconds CPU time per request
- Higher D1 limits (25M reads, 50M writes/month)
- 400K GB-seconds Durable Objects/month
- Priority support

## Monitoring

### View Logs

```bash
# Stream real-time logs (from the repository root)
npm run cloudflare:preview:logs
npm run cloudflare:prod:logs
```

### Analytics

In the Cloudflare dashboard:

1. Go to **Workers & Pages**
2. Select your worker
3. Click **Analytics** for requests, errors, and performance

## Troubleshooting

### "Worker name already exists"

Worker names are globally unique. Choose a different name with your account prefix.

### Database connection errors

Verify your `database_id` values in `wrangler.toml` match the actual D1 database IDs.

### CORS errors

Update `ALLOWED_ORIGINS` to include all domains that need to access the API:

```toml
ALLOWED_ORIGINS = "https://yoursite.com,https://app.yoursite.com,https://preview.yoursite.com"
```

### Real-time collaboration not working

Check that Durable Objects bindings are correctly configured and the worker deployed successfully.

### Migration errors

Ensure `migrations_dir = "drizzle"` is set in all D1 database sections of your `wrangler.toml`.

### MCP/AI assistant connections blocked

If AI assistants like Claude cannot connect to your MCP endpoint, check your Cloudflare **Security > Bots** settings:

1. Go to **Security** → **Bots** in the Cloudflare dashboard
2. Look for the **Block AI Scrapers and Crawlers** setting
3. If enabled, this blocks bots categorized as "AI training crawlers" — which may include legitimate AI assistants using MCP

**Solution**: Either disable this setting, or add a **WAF exception** for the `/api/v1/ai/mcp` path:

1. Go to **Security** → **WAF** → **Custom rules**
2. Create an exception rule for paths starting with `/api/v1/ai/`
3. Skip the AI bot check for these paths

:::caution
Disabling AI crawler blocking entirely exposes your site to content scraping for AI training. Using a path-specific exception is recommended.
:::

---

## Next Steps

- **[Configure your instance](../configuration)** - Environment variables and customization
- **[Set up CI/CD](../admin-guide/ci-cd)** - Automate deployments
- **[Admin Panel](../admin-guide/overview)** - Manage users and system health from the web UI
