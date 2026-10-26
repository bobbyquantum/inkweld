---
id: docker
title: Docker Deployment
description: Deploy Inkweld using Docker - the recommended approach for most users.
sidebar_position: 1
---

# Docker Deployment

Docker is the **recommended deployment method** for Inkweld. It packages everything into a single container that's easy to deploy, update, and maintain.

## Quick Start

Get Inkweld running in under a minute:

```bash
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e WEBAUTHN_RP_ID=localhost \
  -e ALLOWED_ORIGINS=http://localhost:8333 \
  ghcr.io/bobbyquantum/inkweld:latest
```

Then open [http://localhost:8333](http://localhost:8333) in your browser.

:::warning[Set these for any real deployment]
The image runs with `NODE_ENV=production`, so the server **refuses to start** unless `SESSION_SECRET` (32+ characters) and `WEBAUTHN_RP_ID` are set. `localhost` is fine for a local trial. For a real domain, set `WEBAUTHN_RP_ID` to your hostname (for example `inkweld.example.com`, no protocol or port) and `ALLOWED_ORIGINS` to the full public URL. **`WEBAUTHN_RP_ID` cannot be changed after users register passkeys**, so choose it before anyone signs up.
:::

:::tip[First User is Admin]
The first user to register becomes the administrator automatically.
:::

## Deployment Wizard

For a guided setup experience, use the interactive deployment wizard:

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
bun run deploy
```

Select **Docker** and the wizard will:

- ✅ Check Docker installation
- ✅ Ask for the port, public URL, user approval and GitHub settings, and generate a session secret
- ✅ Write a `.env` file in the current directory
- ✅ Build the image from the cloned source as `inkweld:local` (it does not pull the published image)
- ✅ Create the `inkweld_data` volume
- ✅ Start a container named `inkweld-backend`
- ✅ Display access instructions

:::note
When the wizard asks for a database type, choose **SQLite**. It is the only database the server supports.
:::

To run the published image instead, follow the manual steps below.

## Deploy Script

The repository includes `deploy.sh` (Linux and macOS) and `deploy.ps1` (Windows PowerShell). Both pull the published image from GitHub Container Registry, so they need no build tools.

```bash
export GITHUB_REPOSITORY_OWNER=your-github-username
export SESSION_SECRET="$(openssl rand -hex 32)"
export WEBAUTHN_RP_ID=your-domain.com
export ALLOWED_ORIGINS=https://your-domain.com

./deploy.sh

# Or pin a version and port
IMAGE_TAG=v1.0.0 PORT=8080 ./deploy.sh
```

On Windows PowerShell:

```powershell
$env:SESSION_SECRET = "<output of openssl rand -hex 32>"
$env:WEBAUTHN_RP_ID = "your-domain.com"
$env:ALLOWED_ORIGINS = "https://your-domain.com"

.\deploy.ps1 -GitHubRepositoryOwner your-github-username -ImageTag v1.0.0 -Port 8080
```

`GITHUB_REPOSITORY_OWNER` is required. `IMAGE_TAG` defaults to `latest`; pin a specific tag in production so you control when upgrades happen. Set `WEBAUTHN_RP_ID` before anyone registers a passkey, because it cannot be changed afterwards.

## Manual Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- Port 8333 available (or choose a different port)

### Step 1: Create Environment File

Create a `.env` file with your configuration:

```bash
# Required
SESSION_SECRET=<run: openssl rand -hex 32>

# Required in production (the Docker image sets NODE_ENV=production).
# Your public hostname only: no protocol, no port. Cannot be changed once
# users have registered passkeys.
WEBAUTHN_RP_ID=localhost

# Every URL users open Inkweld from (CORS and passkey origin check)
ALLOWED_ORIGINS=http://localhost:8333

# Optional - customize these as needed
USER_APPROVAL_REQUIRED=true
GITHUB_ENABLED=false
```

Generate a secret with `openssl rand -hex 32`. When you change the host port, change the left-hand side of `-p` (for example `-p 9000:8333`); the container always listens on 8333 inside.

:::warning[Keep SESSION_SECRET Safe]
The `SESSION_SECRET` signs session tokens and encrypts secrets stored in the database, such as API keys saved in Admin → Settings. If you change it, everyone is signed out and those stored secrets become unreadable. Use a strong, random value and keep it secure.

:::tip[Pin an image tag in production]
`:latest` only moves when a release is published and `:dev` follows `main`. For production, pin a specific release tag so an upgrade happens only when you choose.
:::
:::

### Step 2: Run the Container

**Using the pre-built image (recommended):**

```bash
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  --env-file .env \
  ghcr.io/bobbyquantum/inkweld:latest
```

**Building from source:**

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
docker build -t inkweld:local .
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  --env-file .env \
  inkweld:local
```

### Step 3: Verify Installation

Check that Inkweld is running:

```bash
# Check container status
docker ps

# View logs
docker logs inkweld

# Test health endpoint
curl http://localhost:8333/api/v1/health
```

You should see:

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "uptime": 1.23,
  "version": "1.0.0-beta.1",
  "protocolVersion": 1,
  "minClientVersion": "0.1.0"
}
```

The exact `version` and protocol numbers depend on the release you run.

## Docker Compose

For production deployments, use Docker Compose for easier management:

```yaml title="docker-compose.yml"
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    container_name: inkweld
    restart: unless-stopped
    ports:
      - '8333:8333'
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET:?SESSION_SECRET is required}
      # Public hostname only (no protocol/port). Cannot be changed once users
      # have registered passkeys.
      - WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID:-localhost}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:8333}
      - USER_APPROVAL_REQUIRED=${USER_APPROVAL_REQUIRED:-true}
      # Set to true when a reverse proxy sits in front (see below)
      - TRUST_PROXY=${TRUST_PROXY:-false}
    volumes:
      - inkweld_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8333/api/v1/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  inkweld_data:
