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

The app's Settings → Time Systems and Settings → Generators pages and the MCP
time system and generator tools (`backend/src/mcp/tools/`) both use these, so
a calendar or generator an agent writes is checked and rolled exactly as the
app would.

No dependencies; nothing here touches Yjs, Angular or the DOM.

```bash
bun run test           # vitest
bun run test:coverage  # lcov for SonarCloud
```
