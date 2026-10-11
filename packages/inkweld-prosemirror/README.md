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
├── schema/      Schema specs (nodes + marks) + createExtendedSchemaSpec({ baseNodes, baseMarks })
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
- `prosemirror-model` — the schema module imports the `NodeSpec` / `MarkSpec` types; provided by both apps.

Both are declared as (required) `peerDependencies` and again as `devDependencies`, never as regular dependencies: a second copy under this package's own `node_modules` would break class-identity checks in y-prosemirror, ngx-editor and `EditorView`.

### The package returns specs, never a `Schema`

`createExtendedSchemaSpec({ baseNodes, baseMarks })` returns a plain `{ nodes, marks }` object. The host application builds the `Schema` itself (`new Schema(...)`; see `frontend/src/app/components/element-ref/extended-schema.ts`). Do not construct the `Schema` inside this package — it would pull in a second copy of `prosemirror-model` and typing in the editor would silently stop producing output (PR #1068).

## Tests

Tests live under `packages/inkweld-prosemirror/test/` and are run by a
**package-local Vitest config** (`vitest.config.ts`) with `@vitest/coverage-v8`.
They do not touch Angular APIs and can be run independently:

```bash
cd packages/inkweld-prosemirror && bun run test
# or with coverage:
cd packages/inkweld-prosemirror && bun run test:coverage
```

The root `bun run test` script (and `bun run verify`) invokes this suite via
the workspace-level `test:packages` script. Coverage thresholds enforced:
80% statements / 60% branches / 80% functions / 80% lines.
