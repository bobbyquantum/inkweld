---
title: Logging & Debugging
description: Understanding Inkweld's logging system, log levels, and how to troubleshoot issues using logs.
---

# Logging & Debugging

Inkweld includes a structured logging system that works across all deployment targets (Docker, Cloudflare Workers, Node.js, Bun). This guide explains how to use logs effectively for troubleshooting.

## Log Levels

Set the `LOG_LEVEL` environment variable to control verbosity:

| Level | Description | When to Use |
|-------|-------------|-------------|
| `debug` | All logs including request details | Development, detailed troubleshooting |
| `info` | Standard operational logs | Production (default) |
| `warn` | Warnings and errors only | Quiet production environments |
| `error` | Errors only | Minimal logging |
| `none` | Disable all logging | Not recommended |

```bash
# Development (default)
LOG_LEVEL=debug

# Production (default when NODE_ENV=production)
LOG_LEVEL=info
```

## Log Output Formats

### Development Mode

Human-readable, colored output:

```
14:23:45.123 INFO  [HTTP] ← GET /api/v1/projects 200 12ms
14:23:45.456 DEBUG [AuthService] User authenticated {"userId":"abc123"}
14:23:45.789 ERROR [ProjectService] Failed to save {"projectId":"xyz789"}
```

### Production Mode

Structured JSON for log aggregators:

```json
{"timestamp":"2026-01-04T14:23:45.123Z","level":"info","context":"HTTP","message":"← GET /api/v1/projects 200 12ms","correlationId":"f0077963-...","data":{"method":"GET","path":"/api/v1/projects","status":200,"durationMs":12}}
```

## Correlation IDs

Every request gets a unique correlation ID for tracing:

- Automatically generated if not provided
- Passed via `X-Correlation-ID` header
- Included in all log entries for that request
- Returned in response headers

Use correlation IDs to trace a request through the entire system:

```bash
# Find all logs for a specific request
grep "f0077963" /var/log/inkweld.log
```

## Viewing Logs

### Docker

```bash
# Follow logs
docker logs -f inkweld

# Last 100 lines
docker logs --tail 100 inkweld

# Filter by level (JSON format)
docker logs inkweld 2>&1 | jq 'select(.level == "error")'
```

### Docker Compose

```bash
docker compose logs -f inkweld
```

### Cloudflare Workers

```bash
# Real-time logs
wrangler tail --env production

# Filter by status
wrangler tail --env production --status error
```

### Bun/Node.js (Direct)

Logs are written to stdout/stderr. Redirect as needed:

```bash
# Log to file
bun run dev > inkweld.log 2>&1

# Use a process manager like PM2
pm2 start "bun run start" --name inkweld
pm2 logs inkweld
```

## Common Issues

### "No logs appearing"

1. Check `LOG_LEVEL` isn't set to `none`
2. Verify `NODE_ENV` - production defaults to `info` level
3. Check if logs are being redirected elsewhere

### "Too many logs"

Set a higher log level:

```bash
LOG_LEVEL=warn  # Only warnings and errors
```

### "Can't parse JSON logs"

Ensure you're in production mode (`NODE_ENV=production`). Development mode uses human-readable format.

### "Missing correlation IDs"

Correlation IDs require the request logger middleware. Ensure your app files use `requestLogger()`:

```typescript
import { requestLogger } from './middleware/request-logger';
app.use('*', requestLogger());
```

## Debugging Tips

### Enable Debug Logging Temporarily

```bash
LOG_LEVEL=debug bun run start
```

### Check Specific Contexts

Filter logs by context (the bracketed component name):

```bash
# All auth-related logs
grep "\[Auth" /var/log/inkweld.log

# All HTTP request logs
grep "\[HTTP\]" /var/log/inkweld.log

# All error handler logs
grep "\[ErrorHandler\]" /var/log/inkweld.log
```

### Trace a Failed Request

