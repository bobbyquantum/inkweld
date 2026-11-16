# @inkweld/project-library

The project-level libraries the Inkweld frontend and backend share (imported
through the `@inkweld/project-library` tsconfig path alias). Both live in the
project elements Yjs document, next to schemas and tags.

- **Time systems** (`time-system.ts`): calendars for timelines and date
  fields (`TimeSystem`, `TimePoint`), their validation, ordering, formatting
  and parsing, and the templates a project can install
  (`TIME_SYSTEM_TEMPLATES`).
- **Random generators** (`generator.ts`, `generator-engine.ts`): the
  `Generator` model, `cloneGenerator` (which also normalises untrusted
  input), and the roll engine (`rollGenerator`, `validateGenerator`).
- **Relationship fields** (`relationship-field.ts`): template fields whose
  value is a set of links to other elements. Each link is a relationship of
  the field's `relationshipTypeId` in the project's relationships store,
  never a value in the element's data map. `planRelationshipFieldLinks` turns
  the ids a field should link into the relationships to add and remove,
  `relationshipFieldLinkErrors` checks the ids (existing worldbuilding
  elements, the field's target template, `multiple`), and `linkedTargetIds`
  reads a field's value back.

The app's Settings → Time Systems and Settings → Generators pages and the MCP
time system and generator tools (`backend/src/mcp/tools/`) both use these, so
a calendar or generator an agent writes is checked and rolled exactly as the
app would. Likewise the app's relationship field, the WebMCP and the server
MCP `update_worldbuilding` tools link elements through the same relationship
field helpers.

No dependencies; nothing here touches Yjs, Angular or the DOM.

```bash
bun run test           # vitest
bun run test:coverage  # lcov for SonarCloud
```
