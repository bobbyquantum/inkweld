# @inkweld/prosemirror: agent notes

Shared ProseMirror specs, XML and Markdown conversion used by the frontend and
the backend/MCP.

- **Return specs only; never construct a `Schema` here.** Building it in this
  package pulls a second copy of `prosemirror-model` into the frontend bundle,
  which breaks class-identity checks in y-prosemirror and `EditorView`; typing
  then silently produces no output (PR #1068). The frontend builds the schema
  in `frontend/src/app/components/element-ref/extended-schema.ts`; its
  `AGENTS.md` lists everything that must change together for tables.
- `src/xml/tags.ts`: every block node (tables included) must be in
  `BLOCK_NODE_NAMES`, or empty nodes serialize as self-closing tags and drop
  content (an empty table cell drops a column).
- Conversation nodes (`src/schema/conversation-spec.ts`) share the prose
  schema and stay one level deep; see
  `frontend/src/app/components/conversation/AGENTS.md`.
