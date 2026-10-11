# @inkweld/presence

Shared presence protocol used by Inkweld's collaborative editor. Defines the
binary wire format and types for project-scoped user presence (active/idle
status, current location, selection ranges, ProseMirror cursor data).

## Why a separate package?

Presence is consumed by both the Angular frontend and the Hono/Bun + Cloudflare
Worker backend. Co-locating the protocol prevents drift between encoder and
decoder.

## Wire layout

Presence messages are **multiplexed onto the existing elements Yjs WebSocket**
using lib0 binary framing. The first varUint of every Yjs WS frame is a
message-type tag — Yjs reserves `0` (sync) and `1` (awareness). This package
claims tag `100` for presence so peers (and the server) can ignore it without
disturbing Yjs sync state.

```text
[varUint: 100][varUint: presenceMsgType][... payload ...]
```

`presenceMsgType` values are defined in `protocol/message-types.ts`. Payloads
are encoded with lib0 — see individual message files for layout.

## Lifecycle

1. Client connects to the elements Yjs WS, authenticates, and immediately sends
   a `Hello` containing `{ user, status, location }`.
2. Server registers the connection in its per-project presence registry and
   broadcasts `Update` to other connections in the same project.
3. The new client receives a `Snapshot` with the current state of all OTHER
   connections in the project.
4. As the user moves between tabs / changes selection / goes idle, the client
   sends `Update` deltas. The server rebroadcasts.
5. On `close`/`error`, the server emits `Leave` to remaining connections and
   removes the entry.

## Keepalive

Presence has no heartbeat _message_, but the client sends an app-level text
keepalive on the elements socket (`PRESENCE_KEEPALIVE_PING`, every 30 seconds
from `yjs-element-sync.provider.ts`; see `src/protocol/keepalive.ts`). The
server answers with `PRESENCE_KEEPALIVE_PONG`: the Bun route replies in its
message handler, and the Cloudflare Durable Object registers the pair with
`setWebSocketAutoResponse`, so the pong is sent without waking a hibernated
object. The text frames never reach the Yjs decoder.

## Identifying a session

Each connection picks a stable `sessionId` (UUID). Multiple devices/tabs from
the same user will produce multiple sessions; consumers de-duplicate by
`user.username` for avatar display while keeping per-session `selection` data.
