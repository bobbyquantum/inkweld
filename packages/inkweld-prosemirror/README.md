# @inkweld/prosemirror

Shared, framework-free ProseMirror utilities used by both the Inkweld frontend (Angular) and backend (Hono / Cloudflare Worker / Durable Object).

## Why a shared package?

The frontend and backend both need to:

- Understand the Inkweld ProseMirror **schema** (custom `element_ref` nodes, `comment`/`text_color`/`text_background_color` marks, etc.).
- **Serialize** Yjs `XmlFragment` documents to the canonical XML string format Inkweld stores and exchanges.
- **Parse** that XML string back into Yjs nodes (used by MCP write tools and migration scripts).
- Convert ProseMirror documents to and from **Markdown** with full round-trip safety (lossy marks like `comment` and color are preserved as inline HTML spans).
- Encode/decode the `inkweld://` URI scheme for `element_ref` deeplinks.

Before this package, the schema lived in `frontend/src/app/components/{element-ref,comment-mark}/`, the XML parser was duplicated in `backend/src/mcp/tools/yjs-runtime.ts` and `backend/src/durable-objects/yjs-project.do.ts` (with subtle differences and a marks-propagation bug in the DO copy), and Markdown generation existed only in the frontend (`MarkdownGeneratorService`). MCP tools could only round-trip plain text, which silently destroyed structure.

## Layout

```text
src/
├── schema/      Schema specs (nodes + marks) + factory: createExtendedSchema(baseNodes, baseMarks)
├── xml/         Canonical Yjs <-> XML string conversion (parser, serializer, mark/node tag tables)
├── markdown/    XML <-> Markdown conversion (lossy marks preserved as HTML spans)
├── uri/         inkweld:// URI codec for element_ref nodes
└── runtime/     Helpers for constructing minimal Yjs docs / fragments for MCP write paths
```

## Consumption

This package is **not published**. Both apps consume it via tsconfig `paths`:

- Frontend: `frontend/tsconfig.json` maps `@inkweld/prosemirror/*` → `../packages/inkweld-prosemirror/src/*`.
- Backend: `backend/tsconfig.json` does the same.

There is **no separate `bun install` step** — the source is included directly in each app's TypeScript program. Bun's bundler and Wrangler's esbuild both honor tsconfig paths, so production builds work without any extra tooling.

## Peer dependencies

- `yjs` — XML and runtime modules import `yjs` types/values; provided by both apps.
- `prosemirror-model` — schema module imports `Schema`, `NodeSpec`, `MarkSpec`; provided by both apps.

Both peers are marked optional so a hypothetical pure-Markdown-only consumer could import only `@inkweld/prosemirror/markdown` without installing them. In practice both apps already have both.

## Tests

Tests live under `packages/inkweld-prosemirror/test/` and are run by the **frontend Vitest** project (added to its `include` glob) so we get one consistent runner with the same Angular-free environment. They do not touch Angular APIs.
