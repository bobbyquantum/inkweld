# Sync services: agent notes

The rules in the root and `frontend/AGENTS.md` still apply. Local document
databases are profile-scoped: see `services/core/AGENTS.md`.

## Starting offline

A socket that never connected has no y-websocket reconnect loop and no
online/visibility handlers, so the first handshake's failure must not be the
end. `YjsElementSyncProvider` and `DocumentService` (open editors) retry it
with `ReconnectScheduler` (`reconnect-scheduler.ts`: equal-jitter backoff to
60 s, waits for `online` while the browser is offline, one attempt at a time,
stops on a hard denial or teardown). `SystemConfigService` (features),
`UserService` (`/users/me`) and `VersionCompatibilityService` (`/health`)
re-run a fetch that failed at startup the same way, only for server profiles.
These three check `destroyRef.destroyed` before starting a scheduler: the fetch
can fail after the service is gone (a spec's TestBed reset), and nothing would
ever stop a scheduler started then.
An unreachable `/health` leaves compatibility unknown; never store it as
incompatible, or `syncBlocked` keeps every connection local after the network
is back. `createAuthenticatedWebsocketProvider` destroys its provider on any
failure before auth (including a socket that closes without opening), so a
failed attempt never leaves an unauthenticated loop behind.

**Every provider from `createAuthenticatedWebsocketProvider` also needs
`setupReauthentication`.** y-websocket reconnects on its own after any drop
but never resends the token; the server closes that socket as `auth-timeout`
(a transient 45xx close), y-websocket reconnects again, and the loop costs a
Worker request, a Durable Object request and an alarm every ~10 s per open
document until the tab is closed.

## Bulk sync fast path (document revision manifest)

Design: `docs/site/docs/developer/architecture.md` → "Bulk Sync Fast Path".
"Sync All" first asks `GET /api/v1/projects/:username/:slug/docs/sync-manifest`
which documents changed, instead of opening one WebSocket per document. The
server side (revision tokens on Bun and Workers) is in `backend/AGENTS.md` and
`backend/src/durable-objects/AGENTS.md`.

- `DocumentSyncPlannerService` skips a document only when the manifest revision
  is unchanged **and** the local Yjs state digest still matches the checkpoint
  stored in `DocumentSyncStateService` (IndexedDB) — i.e. no local edits since
  the last sync. The digest (`utils/yjs-state-digest.ts`) encodes a Yjs
  *snapshot* (state vector + delete set): **a state vector alone does not
  change on a delete-only edit**, so text removed offline would never be
  pushed. Missing manifest, unknown revision, changed revision, changed
  digest, or an unreadable local state all force a sync.
- Checkpoints are only written when the revision is **identical before and
  after** the sync run, so a concurrent collaborator edit can never be recorded
  as synced. `before === null` (manifest unavailable) disables checkpointing.
- `revision: null` means "never persisted, nothing to pull"; `unknown: true`
  means "could not read, sync it". Do not collapse these two.
- Revision tokens are opaque and **not comparable across runtimes**; a client
  only ever compares a token to one from the same server.

The planner is deliberately conservative: a bug can only cause extra syncs,
never a missed edit. Keep it that way. The priority document is always
force-synced.
