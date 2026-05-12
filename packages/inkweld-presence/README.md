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

## Lifecycle (no app-level heartbeat)

1. Client connects to the elements Yjs WS, authenticates, and immediately sends
   a `Hello` containing `{ user, status, location }`.
2. Server registers the connection in its per-project presence registry and
   broadcasts `Update` to other connections in the same project.
3. The new client receives a `Snapshot` with the current state of all OTHER
   connections in the project.
4. As the user moves between tabs / changes selection / goes idle, the client
   sends `Update` deltas. The server rebroadcasts.
5. On `close`/`error`, the server emits `Leave` to remaining connections and
   removes the entry. There is **no heartbeat** — transport-level keepalive
   (Bun ping interval, Cloudflare Hibernation auto-pong) is sufficient.

## Identifying a session

Each connection picks a stable `sessionId` (UUID). Multiple devices/tabs from
the same user will produce multiple sessions; consumers de-duplicate by
`user.username` for avatar display while keeping per-session `selection` data.
