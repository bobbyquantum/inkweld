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
- **R2 Storage** - Object storage for media files (optional)
- **Durable Objects** - Real-time collaborative editing with Yjs

## Prerequisites

Before you begin:

1. **Cloudflare Account** - [Sign up free](https://dash.cloudflare.com/sign-up)
2. **Git** - For cloning the repository
3. **Bun 1.3+** - Backend runtime and package manager

:::tip Free Tier Available
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

Set up PREVIEW environment? (y/n): y
Set up PRODUCTION environment? (y/n): y
```

### Step 1: Worker Configuration

The wizard detects your Cloudflare account and suggests unique worker names:

```
============================================================
  Worker Configuration
============================================================

ℹ️  Worker names must be globally unique across all Cloudflare accounts.
ℹ️  Detected account: your-account-name

Worker name for PREVIEW (default: your-account-inkweld-preview): 
✅ Preview worker URL: https://your-account-inkweld-preview.workers.dev
Continue with this URL? (y/n): y

Worker name for PRODUCTION (default: your-account-inkweld): 
✅ Production worker URL: https://your-account-inkweld.workers.dev
Continue with this URL? (y/n): y
```

:::info Worker Name Uniqueness
Worker names must be globally unique across all Cloudflare accounts. The wizard suggests names based on your account to avoid conflicts.
:::

### Step 2: Import Existing Configuration

If you're setting up on a new machine with existing deployments, the wizard can import your configuration:

```
Try to import existing environment variables from Cloudflare? (y/n): y
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
```

### Step 4: Generate Frontend Configuration

The wizard automatically generates environment files for the frontend:

```
============================================================
  Generating Frontend Environment Files
============================================================

ℹ️  Frontend environment files configure the API URLs for each environment.
ℹ️  Workers will be available at:
ℹ️    Preview:    https://your-account-inkweld-preview.workers.dev
ℹ️    Production: https://your-account-inkweld.workers.dev

✅ Generated environment.preview.ts
✅ Generated environment.cloudflare.ts
```

### Step 5: Run Migrations

Apply the database schema:

```
============================================================
  Running Database Migrations
============================================================

Run database migrations now? (y/n): y
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
ℹ️  This is a cryptographic key used to sign session cookies.
⚠️  CRITICAL: If this key is used for database encryption, changing it will 
    make existing data unreadable!

Generate and set SESSION_SECRET automatically? (y/n): y
✅ SESSION_SECRET set for preview
✅ SESSION_SECRET set for production
```

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

:::info About Preview Environments
Inkweld provides **one preview environment and one production environment**, rather than per-branch previews.

**Why not per-branch previews?** Cloudflare Pages automatically creates preview deployments for each branch, but these use random URLs (e.g., `abc123.inkweld-frontend.pages.dev`) instead of your custom domain. Since Inkweld's backend authentication and API routing require consistent URLs, per-branch previews would not function correctly.

**Manual deployments always go live:** When you run `cloudflare:preview:deploy` or `cloudflare:prod:deploy` from any branch, the deployment will immediately go live on your custom domain. A warning is shown if you're not on the `main` branch, but the deployment proceeds normally.

This means you can only preview one branch at a time per environment. For a typical workflow:
- Use **preview** environment for testing feature branches before merging
- Use **production** environment for your live application from `main`
:::

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

### 4. Run Migrations

```bash
bun run db:migrate:preview
bun run db:migrate:prod
```

### 5. Set Secrets

```bash
bun run wrangler secret put SESSION_SECRET --env preview
bun run wrangler secret put SESSION_SECRET --env production
```

### 6. Deploy

```bash
npm run cloudflare:preview:deploy
npm run cloudflare:prod:deploy
```

## Custom Domain

To use your own domain instead of `*.workers.dev` and `*.pages.dev`:

### Prerequisites

1. **Add your domain to Cloudflare** - Transfer DNS or use Cloudflare as your DNS provider
2. **Verify domain ownership** - Follow Cloudflare's verification steps

### Using the Setup Wizard

The setup wizard prompts for custom domains for both preview and production environments:

```
Configure custom domains for preview? (y/n): y
Preview backend API domain (e.g., api.preview.yoursite.com): api.preview.inkweld.app
Preview frontend domain (e.g., preview.yoursite.com): preview.inkweld.app

Configure custom domains for production? (y/n): y
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

| Service | Free Tier Limit | Notes |
|---------|----------------|-------|
| **Workers** | 100K requests/day | 10ms CPU per request |
| **D1 Database** | 5M reads/day, 100K writes/day | 5GB storage |
| **Durable Objects** | 100K requests/day | 13K GB-seconds/day |
| **R2 Storage** | 10GB storage | Requires payment method |
| **Pages** | Unlimited sites | 500 builds/month |

:::info Understanding GB-seconds
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
# Stream real-time logs
bun run wrangler tail --env preview
bun run wrangler tail --env production
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

---

## Next Steps

- **[Configure your instance](../configuration)** - Environment variables and customization
- **[Set up CI/CD](../admin-guide/ci-cd)** - Automate deployments
- **[Admin CLI](../admin-guide/admin-cli)** - Manage users from the command line
