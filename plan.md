# Fix WebSocket Media on Cloudflare + Graph Views Not Showing Media

## Problem Summary

Two related issues:

1. **WebSocket `/api/v1/ws/media` doesn't exist on Cloudflare Workers** — The media notification WebSocket route (`media-notification.routes.ts`) is only registered in `bun-app.ts` (line 193), not in `worker-app.ts`. This causes the repeated connection failures seen in the console logs.

2. **Relationship chart fetches media from the server instead of local IndexedDB** — The `resolveImageUrl()` method in `relationship-chart-tab.component.ts` (line 1007) hits the REST API (`environment.apiUrl/api/v1/media/...`) to resolve `media://` URLs, rather than using `localStorageService.getMediaUrl()` like the canvas does.

## Plan

### Step 1: Fix graph views to use local media library + trigger sync on miss (frontend)

**File:** `frontend/src/app/pages/project/tabs/relationship-chart/relationship-chart-tab.component.ts`

Modify `resolveImageUrl()` (lines 995-1021) to:
- Inject `LocalStorageService` and `MediaSyncService` into the component
- For `media://` URLs: extract mediaId (filename without extension), call `localStorageService.getMediaUrl(projectKey, mediaId)`
- **On miss (null result)**: trigger a media sync via `mediaSyncService.downloadAllFromServer(projectKey)`, then retry the local lookup once
- Only fall back to direct HTTP fetch as a last resort
- This matches how the canvas component resolves media URLs and ensures the local library stays populated

### Step 2: Piggyback media notifications on existing Yjs Durable Object (backend + frontend)

The Yjs DO (`YjsProject`) already has authenticated WebSocket connections for every active client per project. We can reuse this channel:

**Backend changes:**

**File:** `backend/src/durable-objects/yjs-project.do.ts`
- Add a `POST /api/media-notify` HTTP endpoint to `handleHttpApi()` that accepts `{ filename, action }` and broadcasts a text message `{"type":"media-changed",...}` to all connected WebSocket clients for that project
- The broadcast sends a text (not binary) message, which Yjs ignores (it only processes binary messages)

**File:** `backend/src/routes/media.routes.ts`
- After a successful upload (line 261), instead of/in addition to the Bun-only `mediaNotificationService.notifyMediaChanged()`, send an HTTP POST to the project's Durable Object stub: `namespace.get(id).fetch('/api/media-notify', { method: 'POST', body: JSON.stringify({...}) })`
- Guard this behind a check for `c.env.YJS_PROJECTS` so it only runs on Cloudflare Workers (Bun keeps existing behavior)

**Frontend changes:**

**File:** `frontend/src/app/services/sync/authenticated-websocket-provider.ts`
- After auth completes, wrap the restored `onmessage` handler to intercept text messages that look like `{"type":"media-changed",...}` and emit them via a callback/subject, while still passing binary messages through to Yjs

**File:** `frontend/src/app/services/sync/yjs-element-sync.provider.ts`
- Expose a `mediaChanged$` observable that the `MediaAutoSyncService` can subscribe to
- When a media-changed text message arrives on the Yjs WebSocket, emit on this observable

**File:** `frontend/src/app/services/sync/media-auto-sync.service.ts`
- Subscribe to `yjsSyncProvider.mediaChanged$` as an additional sync trigger (same as the existing WebSocket notification behavior)
- This replaces the need for a separate media WebSocket connection on Cloudflare

### Step 3: Make standalone media WebSocket failure graceful (frontend)

**File:** `frontend/src/app/services/sync/media-auto-sync.service.ts`

The standalone `/api/v1/ws/media` WebSocket still exists for Bun deployments. For Cloudflare where it doesn't exist:
- After the first connection failure, mark WebSocket as unavailable for this session and stop retrying (instead of 10 attempts with exponential backoff)
- When WebSocket is unavailable AND no Yjs media notifications are available, reduce periodic sync interval to 30s instead of 60s

## Architecture Summary

```
                    Bun deployment                    Cloudflare deployment
                    ──────────────                    ─────────────────────
Media upload    →   REST API handler              →   REST API handler
                        │                                  │
Notification    →   mediaNotificationService      →   HTTP POST to Yjs DO
                    (in-memory WS broadcast)           (DO broadcasts to WS clients)
                        │                                  │
Frontend        →   Dedicated media WebSocket     →   Yjs WebSocket (piggyback)
                    (/api/v1/ws/media)                (text msg on /api/v1/ws/yjs)
                        │                                  │
Sync trigger    →   MediaAutoSyncService          →   MediaAutoSyncService
                        │                                  │
Graph display   →   LocalStorageService (IndexedDB) ← same (with sync-on-miss)
```

## File Changes Summary

| File | Change |
|------|--------|
| `relationship-chart-tab.component.ts` | Use local media library with sync-on-miss fallback |
| `yjs-project.do.ts` | Add `POST /api/media-notify` broadcast endpoint |
| `media.routes.ts` | On Cloudflare, notify via DO stub after upload |
| `authenticated-websocket-provider.ts` | Intercept text messages post-auth for media notifications |
| `yjs-element-sync.provider.ts` | Expose `mediaChanged$` observable |
| `media-auto-sync.service.ts` | Subscribe to Yjs media events; graceful standalone WS failure |

## Impact

- Graph views show media from local IndexedDB (fast, works offline)
- Missing media triggers a sync automatically (self-healing)
- Real-time media notifications work on Cloudflare via existing Yjs WebSocket
- No new Durable Objects or WebSocket connections needed
- No console error spam on Cloudflare
- Bun deployments continue working as before (dedicated media WS still available)
