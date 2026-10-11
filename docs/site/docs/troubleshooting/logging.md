---
title: Logging & Debugging
description: Understanding Inkweld's logging system, log levels, and how to troubleshoot issues using logs.
---

# Logging & Debugging

Inkweld includes a structured logging system that works across all deployment targets (Docker, Cloudflare Workers, Node.js, Bun). This guide explains how to use logs effectively for troubleshooting.

## Log Levels

Set the `LOG_LEVEL` environment variable to control verbosity:

| Level   | Description                        | When to Use                           |
| ------- | ---------------------------------- | ------------------------------------- |
| `debug` | All logs including request details | Development, detailed troubleshooting |
| `info`  | Standard operational logs          | Production (default)                  |
| `warn`  | Warnings and errors only           | Quiet production environments         |
| `error` | Errors only                        | Minimal logging                       |
| `none`  | Disable all logging                | Not recommended                       |

If `LOG_LEVEL` is not set, the default is `debug` when `NODE_ENV` is `development` or `test`, and `info` for anything else, including an unset `NODE_ENV`. An unrecognised value falls back to `info`. The Docker image sets `NODE_ENV=production`.

```bash
LOG_LEVEL=debug   # Verbose, e.g. when reproducing a problem
LOG_LEVEL=info    # Production default
```

## Log Output Formats

The format depends on `NODE_ENV`, not on `LOG_LEVEL`.

### Development Mode

Human-readable, colored output, used **only** when `NODE_ENV` is `development` or `test`:

```
14:23:45.123 INFO  [HTTP] ← GET /api/v1/projects 200 12ms
14:23:45.456 DEBUG [Auth] Token verified {"userId":"abc123"}
14:23:45.789 ERROR [Elements] Failed to save {"projectId":"xyz789"}
```

### Production Mode

Used for any other `NODE_ENV` (including unset, and Cloudflare Workers unless you set `NODE_ENV` to `development`). Each line is structured JSON for log aggregators, at `info` unless `LOG_LEVEL` says otherwise:

```json
{
  "timestamp": "2026-01-04T14:23:45.123Z",
  "level": "info",
  "context": "HTTP",
  "message": "← GET /api/v1/projects 200 12ms",
  "correlationId": "f0077963-...",
  "data": {
    "method": "GET",
    "path": "/api/v1/projects",
    "status": 200,
    "durationMs": 12
  }
}
```

## Correlation IDs

Every request gets a unique correlation ID for tracing:

- Generated for each request, unless the client sends its own `X-Correlation-ID` header
- Included in log entries made while handling that request (on Bun and Node it follows the request through nested service calls automatically)
- Returned in the `X-Correlation-ID` response header

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

1. Check `LOG_LEVEL` isn't set to `none` (or `silent`)
2. Remember that without `LOG_LEVEL`, anything but `NODE_ENV=development` or `test` defaults to `info`, so `debug` messages (including the "→ GET ..." request-start lines) are hidden
3. Health checks, static assets and the service worker files are deliberately not logged unless they fail with a 5xx
4. Check if logs are being redirected elsewhere

### "Too many logs"

Set a higher log level:

```bash
LOG_LEVEL=warn  # Only warnings and errors
```

### "Can't parse JSON logs"

JSON is used whenever `NODE_ENV` is not `development` or `test`. If you want coloured, human-readable lines locally (for example in a Docker container or a custom launcher that leaves `NODE_ENV` unset), set `NODE_ENV=development`; to get JSON, set it to `production`.

### "Missing correlation IDs"

Correlation IDs come from the request logger middleware, which all the server entry points (Bun, Node.js and Workers) already install. Log lines written outside a request, for example at startup or from a background timer, have no correlation ID. On Workers the ID is not carried implicitly into nested service calls, so only log calls that pass it explicitly (such as the request logger's own lines) include it.

## Debugging Tips

### The App Is Stuck or Shows Stale Data

If the web app will not load, shows an old account or server, or a project is out of step with the server in a way a normal refresh does not fix, open `/reset` (for example `https://your-inkweld-host/reset`). Press **Proceed and Clear Data** and the page will:

- delete every IndexedDB database for that site (cached documents, offline project data, covers and images),
- clear `localStorage`, `sessionStorage` and the site's cookies (which includes your sign-in and your settings),
- then send you to the setup page.

:::warning
Anything that has not been synced to a server is lost permanently. This includes everything in a local-only profile. Sync, or export the project from the project menu, before you reset. Server data is not touched, and the installed service worker is not removed, so use your browser's site settings to clear it too if the app shell itself is stale.
:::

### Enable Debug Logging Temporarily

```bash
LOG_LEVEL=debug bun run start
```

### Check Specific Contexts

Filter logs by context (the bracketed component name):

```bash
# Auth, OAuth and passkey logs
grep -E "\[(Auth|OAuth|Passkey|GitHubAuth)\]" /var/log/inkweld.log

# All HTTP request logs
grep "\[HTTP\]" /var/log/inkweld.log

# All error handler logs
grep "\[ErrorHandler\]" /var/log/inkweld.log
```

In JSON output, the context is the `context` field, so `jq 'select(.context == "Yjs")'` works as well.

Common contexts:

| Context                                                             | Area                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| `HTTP`                                                              | Request start/finish lines                           |
| `ErrorHandler`                                                      | Unhandled errors turned into responses               |
| `Database`                                                          | Database setup and migrations                        |
| `Auth`, `Passkey`, `GitHubAuth`                                     | Sign-in                                              |
| `OAuth`, `MCP`, `MCP-Auth`, `MCP-Mutation`, `MCP-Search`, ...       | MCP and its OAuth server                             |
| `Yjs`, `Yjs-Runtime`, `WebSocket`, `YjsProjectDO`, `YjsWorker`      | Document sync (Bun service / Workers Durable Object) |
| `DocumentRevision`                                                  | Sync manifest used by "Sync All"                     |
| `Presence`                                                          | Who is online in a project                           |
| `Documents`, `Elements`                                             | Document and element routes                          |
| `Quota`                                                             | Sync capacity checks                                 |
| `AIImage`, `ImageGeneration`, `ImageAudit`, `AIText`, `AIProviders` | AI image and text features                           |
| `Lint`, `OpenAI-Lint`, `AutoReview`                                 | Writing assistance                                   |
| `Activity`, `CollaboratorRevocation`                                | Activity feed and revoked access                     |

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
- **Cloudflare**: Use Logpush to R2, S3, or external services
- **Self-hosted**: ELK Stack, Loki+Grafana, or Datadog

Example Docker Compose with JSON logging:

```yaml
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```
