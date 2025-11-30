# Deployment Guide

This guide explains how to deploy the new Hono-based `/backend` using the pre-built Docker images from the CI/CD pipeline. The Docker image bundles the Bun runtime, compiled API entrypoint (`dist/bun-runner.js`), and the LevelDB dependencies required for Yjs. Host the Angular frontend separately (e.g., Vercel, Netlify, Cloudflare Pages) and point it at the backend URL via `CLIENT_URL` / `PUBLIC_URL`.

## Overview

The deployment setup consists of:

- `backend/Dockerfile` - Multi-stage build that compiles the Bun runtime target
- `Dockerfile.deploy` - A deployment dockerfile that pulls the pre-built image from GitHub Container Registry and adds ops-specific tweaks
- `compose.deploy.yaml` - A docker compose file for production deployment
- `deploy.sh` - Bash deployment script (Linux/macOS)
- `deploy.ps1` - PowerShell deployment script (Windows)

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
export IMAGE_TAG=latest  # optional, defaults to latest
export PORT=8333         # optional, defaults to 8333

# Deploy
docker compose -f compose.deploy.yaml up -d
```

### Option 3: Using Docker Directly

```bash
# Build the deployment image
docker build -f Dockerfile.deploy \
  --build-arg OWNER=bobbyquantum \
  --build-arg TAG=latest \
  -t inkweld-deploy .

# Run the container
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  inkweld-deploy
```

## Configuration

### Environment Variables

The deployment supports the following environment variables:

- `GITHUB_REPOSITORY_OWNER` - **Required**: Your GitHub username/organization
- `IMAGE_TAG` - Image tag to deploy (default: `latest`)
- `PORT` - Port to expose the application on (default: `8333`)
- `PUBLIC_URL` - Public URL where the app will be accessible
- `CLIENT_URL` - Client URL / SPA origin (defaults to `http://localhost:4200` for dev)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `SESSION_SECRET` - Secret used to sign session cookies
- `LOCAL_USERS_ENABLED` - Enable local user authentication (default: `true`)
- `GITHUB_ENABLED` - Enable GitHub OAuth (default: `false`)
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `USER_APPROVAL_REQUIRED` - Require admin approval for new registrations (default: `true`)

### Example Production Configuration

Create a `.env` file:

```env
GITHUB_REPOSITORY_OWNER=bobbyquantum
IMAGE_TAG=latest
PORT=8333
PUBLIC_URL=https://your-domain.com
CLIENT_URL=https://your-domain.com
ALLOWED_ORIGINS=https://your-domain.com
SESSION_SECRET=a-long-random-string
LOCAL_USERS_ENABLED=true
GITHUB_ENABLED=true
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
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
2. Set up proper environment variables for authentication
3. Use HTTPS in production with a reverse proxy
4. Regularly update to the latest image versions
5. Monitor logs for any security issues

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
