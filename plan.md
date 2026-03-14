# Fix Media Display in Graph Views + Remove Media WebSocket

## Problem Summary

1. **Relationship chart fetches media from server API instead of local IndexedDB** — `resolveImageUrl()` in `relationship-chart-tab.component.ts` makes HTTP requests for `media://` URLs instead of reading from the local media library (IndexedDB) like the canvas does.

2. **Media WebSocket (`/api/v1/ws/media`) is unnecessary** — It only serves as a "sync sooner" nudge. The periodic REST polling already syncs media. We can replace real-time notifications with a simpler approach: try local first, sync-on-miss if not found.

## Plan

### Step 1: Fix graph views to use local media with sync-on-miss

**File:** `frontend/src/app/pages/project/tabs/relationship-chart/relationship-chart-tab.component.ts`

- Inject `LocalStorageService` and `MediaSyncService`
- Change `resolveImageUrl()` to read `media://` URLs from IndexedDB via `localStorageService.getMediaUrl()`
- On miss: trigger `mediaSyncService.downloadAllFromServer()`, then retry the local lookup once
- Fall back to direct HTTP only as last resort

### Step 2: Remove media WebSocket from frontend

**File:** `frontend/src/app/services/sync/media-auto-sync.service.ts`

- Remove `connectNotificationWebSocket()`, `disconnectNotificationWebSocket()`, `scheduleReconnect()`, and related WebSocket fields
- Remove `debouncedWebSocketSync()` and debounce timer
- Keep periodic REST polling (the 60s interval) — this is the sole sync mechanism now
- Keep `triggerSyncAfterUpload()` for immediate post-upload sync

### Step 3: Remove media WebSocket from backend

**File:** `backend/src/routes/media-notification.routes.ts` — Delete file
**File:** `backend/src/services/media-notification.service.ts` — Delete file
**File:** `backend/src/bun-app.ts` — Remove `app.route('/api/v1/ws', mediaNotificationRoutes)` import and registration
**File:** `backend/src/routes/media.routes.ts` — Remove `mediaNotificationService.notifyMediaChanged()` call after upload

## File Changes Summary

| File | Change |
|------|--------|
| `relationship-chart-tab.component.ts` | Use local media + sync-on-miss |
| `media-auto-sync.service.ts` | Remove all WebSocket code, keep REST polling |
| `media-notification.routes.ts` | Delete |
| `media-notification.service.ts` | Delete |
| `bun-app.ts` | Remove media WS route registration |
| `media.routes.ts` | Remove notification call after upload |
