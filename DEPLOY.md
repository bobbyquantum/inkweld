# Deployment Guide

This guide explains how to deploy Inkweld using Docker. The Docker image is a self-contained build that includes both the backend API and the Angular frontend, compiled into a single Bun binary (~340MB image).

## Architecture

By default, the Docker image serves **both the API and frontend** from the same origin. This is the recommended setup because:

- No CORS configuration needed
- Angular routing works automatically (SPA fallback)
- Single deployment to manage
- Simpler SSL/proxy setup

If you prefer to host the frontend separately (e.g., on Vercel/Netlify), set `SERVE_FRONTEND=false` to run in API-only mode.

## Overview

The deployment setup consists of:

- `Dockerfile` - Multi-stage build that compiles frontend + backend into a single Bun binary
- `compose.yaml` - Docker Compose for local building and running
- `compose.deploy.yaml` - Docker Compose for pulling pre-built images from GitHub Container Registry
- `deploy.sh` / `deploy.ps1` - Helper scripts for deployment

## Prerequisites

1. Docker and Docker Compose installed
2. Access to the GitHub Container Registry image
3. The GitHub repository owner's username

## Quick Start

### Option 1: Using the Deployment Script (Recommended)

**Linux/macOS:**

```bash
# Set your GitHub username
export GITHUB_REPOSITORY_OWNER=bobbyquantum

# Deploy with default settings
./deploy.sh

# Or deploy with specific image tag and port
IMAGE_TAG=v1.0.0 PORT=8080 ./deploy.sh
```

**Windows (PowerShell):**

```powershell
# Deploy with parameters
.\deploy.ps1 -GitHubRepositoryOwner bobbyquantum

# Or deploy with specific settings
.\deploy.ps1 -GitHubRepositoryOwner bobbyquantum -ImageTag v1.0.0 -Port 8080

# Or set environment variables
$env:GITHUB_REPOSITORY_OWNER = "bobbyquantum"
.\deploy.ps1
```

### Option 2: Using Docker Compose Directly

```bash
# Set required environment variables
export GITHUB_REPOSITORY_OWNER=bobbyquantum
export SESSION_SECRET="$(openssl rand -hex 32)"
export WEBAUTHN_RP_ID=your-domain.com
export ALLOWED_ORIGINS=https://your-domain.com
export IMAGE_TAG=latest  # optional, defaults to latest
export PORT=8333         # optional, defaults to 8333

# Deploy
docker compose -f compose.deploy.yaml up -d
```

### Option 3: Build and Run Directly

```bash
# Build the image locally
docker build -t inkweld:latest .

# Run the container
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -e HOST=0.0.0.0 \
  -e SESSION_SECRET=your-secret-key-at-least-32-characters \
  -e WEBAUTHN_RP_ID=your-domain.com \
  -e ALLOWED_ORIGINS=https://your-domain.com \
  -v inkweld_data:/data \
  inkweld:latest
```

## Configuration

### Environment Variables

The deployment supports the following environment variables:

#### Deployment
- `GITHUB_REPOSITORY_OWNER` - **Required** (Compose deploys): Your GitHub username/organization
- `IMAGE_TAG` - Image tag to deploy (default: `latest`)
- `PORT` - Port to expose the application on (default: `8333`)

#### Application
- `SESSION_SECRET` - **Required**: Secret used to sign session cookies (must be at least 32 characters). Generate with: `openssl rand -hex 32`
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (e.g. `https://your-domain.com`)
- `SERVE_FRONTEND` - Serve embedded frontend (default: `true`). Set to `false` for API-only mode
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error`, or `none` (default: `info` in production, `debug` in development)
- `USER_APPROVAL_REQUIRED` - Require admin approval for new registrations (default: `false`)

#### Authentication — Passkeys (WebAuthn)
- `PASSKEYS_ENABLED` - Enable passkey sign-in (default: `true`)
- `PASSWORD_LOGIN_ENABLED` - Enable username/password sign-in (default: `false`; passwordless-first per NIST SP 800-63B Rev. 4)
- `WEBAUTHN_RP_ID` - **Required in production**: Domain only, no protocol or port (e.g. `inkweld.yourcompany.com`). Defaults to `localhost`. **Cannot be changed after users register passkeys.**
- `WEBAUTHN_RP_NAME` - Display name shown in browser passkey prompts (default: `Inkweld`)

#### Authentication — Email Recovery
- `EMAIL_RECOVERY_ENABLED` - Enable email-based account recovery (default: `false`). In passwordless mode this powers a magic-link flow; in password mode it powers the forgot-password flow. Requires `EMAIL_ENABLED=true` and the SMTP settings below.
- `EMAIL_ENABLED` - Enable transactional email sending (default: `false`)
- `EMAIL_FROM` - Sender address for recovery emails (e.g. `noreply@your-domain.com`)
- `EMAIL_FROM_NAME` - Sender display name (default: `Inkweld`)
- `EMAIL_HOST` - SMTP server hostname
- `EMAIL_PORT` - SMTP server port (default: `587`)
- `EMAIL_ENCRYPTION` - SMTP encryption method: `starttls`, `tls`, or `none` (default: `starttls`)
- `EMAIL_USERNAME` - SMTP authentication username
- `EMAIL_PASSWORD` - SMTP authentication password

#### Authentication — GitHub OAuth
- `GITHUB_ENABLED` - Enable GitHub OAuth (default: `false`)
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret

### Example Production Configuration

Create a `.env` file:

```env
GITHUB_REPOSITORY_OWNER=your-github-username
IMAGE_TAG=latest
PORT=8333
ALLOWED_ORIGINS=https://your-domain.com
SESSION_SECRET=<run: openssl rand -hex 32>
WEBAUTHN_RP_ID=your-domain.com
WEBAUTHN_RP_NAME=Inkweld

