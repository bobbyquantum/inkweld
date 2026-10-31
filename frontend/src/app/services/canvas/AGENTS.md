# Canvas services: agent notes

**Canvas contents** live in their own `canvases` shared type (element id →
`{ layers, objects: Map<id, json>, order: Array<id>, frames }` — `frames` is a
JSON array of canvas-size/crop frames, written only when present) rather than
as a JSON blob on the owning element. Each object is its own entry, so two
people drawing at once keep both sets of strokes and a stroke costs a small
delta instead of a rewrite of the whole element array.

- The element's `canvasConfig` metadata is still written, but only after
  drawing pauses — it is the interchange format for archives, templates and
  the media-usage scan, not the live editing surface.
- The stored model, the Yjs layout and the mirroring live in `@inkweld/canvas`
  (`packages/inkweld-canvas`), so the sync provider and the backend's MCP tools
  write the same thing. `canvas.model.ts` and `canvas-edit.ts` re-export it.
- **Agents edit canvases** (`get_canvas` / `edit_canvas`, on the server and in
  WebMCP). A browser only mirrors its own edits to `canvasConfig`, so the server
  tool mirrors its own too; a writer that adds a third path must do the same,
  and seed from the metadata first (`resolveCanvasContents`), or a canvas
  restored from an archive loses its contents on the first edit.
- **Two writers can start one canvas at once**: an agent's parallel tool calls
  on Workers, or someone drawing offline. Yjs keeps one value per map key, so
  `ensureCanvasMap` creates a canvas's map under a client id made from its id,
  and every writer makes the same items, which merge. Those items and the id
  can never change, and nothing else may create a canvas's map. For the same
  reason a new canvas's first layer is `firstCanvasLayer()`, not a random id.
- `applyCanvasEdit(..., { external: true })` reports the change through
  `canvasContents$` like another peer's. Without it, a tab holding that canvas
  would not show an edit made elsewhere in the same browser.
- **`resolveImageSrc` fetches missing media from the server** on a server
  profile: an agent can upload an image and place it while a tab is open. If it
  isn't there yet, `retryFailedImages` tries again whenever `mediaSyncVersion`
  moves, since the node would otherwise only change with the object.
- `IElementSyncProvider` also exposes `listCanvasElementIds()` and
  `deleteCanvas(elementId)` so that deleting an element can unlink the
  pins/regions that point at it and drop its canvas map.
