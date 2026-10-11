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

- **Bun 1.4+** - [Install Bun](https://bun.sh/)
- **Node.js 22.22.3+** (or 24.15+ / 26+) - Required for building the Angular frontend; the Angular CLI rejects other versions
- **Git** - For cloning the repository

:::info[No pre-built binary yet]
Releases currently publish the [Docker image](./docker) only. The native binary is built from source, as shown below. If you just want a quick, low-maintenance install, Docker is simpler.
:::

## Quick Start

Build and run from the source code:

```bash
# Clone repository
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld

# Install dependencies (always from the repo root)
bun install

# Build the Angular frontend (the binary embeds frontend/dist/browser)
cd frontend
bun run build

# Build the full binary (includes the frontend)
cd ../backend
bun run build:binary:full
# Output: backend/dist/inkweld
```

Create a `.env` file in `backend/` (the working directory you will run from):

```bash
NODE_ENV=production
SESSION_SECRET=<run: openssl rand -hex 32>
# Required when NODE_ENV=production. Hostname only; cannot be changed once
# users have registered passkeys. Use localhost for a local trial.
WEBAUTHN_RP_ID=localhost
ALLOWED_ORIGINS=http://localhost:8333
```

Then run it from `backend/`:

```bash
./dist/inkweld
```

Open [http://localhost:8333](http://localhost:8333) in your browser.

:::warning[Run it next to the `drizzle/` folder]
The binary applies database migrations from a `drizzle/` directory in its **working directory** (or the directory named by `DRIZZLE_MIGRATIONS_DIR`). The migration files are not embedded in the binary. If the folder is missing the server logs "Migrations folder not found" and starts with an empty database, which then fails. Running from `backend/` works because `backend/drizzle/` is already there; when you copy the binary elsewhere, copy `drizzle/` with it or set `DRIZZLE_MIGRATIONS_DIR`.
:::

### Interactive setup wizard

If you start the compiled binary from an interactive terminal and it cannot find a `.env` file, it offers a **setup wizard** instead of failing. It looks in the current directory, then the parent directory, then `~/.inkweld/.env` (`%APPDATA%\Inkweld\.env` on Windows). Variables you set in your shell are not considered, so `SESSION_SECRET=... ./inkweld` with no `.env` still starts the wizard.

The wizard asks for the data directory, port, database path, whether new users need approval, an optional default admin account and an optional OpenAI key. It generates a `SESSION_SECRET` for you and saves a `.env` (in `~/.inkweld/` or the current directory) containing `NODE_ENV=production`, `ALLOWED_ORIGINS=http://localhost:<port>` and `WEBAUTHN_RP_ID=localhost`.

That is right for trying Inkweld locally. Before exposing it on a real domain, edit the saved `.env`: set `ALLOWED_ORIGINS` to your public URL and `WEBAUTHN_RP_ID` to its hostname **before anyone registers a passkey**. The wizard never runs when there is no terminal (systemd, Supervisor, PM2), so create the `.env` yourself for services.

## Build Options

### Standard Binary

Creates a Bun binary that serves the API only (frontend served separately). It does not need a frontend build:

```bash
cd backend
bun run build:binary
# Output: dist/inkweld
```

### Full Binary (Recommended)

Creates a self-contained binary with the Angular frontend embedded:

```bash
# 1. Build the frontend first (the script stops if frontend/dist/browser is missing)
cd frontend
bun run build

# 2. Build the binary
cd ../backend
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
SESSION_SECRET=<run: openssl rand -hex 32>

# Required when NODE_ENV=production. Your public hostname only (no protocol
# or port). Cannot be changed once users have registered passkeys.
WEBAUTHN_RP_ID=inkweld.yoursite.com

# The public URL(s) users open Inkweld from (CORS and passkey origin check)
ALLOWED_ORIGINS=https://inkweld.yoursite.com

# Server
NODE_ENV=production
PORT=8333

# Data storage (the SQLite database defaults to <DATA_PATH>/inkweld.db)
DATA_PATH=./data
# DB_PATH=./data/inkweld.db

# Features
USER_APPROVAL_REQUIRED=true
GITHUB_ENABLED=false
SERVE_FRONTEND=true

# Set to true only when behind a reverse proxy (see below)
# TRUST_PROXY=true
```

Relative paths such as `./data` resolve from the working directory. The server loads the first `.env` it finds: the working directory, then its parent, then `~/.inkweld/.env`. See the [Configuration Guide](../configuration) for all available options.

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
# /opt/inkweld must contain the binary, the drizzle/ migrations folder,
# .env and the data/ directory
WorkingDirectory=/opt/inkweld
ExecStart=/opt/inkweld/inkweld
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Must define at least SESSION_SECRET, WEBAUTHN_RP_ID and ALLOWED_ORIGINS
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

# Start Inkweld from the directory that holds the binary, drizzle/ and .env
cd /opt/inkweld
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
; SESSION_SECRET, WEBAUTHN_RP_ID and ALLOWED_ORIGINS come from /opt/inkweld/.env
; (the server finds it in `directory`), or add them here.
environment=NODE_ENV="production"
```

## Reverse Proxy Setup

For production, run behind a reverse proxy for SSL termination. When you do:

- Set `ALLOWED_ORIGINS` to the public `https://` URL and `WEBAUTHN_RP_ID` to its hostname.
- Set `TRUST_PROXY=true` so rate limiting and audit logs use the real client IP from `X-Forwarded-For`. Only do this when the proxy is the only way to reach the server (bind it behind the proxy or firewall the port); otherwise clients can forge the header and escape the login rate limit.

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

Migrations run automatically on startup: the server applies any pending files from the `drizzle/` folder (see the note above) and records them in the `__drizzle_migrations` table, so a fully migrated database is a no-op. A failed migration stops the server rather than starting on a half-migrated schema.

To apply them manually, for example before a risky upgrade, run from a source checkout:

```bash
cd backend

# Apply pending migrations (DB_PATH defaults to ./data/inkweld.db)
DB_PATH=/opt/inkweld/data/inkweld.db bunx drizzle-kit migrate
```

Do not use `drizzle-kit push` on a real database. It syncs the schema directly without recording migrations and is meant for development only.

## Updating

Rebuild from source and deploy the new binary **together with the new `drizzle/` folder**, since new releases can add migrations:

```bash
cd inkweld
git pull origin main
bun install
(cd frontend && bun run build)
(cd backend && bun run build:binary:full)

sudo systemctl stop inkweld
sudo cp backend/dist/inkweld /opt/inkweld/inkweld
sudo rm -rf /opt/inkweld/drizzle
sudo cp -r backend/drizzle /opt/inkweld/drizzle

# Start the service (migrations run automatically)
sudo systemctl start inkweld
```

Take a [backup](#backup-and-restore) first.

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

- Missing `SESSION_SECRET` or (with `NODE_ENV=production`) `WEBAUTHN_RP_ID`; the error message names the missing variable
- Started without a `.env` from an interactive terminal, which launches the setup wizard
- `Migrations folder not found`: run from a directory that contains `drizzle/`, or set `DRIZZLE_MIGRATIONS_DIR`
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
- **[Admin Panel](../admin-guide/overview)** - Manage users and system health from the web UI
- **[Enable AI features](../admin-guide/ai-image-generation)** - Add AI-powered image generation
