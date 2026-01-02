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
  -e SESSION_SECRET=$(openssl rand -base64 32) \
  ghcr.io/bobbyquantum/inkweld:latest
```

Then open [http://localhost:8333](http://localhost:8333) in your browser.

:::tip First User is Admin
The first user to register becomes the administrator automatically.
:::

## Deployment Wizard

For a guided setup experience, use the interactive deployment wizard:

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld/backend
bun run admin-cli.ts deploy
```

Select **Docker** and the wizard will:

- ✅ Check Docker installation
- ✅ Generate secure configuration
- ✅ Build or pull the image
- ✅ Create data volumes
- ✅ Start the container
- ✅ Display access instructions

## Manual Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- Port 8333 available (or choose a different port)

### Step 1: Create Environment File

Create a `.env` file with your configuration:

```bash
# Required
SESSION_SECRET=your-secret-key-minimum-32-characters-long

# Optional - customize these as needed
PORT=8333
ALLOWED_ORIGINS=http://localhost:8333
USER_APPROVAL_REQUIRED=true
GITHUB_ENABLED=false
```

:::warning Keep SESSION_SECRET Safe
The `SESSION_SECRET` is used to encrypt session data. If you change it, all existing sessions will be invalidated. Use a strong, random value and keep it secure.
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
curl http://localhost:8333/health
```

You should see:

```json
{"status":"ok","uptime":1.23,"backend":"bun"}
```

## Docker Compose

For production deployments, use Docker Compose for easier management:

```yaml title="docker-compose.yml"
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    container_name: inkweld
    restart: unless-stopped
    ports:
      - "8333:8333"
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:8333}
      - USER_APPROVAL_REQUIRED=${USER_APPROVAL_REQUIRED:-true}
    volumes:
      - inkweld_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8333/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  inkweld_data:
```

Start with:

```bash
docker compose up -d
```

## Reverse Proxy Setup

For production, run Inkweld behind a reverse proxy like Nginx or Caddy to handle SSL/TLS.

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

:::tip Data Persistence
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
- **[Set up the admin CLI](../admin-guide/admin-cli)** - Manage users from the command line
- **[Enable AI features](../admin-guide/ai-image-generation)** - Add AI-powered image generation
