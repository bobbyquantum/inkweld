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

`yjs` is a peer dependency and only its types are imported. Writers pass their
own `Y`, as with `@inkweld/prosemirror`, so there is never a second copy of Yjs.

```bash
bun run test            # vitest
bun run test:coverage
```