1. Get the correlation ID from the error response or logs
2. Search all logs for that ID:
   ```bash
   grep "abc12345" /var/log/inkweld.log
   ```
3. Follow the request flow from start to error

## Using Logs in Code

When adding logging to your own services:

```typescript
import { logger } from '../services/logger.service';

// Direct usage
logger.info('MyService', 'Operation completed', { userId: '123' });
logger.error('MyService', 'Operation failed', error, { context: 'save' });

// Child logger (pre-configured context)
const log = logger.child('MyService');
log.info('Operation completed', { userId: '123' });
log.error('Operation failed', error, { context: 'save' });
```

## Log Aggregation

For production deployments, consider forwarding logs to a centralized system:

- **Docker**: Use logging drivers (json-file, syslog, fluentd)
- **Cloudflare**: Use the built-in Loki Tail Worker (see below)
- **Self-hosted**: ELK Stack, Loki+Grafana, or Datadog

Example Docker Compose with JSON logging:

```yaml
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

## Grafana Loki (Docker / Bun deployment)

Two approaches are available for non-Cloudflare deployments. You can use either
or both — they are independent.

### Option A: In-process transport (Docker + Bun, recommended)

The logger service has a built-in Loki HTTP transport that is activated by
environment variables. It works for any runtime — Docker, Bun standalone,
Node.js — without any external tools.

Set the following in your `.env` file (or as Docker environment variables):

```bash
LOKI_URL=https://logs-prod-us-central1.grafana.net   # Grafana Cloud
# or
LOKI_URL=http://loki.yourdomain.com:3100             # Self-hosted

LOKI_USERNAME=123456          # Grafana Cloud tenant ID, or "admin"
LOKI_API_KEY=glc_...          # API key with logs:write scope

LOKI_ENVIRONMENT=production   # Added as a stream label in Loki
```

The transport batches log entries and flushes them to Loki every 5 seconds
(or immediately when 50 entries accumulate). It flushes on `SIGTERM`/`SIGINT`
to avoid losing logs on graceful shutdown. If Loki is unreachable, errors are
silently dropped — they will not affect the application.

For Docker Compose, add those variables to your `compose.deploy.yaml` or pass
them in a `.env` file alongside the compose file.

### Option B: Promtail sidecar (Docker only)

For Docker deployments, a [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/)
sidecar container can be added as a Compose overlay. Promtail reads the Docker
JSON log files written to disk and ships them to Loki, keeping log shipping
completely out of the application process.

**Setup:**

```bash
# 1. Copy the Promtail configuration template
cp promtail-config.yaml.example promtail-config.yaml

# 2. Add Loki credentials to your .env
echo "LOKI_URL=https://logs-prod-us-central1.grafana.net" >> .env
echo "LOKI_USERNAME=123456" >> .env
echo "LOKI_API_KEY=glc_..." >> .env

# 3. Run with the Loki overlay
docker compose -f compose.deploy.yaml -f compose.loki.yaml up -d
# or for a local build:
docker compose -f compose.yaml -f compose.loki.yaml up -d
```

**Note:** Promtail needs read access to `/var/lib/docker/containers` on the
Docker host. On Docker Desktop (Mac/Windows) the path lives inside the VM — in
that case Option A (in-process transport) is simpler.

The `promtail-config.yaml` template parses inkweld's structured JSON lines and
promotes `level` and `context` as Loki stream labels, enabling efficient
filtering without full-text scans.

### Querying logs in Grafana (Docker / Bun)

```logql
# All logs from the production instance
{job="inkweld", environment="production"}

# Error logs only
{job="inkweld", level="error"}

# Logs from a specific component
{job="inkweld", context="HTTP"}

# Trace a specific request by correlation ID
{job="inkweld"} |= "f0077963"

