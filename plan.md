# Fix WebSocket Media on Cloudflare + Graph Views Not Showing Media

## Problem Summary

Two related issues:

1. **WebSocket `/api/v1/ws/media` doesn't exist on Cloudflare Workers** — The media notification WebSocket route (`media-notification.routes.ts`) is only registered in `bun-app.ts` (line 193), not in `worker-app.ts`. This causes the repeated connection failures seen in the console logs.

2. **Relationship chart fetches media from the server instead of local IndexedDB** — The `resolveImageUrl()` method in `relationship-chart-tab.component.ts` (line 1007) hits the REST API (`environment.apiUrl/api/v1/media/...`) to resolve `media://` URLs, rather than using `localStorageService.getMediaUrl()` like the canvas does. This means if media hasn't been synced or the server request fails, graph nodes show as plain tokens instead of with thumbnails.

## Root Cause

- The backend uses Bun's `upgradeWebSocket()` for media notifications, which isn't available in Cloudflare Workers. Cloudflare Workers use Durable Objects for WebSocket, but no media notification DO exists.
- The relationship chart was written to fetch images from the server directly, bypassing the local media library that already has the files cached in IndexedDB.

## Plan

### Step 1: Fix the relationship chart to use local media library (frontend)

**File:** `frontend/src/app/pages/project/tabs/relationship-chart/relationship-chart-tab.component.ts`

Modify `resolveImageUrl()` (lines 995-1021) to resolve `media://` URLs from the local IndexedDB via `LocalStorageService.getMediaUrl()` instead of making HTTP requests to the server API.

**Change:**
- Inject `LocalStorageService` into the component
- For `media://` URLs: extract the mediaId (filename without extension), call `localStorageService.getMediaUrl(projectKey, mediaId)`
- Fall back to the existing HTTP fetch only if not found locally
- This matches how the canvas component resolves media URLs

### Step 2: Make WebSocket connection failure graceful on Cloudflare (frontend)

**File:** `frontend/src/app/services/sync/media-auto-sync.service.ts`

The WebSocket failure is already somewhat graceful (periodic polling continues at 60s), but the console is spammed with errors from 10 reconnection attempts. Improvements:

- Reduce max reconnection attempts or detect that the endpoint doesn't exist (e.g., HTTP 404/426 upgrade failure) and stop retrying
- After the first connection failure, mark WebSocket as unavailable for this session and rely solely on REST polling
- Optionally reduce the periodic sync interval (e.g., 30s instead of 60s) when WebSocket is unavailable, to compensate for the lack of real-time notifications

### Step 3: (Optional/Future) Add media notification support to Cloudflare Workers

**Files:**
- `backend/src/worker-app.ts` — register a media notification route
- New: `backend/src/routes/media-notification-worker.routes.ts` — Durable Object-based media notification WebSocket

This is lower priority because:
- Step 1 (local media) solves the immediate graph display problem
- Step 2 (graceful fallback) stops the console spam
- Periodic polling provides adequate sync for media changes
- Implementing a Durable Object for media notifications adds complexity for marginal benefit (media changes are infrequent compared to document edits)

**Alternative to Step 3:** Use Server-Sent Events (SSE) instead of WebSocket for media notifications on Cloudflare, since SSE works natively with Workers without Durable Objects. This would be simpler but still provide push-based notifications.

## File Changes Summary

| File | Change |
|------|--------|
| `relationship-chart-tab.component.ts` | Use `LocalStorageService` for `media://` URL resolution instead of HTTP |
| `media-auto-sync.service.ts` | Detect unsupported WebSocket endpoint, stop retrying, rely on polling |
| (optional) `worker-app.ts` | Register media notification SSE/WS route |

## Impact

- Graph views will show element media thumbnails from local IndexedDB (which is already synced via REST polling)
- No more WebSocket error spam in the console on Cloudflare deployments
- Media sync continues working via 60s REST polling (already implemented as fallback)
- No backend changes required for the immediate fix (Steps 1 & 2)
