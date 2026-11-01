# @inkweld/canvas

Canvas code shared by the Inkweld frontend and backend, so the app, the server
MCP tools and the browser's WebMCP tools cannot disagree about a canvas.

- `model` and `edit`: the data model and granular edits. Pure.
- `storage`: the Yjs layout of a canvas in the project's elements document, and
  the `canvasConfig` snapshot mirrored onto its element.
- `links`: the relationships behind linked pins and regions.
- `agent-*`: what `get_canvas` and `edit_canvas` accept and return, including
  their descriptions. `planCanvasEdit` validates a whole request and returns the
  change to write, so the two sets of tools differ only in how they store it.
- `svg` and `text-layout`: a canvas as an SVG document, used by SVG export and
  the server's renderer. Text is measured by whatever the caller passes, and
  `text-layout` follows Konva's line breaking, so keep it in step with Konva.
- `render`: what `render_canvas` shows and at what size, and the layout warnings
  it gives. The drawing itself is up to the caller.
- `gradient` and `ink-stroke`: gradients and hand-drawn strokes, as data.

`yjs` is a peer dependency and only its types are imported. Writers pass their
own `Y`, as with `@inkweld/prosemirror`, so there is never a second copy of Yjs.

```bash
bun run test            # vitest
bun run test:coverage
```