# Parse JSON and filter by HTTP status >= 500
{job="inkweld"} | json | data_status >= 500
```

---

## Grafana Loki (Cloudflare deployment)

Inkweld ships a [Cloudflare Tail Worker](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)
(`backend/src/loki-tail-worker.ts`) that receives log events from the main
Worker in real-time and pushes them to Grafana Loki via its HTTP push API.
This works with both **Grafana Cloud** and **self-hosted Loki**.

### How it works

```
inkweld Worker  →  tail events  →  inkweld-loki-tail Worker  →  HTTP push  →  Loki
```

The tail worker receives every `console.log` / `console.error` call from the
main worker, including the structured JSON lines emitted by the logger service,
and forwards them to Loki labelled by `job`, `environment`, `level`, and
`source`.

### Setup

#### 1. Copy the tail worker wrangler config

```bash
cp backend/wrangler.loki-tail.toml.example backend/wrangler.loki-tail.toml
```

#### 2. Set secrets

**Grafana Cloud:**

```bash
# Find your Loki URL and tenant ID on the Grafana Cloud portal under
# your stack → Loki → "Connection details".

npx wrangler secret put LOKI_URL      --config backend/wrangler.loki-tail.toml --env preview
# e.g. https://logs-prod-us-central1.grafana.net

npx wrangler secret put LOKI_USERNAME --config backend/wrangler.loki-tail.toml --env preview
# e.g. 123456 (numeric tenant ID)

npx wrangler secret put LOKI_API_KEY  --config backend/wrangler.loki-tail.toml --env preview
# Grafana Cloud API key with "logs:write" (MetricsPublisher) scope
```

**Self-hosted Loki:**

```bash
npx wrangler secret put LOKI_URL      --config backend/wrangler.loki-tail.toml --env preview
# e.g. https://loki.yourdomain.com

npx wrangler secret put LOKI_USERNAME --config backend/wrangler.loki-tail.toml --env preview
# e.g. admin

npx wrangler secret put LOKI_API_KEY  --config backend/wrangler.loki-tail.toml --env preview
# your Loki password
```

Repeat for `--env production`.

#### 3. Deploy the tail worker

The tail worker **must be deployed before** the main worker because the main
worker registers it as a tail consumer on startup.

```bash
cd backend

# Preview
npx wrangler deploy --config wrangler.loki-tail.toml --env preview

# Production
npx wrangler deploy --config wrangler.loki-tail.toml --env production
```

#### 4. Deploy the main worker

The main `wrangler.toml` already has `[[tail_consumers]]` pointing to the tail
worker for each environment. Just deploy as normal:

```bash
npm run cloudflare:preview:deploy
npm run cloudflare:prod:deploy
```

#### 5. (CI/CD) Add the `LOKI_TAIL_WRANGLER_TOML` secret

The GitHub Actions workflow checks for an optional
`LOKI_TAIL_WRANGLER_TOML` repository secret. When present it writes the file
and deploys the tail worker automatically before the main worker. Add it the
same way as `BACKEND_WRANGLER_TOML`:

```
Settings → Secrets → Actions → New repository secret
Name: LOKI_TAIL_WRANGLER_TOML
Value: <contents of your wrangler.loki-tail.toml>
```

### Querying logs in Grafana

Once logs are flowing, use LogQL in Grafana Explore to query them:

```logql
# All logs from the production worker
{job="inkweld-backend-prod", environment="production"}

# Error logs only
{job="inkweld-backend-prod", level="error"}

# Trace a specific request by correlation ID
{job="inkweld-backend-prod"} |= "f0077963"

# Parse structured JSON and filter by HTTP status
{job="inkweld-backend-prod"} | json | data_status >= 500
```

### Skipping Loki

The tail worker is entirely optional. If `LOKI_URL`, `LOKI_USERNAME`, or
`LOKI_API_KEY` are not set the tail worker silently exits without error.
To remove the integration entirely, comment out the `[[tail_consumers]]`
blocks in `wrangler.toml` and skip deploying `wrangler.loki-tail.toml`.
