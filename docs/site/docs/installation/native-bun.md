---
id: native-bun
title: Native Binary Deployment
description: Run Inkweld directly with Bun for maximum control and minimal overhead.
sidebar_position: 3
---

# Native Binary Deployment

Run Inkweld as a standalone Bun binary for maximum control, minimal overhead, and easy integration with existing infrastructure.

## When to Use Native Deployment

Choose this method when you:

- Want **minimal resource overhead** (no container runtime)
- Need **direct system access** for custom integrations
- Are running on a **VPS or bare metal** server
- Want to **customize the build** process
- Are comfortable managing **process supervision**

## Prerequisites

- **Bun 1.3+** - [Install Bun](https://bun.sh/)
- **Node.js 22+** - Required for building the Angular frontend
- **Git** - For cloning the repository

## Quick Start

### Option 1: Pre-built Binary

Download and run the pre-compiled binary:

```bash
# Download latest release
curl -L https://github.com/bobbyquantum/inkweld/releases/latest/download/inkweld-linux-x64 -o inkweld
chmod +x inkweld

# Create data directory
mkdir -p data

# Run with required environment variables
SESSION_SECRET=$(openssl rand -base64 32) \
DATA_PATH=./data \
./inkweld
```

### Option 2: Build from Source

Build and run from the source code:

```bash
# Clone repository
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld

# Install dependencies
bun install

# Build the full binary (includes frontend)
cd backend
bun run build:binary:full

# Run it
SESSION_SECRET=$(openssl rand -base64 32) ./dist/inkweld
```

Open [http://localhost:8333](http://localhost:8333) in your browser.

## Build Options

### Standard Binary

Creates a Bun binary that serves the API only (frontend served separately):

```bash
cd backend
bun run build:binary
# Output: dist/inkweld
```

### Full Binary (Recommended)

Creates a self-contained binary with the Angular frontend embedded:

```bash
cd backend
bun run build:binary:full
# Output: dist/inkweld
```

This single binary serves both the API and frontend - no additional web server needed.

### Development Build

For development with hot reload:

```bash
# From project root
npm run dev

# Or individually:
cd backend && bun run dev     # Backend on :8333
cd frontend && bun run start  # Frontend on :4200
```

## Configuration

Create a `.env` file or set environment variables:

```bash
# Required
SESSION_SECRET=your-secret-key-minimum-32-characters-long

# Server
PORT=8333
HOST=0.0.0.0

# Database (SQLite)
DB_TYPE=sqlite
DB_PATH=./data/inkweld.db

# Data storage
DATA_PATH=./data

# CORS (for production with separate frontend)
ALLOWED_ORIGINS=https://yoursite.com

# Features
USER_APPROVAL_REQUIRED=true
GITHUB_ENABLED=false
SERVE_FRONTEND=true
```

See the [Configuration Guide](../configuration) for all available options.

## Running as a Service

### systemd (Linux)

Create `/etc/systemd/system/inkweld.service`:

```ini
[Unit]
Description=Inkweld Writing Platform
After=network.target

[Service]
Type=simple
User=inkweld
Group=inkweld
WorkingDirectory=/opt/inkweld
ExecStart=/opt/inkweld/inkweld
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/inkweld/.env

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/inkweld/data

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable inkweld
sudo systemctl start inkweld

# Check status
sudo systemctl status inkweld

# View logs
sudo journalctl -u inkweld -f
```

### PM2 (Node.js Process Manager)

If you prefer PM2:

```bash
# Install PM2
npm install -g pm2

# Start Inkweld
pm2 start ./inkweld --name inkweld

# Save configuration
pm2 save

# Set up startup script
pm2 startup
```

### Supervisor

Create `/etc/supervisor/conf.d/inkweld.conf`:

```ini
[program:inkweld]
command=/opt/inkweld/inkweld
directory=/opt/inkweld
user=inkweld
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/inkweld/inkweld.log
environment=NODE_ENV="production"
```

## Reverse Proxy Setup

For production, run behind a reverse proxy for SSL termination.

### Nginx

```nginx
upstream inkweld {
    server 127.0.0.1:8333;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name inkweld.yoursite.com;

    ssl_certificate /etc/letsencrypt/live/inkweld.yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inkweld.yoursite.com/privkey.pem;

    location / {
        proxy_pass http://inkweld;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
    }
}
```

### Caddy

```caddy
inkweld.yoursite.com {
    reverse_proxy localhost:8333
}
```

Caddy automatically handles SSL with Let's Encrypt.

## Database Migrations

Migrations run automatically on startup. To run them manually:

```bash
cd backend

# Using Bun directly
bun run drizzle-kit migrate

# Or apply a specific migration
bun run drizzle-kit push
```

## Updating

### From Pre-built Binary

```bash
# Stop the service
sudo systemctl stop inkweld

# Download new version
curl -L https://github.com/bobbyquantum/inkweld/releases/latest/download/inkweld-linux-x64 -o /opt/inkweld/inkweld
chmod +x /opt/inkweld/inkweld

# Start the service (migrations run automatically)
sudo systemctl start inkweld
```

### From Source

```bash
cd inkweld
git pull origin main
bun install
cd backend
bun run build:binary:full
sudo systemctl restart inkweld
```

## Backup and Restore

### Backup

```bash
# Stop the service for consistency
sudo systemctl stop inkweld

# Backup the data directory
tar czf inkweld-backup-$(date +%Y%m%d).tar.gz /opt/inkweld/data

# Restart
sudo systemctl start inkweld
```

### Restore

```bash
sudo systemctl stop inkweld
tar xzf inkweld-backup-YYYYMMDD.tar.gz -C /
sudo systemctl start inkweld
```

## Performance Tuning

### Memory

Bun is memory-efficient, but for large installations:

```bash
# Set memory limit (if needed)
BUN_JSC_jitMemoryReservationSize=536870912 ./inkweld
```

### File Descriptors

For many concurrent connections:

```bash
# In your service file or shell
ulimit -n 65535
```

Or add to `/etc/security/limits.conf`:

```
inkweld soft nofile 65535
inkweld hard nofile 65535
```

## Troubleshooting

### Binary won't start

Check the error message:

```bash
./inkweld 2>&1 | head -20
```

Common issues:
- Missing `SESSION_SECRET` environment variable
- Port already in use (change `PORT`)
- Permission denied on data directory

### Database errors

Ensure the data directory exists and is writable:

```bash
mkdir -p data
chmod 755 data
```

### WebSocket connection fails

Verify your reverse proxy is configured for WebSocket upgrades (see examples above).

### High memory usage

Monitor with:

```bash
ps aux | grep inkweld
```

Restart the process if needed. Consider adding memory limits to your service configuration.

---

## Next Steps

- **[Configure your instance](../configuration)** - Environment variables and customization
- **[Admin CLI](../admin-guide/admin-cli)** - Manage users from the command line
- **[Enable AI features](../admin-guide/ai-image-generation)** - Add AI-powered image generation
