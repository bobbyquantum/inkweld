# Yjs WebSocket Routes - Runtime Platform Support

This directory contains platform-specific implementations for Yjs collaborative editing WebSocket routes.

## Architecture Overview

Inkweld supports **multiple runtime platforms** with different WebSocket/persistence implementations:

### 🟦 Bun Runtime (Local Development)
- **Routes**: `yjs.routes.ts`
- **Service**: `yjs.service.ts` 
- **WebSocket**: Bun's native WebSocket API (`upgradeWebSocket` from 'hono/bun')
- **Persistence**: LevelDB file-based storage
- **Use Case**: Local development, self-hosted deployments

### ☁️ Cloudflare Workers (Production)
- **Routes**: `yjs-worker.routes.ts`
- **Service**: Durable Objects (`durable-objects/yjs-document.do.ts`)
- **WebSocket**: Cloudflare WebSocket API with Durable Objects
- **Persistence**: Durable Object storage (transactional key-value)
- **Use Case**: Production deployments on Cloudflare

## Runtime Detection

The application automatically detects the runtime platform using `src/config/runtime.ts`:

```typescript
import { detectRuntime, RuntimePlatform } from './config/runtime';

const platform = detectRuntime();
// Returns: 'bun' | 'cloudflare-workers' | 'node' | 'unknown'
```

## File Structure

```
backend/src/
├── config/
│   └── runtime.ts                    # Runtime detection utilities
├── durable-objects/
│   └── yjs-document.do.ts           # Cloudflare Durable Object for Yjs
├── routes/
│   ├── yjs.routes.ts                # Bun WebSocket implementation
│   └── yjs-worker.routes.ts         # Cloudflare Workers implementation
├── services/
│   └── yjs.service.ts               # Shared Yjs logic (Bun/Node)
├── types/
│   └── cloudflare.ts                # Cloudflare Workers type definitions
├── bun-app.ts                       # Bun app (includes yjs.routes)
└── worker-app.ts                    # Workers app (includes yjs-worker.routes)
```

## How It Works

### Bun Runtime (`bun-app.ts`)
```typescript
import yjsRoutes from './routes/yjs.routes';

app.route('/ws', yjsRoutes); // Uses Bun WebSocket + LevelDB
```

### Cloudflare Workers (`worker-app.ts`)
```typescript
import yjsWorkerRoutes from './routes/yjs-worker.routes';

app.route('/ws', yjsWorkerRoutes); // Uses Durable Objects
```

The correct implementation is loaded at **build time** based on the entry point:
- `bun-runner.ts` → `bun-app.ts` → Bun WebSocket
- `cloudflare-runner.ts` → `worker-app.ts` → Durable Objects

## Cloudflare Durable Objects

### What are Durable Objects?

Durable Objects are Cloudflare's solution for **stateful** serverless applications:

- **One instance per document**: Each Yjs document gets a dedicated Durable Object
- **Persistent WebSocket connections**: Connections survive across requests
- **Transactional storage**: Built-in key-value storage for persistence
- **Global coordination**: Guaranteed single instance per document ID worldwide

### How Yjs Uses Durable Objects

1. **Client connects**: WebSocket upgrade request to `/ws/yjs?documentId=user:project:doc`
2. **Route to DO**: Request routed to Durable Object instance (by `documentId`)
3. **Manage state**: DO handles all connections, syncing, and awareness for that document
4. **Persist updates**: DO stores Yjs updates in Durable Object storage
5. **Cleanup**: DO hibernates when all clients disconnect (cost savings)

### Configuration

Durable Objects are configured in `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "YJS_DOCUMENTS"
class_name = "YjsDocument"
script_name = "inkweld-backend"

[[migrations]]
tag = "v1"
new_classes = ["YjsDocument"]
```

## WebSocket Endpoint

### Format
```
ws://localhost:8333/ws/yjs?documentId=<documentId>&userId=<userId>
```

### Parameters
- `documentId` (required): Format `username:projectSlug:documentName` or `username:projectSlug:elements`
- `userId` (optional): User ID for awareness protocol

### Example
```javascript
const ws = new WebSocket('ws://localhost:8333/ws/yjs?documentId=alice:my-novel:chapter1&userId=123');
```

## Development Workflow

### Local Development (Bun)
```bash
cd backend
bun run dev  # Uses LevelDB persistence
```

### Cloudflare Workers (Local Testing)
```bash
cd backend
bun run wrangler dev  # Uses Miniflare with Durable Objects
```

### Production Deployment
```bash
cd backend
bun run deploy  # Deploys to Cloudflare Workers
```

## Testing

### Unit Tests
```bash
bun test  # Tests Yjs service logic
```

### E2E Tests
```bash
# Frontend e2e tests include WebSocket/Yjs scenarios
cd ../frontend
npm run e2e
```

## Adding New Runtime Platforms

To support additional platforms (e.g., Deno, AWS Lambda):

1. **Create route implementation**: `routes/yjs-<platform>.routes.ts`
2. **Create platform-specific logic**: Handle WebSocket upgrades and persistence
3. **Update runtime detection**: Add platform check to `config/runtime.ts`
4. **Create platform app**: `<platform>-app.ts` that imports platform routes
5. **Update build config**: Add entry point for new platform

## Migration from Old Backend

The new Hono backend replaces the NestJS-based `/server` directory:

### Old (NestJS + Bun)
```
server/src/
├── yjs/
│   ├── yjs.gateway.ts      # WebSocket gateway
│   └── yjs.service.ts      # LevelDB persistence
```

### New (Hono + Multi-Platform)
```
backend/src/
├── routes/
│   ├── yjs.routes.ts       # Bun implementation
│   └── yjs-worker.routes.ts # Workers implementation
├── services/
│   └── yjs.service.ts      # Shared logic
└── durable-objects/
    └── yjs-document.do.ts  # Workers Durable Object
```

## Performance Considerations

### Bun + LevelDB
- ✅ Fast local file I/O
- ✅ Simple deployment
- ❌ Single-server limitation
- ❌ Requires persistent disk

### Cloudflare Durable Objects
- ✅ Globally distributed
- ✅ Auto-scaling per document
- ✅ No infrastructure management
- ✅ Hibernation API for cost savings
- ⚠️ Cold start latency (~100-200ms)
- ⚠️ Per-request pricing model

## Troubleshooting

### "YJS_DOCUMENTS binding not found"
- Check `wrangler.toml` has Durable Object binding configured
- Run `bun run wrangler deploy` to apply migrations

### "WebSocketPair is not defined"
- This error occurs when trying to run Workers code in Bun
- Ensure `cloudflare-runner.ts` is the entry point for Workers

### "Cannot find module 'cloudflare:workers'"
- Expected during development (types only available at runtime)
- Use `@ts-expect-error` annotations where needed

### LevelDB Persistence Issues
- Check file permissions on `data/` directory
- Ensure no concurrent writes to same LevelDB instance
- Run cleanup: `rm -rf backend/data/*/.*yjs`

## References

- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [Yjs Documentation](https://docs.yjs.dev/)
- [Hono Framework](https://hono.dev/)
- [y-protocols](https://github.com/yjs/y-protocols)
