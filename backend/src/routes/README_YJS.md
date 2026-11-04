# Yjs WebSocket Routes

Yjs collaborative editing has two server implementations that expose the same
WebSocket endpoint. Which one runs depends on the entry point.

| Runtime            | Entry point                              | Route file             | Persistence                                            |
| ------------------ | ---------------------------------------- | ---------------------- | ------------------------------------------------------ |
| Bun (self-hosted)  | `bun-runner.ts` → `bun-app.ts`           | `yjs.routes.ts`        | One LevelDB per project, via `services/yjs.service.ts` |
| Cloudflare Workers | `cloudflare-runner.ts` → `worker-app.ts` | `yjs-worker.routes.ts` | Durable Object storage (`durable-objects/`)            |

Both apps mount the router at `/api/v1/ws`, so the Yjs endpoint is:

```
ws(s)://<host>/api/v1/ws/yjs?documentId=<username>:<slug>:<elementId>
```

`documentId` is `username:projectSlug:elementId`, or `username:projectSlug:elements`
for the project tree. Do not "fix" the trailing slash the backend/MCP adds to the
elements document id — see AGENTS.md.

Both runtimes check the id with `parseDocumentId` (`utils/yjs-document-id.ts`)
before anything else: three non-empty parts and at most one trailing slash. The
first two parts always name the project, `worldbuilding:` included (clients
never send that prefix). Any other id is refused before authentication: the Bun
route sends `access-denied:invalid-document` and closes with 4400, and the
Worker route and the Durable Object answer 400.

## Authentication

Browsers cannot send an `Authorization` header on a WebSocket, so the connection
upgrades unauthenticated and authenticates over the socket (documented in the
header comments of `yjs.routes.ts` and `yjs-project.do.ts`):

1. The client sends its token as the first text message.
2. The server validates the token and project access and answers with
   `authenticated` or `access-denied:<reason>`.
3. Only then does binary Yjs sync begin. Viewers receive updates but cannot
   send them.

Denial closes use the y-websocket 3.1 convention in `utils/ws-close-codes.ts`
(44xx permanent, 45xx transient). Binary frames that arrive before auth
completes are queued within the bounds in `utils/ws-preauth.ts`, and a socket
that never authenticates is closed.

Both runtimes check every sync and awareness message with
`isYjsMessageWithinLimits` (`utils/yjs-message-limits.ts`) before applying it.
A document update or awareness update that does not decode, or that holds a
JSON value nested more than 256 levels deep (`MAX_YJS_JSON_DEPTH`), is dropped.
The server publishes no awareness state of its own and runs no awareness timer:
a socket's awareness states are removed when the socket closes.

## Bun: LevelDB

`yjs.routes.ts` uses Hono's `upgradeWebSocket` from `hono/bun`. `YjsService`
keeps one LevelDB instance per project and tracks writing sessions for the
stats and activity features.

Every socket handler in `yjs.routes.ts` catches its own errors, so a problem
with one socket's input only affects that socket. A binary frame whose message
type cannot be read (`peekFrameTag` returns null) is dropped. `bun-runner.ts`
and `node-runner.ts` log any promise rejection nothing handled
(`utils/unhandled-rejection.ts`) as a last resort.

## Workers: Durable Objects

`yjs-worker.routes.ts` validates `documentId`, then forwards the upgrade to a
Durable Object. There is **one Durable Object per project** (`username:slug`),
not one per document: it holds the elements doc and every open document of that
project. The class is `YjsProject` in `durable-objects/yjs-project.do.ts`, bound
as `YJS_PROJECTS` (see `wrangler.toml.example`), and uses WebSocket hibernation.

The same router also serves a diagnostics proxy,
`GET /api/v1/ws/yjs/do/{stats|elements|document|storage-keys|storage-size}?documentId=...`,
which forwards to the Durable Object's internal HTTP API (the DO checks the
bearer token itself).

## Local development

```bash
cd backend
bun run dev          # Bun + LevelDB
bun run dev:worker   # wrangler dev (Miniflare + Durable Objects)
bun test             # unit tests
```

Deploying to Cloudflare is done with the root `cloudflare:*` scripts; see
`docs/site/docs/admin-guide/ci-cd.md`. Frontend e2e specs exercise the
WebSocket path under both Bun and wrangler.

## Troubleshooting

- **"YJS_PROJECTS binding not found"** (503): the Worker config lacks the
  Durable Object binding or its `[[migrations]]` entry; compare with
  `wrangler.toml.example`.
- **`WebSocketPair is not defined`**: Workers-only code was loaded under Bun.
  The Workers entry point is `cloudflare-runner.ts`.
- **LevelDB problems**: check permissions on the data directory and make sure
  only one server process opens a project's LevelDB.

## References

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Yjs documentation](https://docs.yjs.dev/)
- [y-protocols](https://github.com/yjs/y-protocols)
