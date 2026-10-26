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
- `IElementSyncProvider` also exposes `listCanvasElementIds()` and
  `deleteCanvas(elementId)` so that deleting an element can unlink the
  pins/regions that point at it and drop its canvas map.