# Optional: email recovery
# EMAIL_ENABLED=true
# EMAIL_RECOVERY_ENABLED=true
# EMAIL_FROM=noreply@your-domain.com
# EMAIL_FROM_NAME=Inkweld
# EMAIL_HOST=smtp.your-provider.com
# EMAIL_PORT=587
# EMAIL_ENCRYPTION=starttls
# EMAIL_USERNAME=your-smtp-user
# EMAIL_PASSWORD=your-smtp-password

# Optional: GitHub OAuth
# GITHUB_ENABLED=true
# GITHUB_CLIENT_ID=your-github-client-id
# GITHUB_CLIENT_SECRET=your-github-client-secret
```

Then deploy:

```bash
docker compose -f compose.deploy.yaml --env-file .env up -d
```

## Managing the Deployment

### View Logs

```bash
docker compose -f compose.deploy.yaml logs -f
```

### Stop the Application

```bash
docker compose -f compose.deploy.yaml down
```

### Update to Latest Version

```bash
# Pull the latest image
docker pull ghcr.io/bobbyquantum/inkweld:latest

# Restart the services
docker compose -f compose.deploy.yaml up -d
```

### Health Check

The deployment includes a health check that verifies the application is running properly. You can check the health status:

```bash
docker compose -f compose.deploy.yaml ps
```

## Data Persistence

The deployment uses a Docker volume `inkweld_data` to persist:

- SQLite database (`/data/sqlite.db`)
- Yjs collaboration data (`/data/yjs/`)

This data will persist across container restarts and updates.

## Cloudflare Workers & Durable Objects

The backend can also run entirely on Cloudflare Workers via Wrangler:

1. Copy `backend/wrangler.toml.example` to `wrangler.toml` and configure the D1 + Durable Object bindings.
2. Provision D1 databases with `npx wrangler d1 create inkweld_dev` (and production equivalents).
3. Deploy using `cd backend && bun run deploy:dev` (or `deploy:prod`).
4. Update the frontend environment to target the Worker URL (e.g., `https://inkweld-api.your-domain.workers.dev`).

Use `bun run logs:dev` / `bun run logs:prod` to stream Worker logs, and `bun run dev:worker` for local development.

## Security Considerations

1. Always use specific image tags in production instead of `latest`
2. Set `SESSION_SECRET` to a strong random value (at least 32 characters) — generate with `openssl rand -hex 32`
3. Set `WEBAUTHN_RP_ID` to your domain before any users register passkeys — **this value cannot be changed afterwards**
4. Set `ALLOWED_ORIGINS` to your exact domain(s) to prevent CSRF and WebAuthn origin mismatches
5. Use HTTPS in production with a reverse proxy (nginx, Caddy, Cloudflare Tunnel, etc.)
6. Always use specific image tags in production (not `latest`) to control upgrade timing
7. Regularly update to the latest image versions for security patches
8. Monitor logs for any security issues

## Troubleshooting

### Image Not Found

If you get "image not found" errors, ensure:

1. The GitHub repository owner is correct
2. The image tag exists
3. You have access to the GitHub Container Registry
4. The CI/CD pipeline has successfully built and pushed the image

### Permission Issues

If you encounter permission issues:

1. Ensure Docker has proper permissions
2. Check that the data volume has correct ownership
3. Verify the `bun` user can write to `/data`

### Port Conflicts

If port 8333 is already in use:

1. Change the `PORT` environment variable
2. Update the port mapping in docker compose
3. Restart the deployment
