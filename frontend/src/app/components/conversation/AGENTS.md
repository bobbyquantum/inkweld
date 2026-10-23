# Conversations (speech-bubble documents): agent notes

A prose document can be written as a **conversation**: `metadata.format =
'conversation'` (`getDocumentFormat` / `formatMetadata` in
`models/scene-metadata.ts`; created from the "Conversation" option in the
new-element dialog, or "Write as Conversation" in the tree menu). It stays an
`ElementType.Item` on purpose — sync, storage, archives, MCP and publishing
all keep working without a new element type.

- **Nodes** (`packages/inkweld-prosemirror/src/schema/conversation-spec.ts`):
  `speech` (attrs `speakerId`, `speakerName`, `extension: 'os' | 'vo' | null`)
  holding `parenthetical? dialogue`. Descriptions are plain `paragraph`s and
  scene breaks are `horizontal_rule`s. The nodes live in the **same schema as
  prose** so opening a conversation in a prose editor (or the reverse) can
  never make y-prosemirror drop unknown nodes. Keep the nesting at one level:
  deeper structures can merge into invalid shapes under concurrent edits.
- **Speakers are any worldbuilding element** (or just a name). Never key
  behaviour on a schema called "Character"; the speaker picker ranks elements
  sharing a schema with speakers already linked in the conversation.
- **Editor**: `createConversationPlugin` is installed in every document.
  Enter / Tab / Backspace act only inside a speech; behaviour that changes
  ordinary paragraphs (Enter at the end of a description, `Name: ` shortcuts,
  Alt+↑↓, the drag handle) is switched on by `setConversationMode`, which the
  document editor calls for conversation documents. The editing logic is plain
  ProseMirror commands in `conversation-commands.ts` — add behaviour there and
  test it against an `EditorState`.
- **Publishing** flattens each speech to `**Name:** *(note)* line` before any
  exporter runs (`flattenConversation` in
  `services/publish/conversation-publish.ts`), and the shared `xmlToMarkdown`
  renders `<speech>` the same way. Markdown has no speech construct, so MCP
  writes conversations as XML.
- Grouping (first/last line in a run by one speaker) and the speaker colour
  are node decorations; the speech node view must only add or remove its own
  classes so it never clobbers them.
