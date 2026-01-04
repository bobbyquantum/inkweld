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
        max-size: "10m"
        max-file: "3"
```
