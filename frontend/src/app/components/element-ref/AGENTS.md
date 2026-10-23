# Editor schema and tables: agent notes

The ProseMirror `Schema` is built in `extended-schema.ts` from ngx-editor's
base specs + `prosemirror-tables`' `tableNodes()` + Inkweld's own extensions.
Design: `docs/site/docs/developer/architecture.md` → "Editor Schema".

**Never construct the `Schema` inside `packages/inkweld-prosemirror`** — the
shared package returns specs only. Building it there pulls a second copy of
`prosemirror-model` into the bundle, which breaks class-identity checks in
y-prosemirror and `EditorView`; typing into the editor then silently produces
no output (see PR #1068). For the same reason `prosemirror-tables` is pinned
in `frontend/package.json`'s `resolutions` block.

Table support deliberately lives in Inkweld rather than in the
`@bobbyquantum/ngx-editor` fork: Inkweld replaced ngx-editor's menu with its
own Material toolbar, so the upstream table PR's menu components would be dead
weight. Only the schema and plugins are used.

**When touching tables, all of these need to stay in step**:

- `extended-schema.ts` — node specs (`cellContent: 'paragraph+'`, `align` attr)
- `services/project/document.service.ts` — `columnResizing` (must precede) +
  `tableEditing` + Tab keymap
- `packages/inkweld-prosemirror/src/xml/tags.ts` — table names in
  `BLOCK_NODE_NAMES`, so empty cells don't collapse to self-closing tags and
  drop columns
- `markdown-to-xml.ts` / `xml-to-markdown.ts` — GFM table parsing and emission
- `markdown-`, `html-`, `epub-`, `pdf-generator.service.ts` — publish output