```

Put the values in a `.env` file next to `docker-compose.yml` (Compose reads it automatically):

```bash
SESSION_SECRET=<output of: openssl rand -hex 32>
WEBAUTHN_RP_ID=inkweld.yourdomain.com
ALLOWED_ORIGINS=https://inkweld.yourdomain.com
```

Start with:

```bash
docker compose up -d
```

The repository also ships `compose.yaml` (builds the image from source) and `compose.deploy.yaml` (pulls the published image); the deploy script above uses the second one.

## Reverse Proxy Setup

For production, run Inkweld behind a reverse proxy like Nginx or Caddy to handle SSL/TLS. When you do:

- Set `ALLOWED_ORIGINS` to the public `https://` URL and `WEBAUTHN_RP_ID` to its hostname.
- Set `TRUST_PROXY=true` so rate limiting and audit logs use the real client IP from `X-Forwarded-For`. Only do this when the proxy is the only way to reach the container (for example, publish the port as `-p 127.0.0.1:8333:8333`); otherwise clients can forge the header and escape the login rate limit.

### Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name inkweld.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Example

```caddy
inkweld.yourdomain.com {
    reverse_proxy localhost:8333
}
```

Caddy automatically provisions SSL certificates via Let's Encrypt.

## Updating

To update to the latest version:

```bash
# Pull latest image
docker pull ghcr.io/bobbyquantum/inkweld:latest

# Stop and remove current container
docker stop inkweld
docker rm inkweld

# Start with new image
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  --env-file .env \
  ghcr.io/bobbyquantum/inkweld:latest
```

Or with Docker Compose:

```bash
docker compose pull
docker compose up -d
```

:::tip[Data Persistence]
Your data is stored in the `inkweld_data` volume and persists across container updates. Database migrations run automatically on startup.
:::

## Backup and Restore

### Creating Backups

```bash
# Stop the container first for consistency
docker stop inkweld

# Backup the data volume
docker run --rm \
  -v inkweld_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/inkweld-backup-$(date +%Y%m%d).tar.gz /data

# Restart
docker start inkweld
```

### Restoring from Backup

```bash
# Stop the container
docker stop inkweld

# Restore the backup
docker run --rm \
  -v inkweld_data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd / && tar xzf /backup/inkweld-backup-YYYYMMDD.tar.gz"

# Restart
docker start inkweld
```

## Troubleshooting

### Container won't start

Check the logs for errors:

```bash
docker logs inkweld
```

Common issues:

- **Port already in use**: Change the port mapping (e.g., `-p 9000:8333`)
- **Invalid SESSION_SECRET**: Must be at least 32 characters
- **`WEBAUTHN_RP_ID must be set in production`**: Add `-e WEBAUTHN_RP_ID=<your hostname>` (or `localhost` for a local trial)

### WebSocket connection fails

Ensure your reverse proxy is configured to handle WebSocket upgrades (see examples above).

### Permission denied on data volume

If running on Linux with specific user requirements:

```bash
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -v inkweld_data:/data \
  --user $(id -u):$(id -g) \
  --env-file .env \
  ghcr.io/bobbyquantum/inkweld:latest
```

---

## Next Steps

- **[Configure your instance](../configuration)** - Customize authentication, storage, and features
- **[Admin Panel](../admin-guide/overview)** - Manage users and system health from the web UI
- **[Enable AI features](../admin-guide/ai-image-generation)** - Add AI-powered image generation
