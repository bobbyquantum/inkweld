# Copilot Instructions for Inkweld

> **Full docs**: See [AGENTS.md](../AGENTS.md) for comprehensive patterns and context.

## Architecture Overview

**Collaborative creative writing platform** with monorepo structure:

| Layer | Tech | Runtime | Port |
|-------|------|---------|------|
| Frontend | Angular 21 (standalone) | Node.js | 4200 |
| Backend | Hono + Drizzle ORM | Bun | 8333 |
| Real-time | Yjs + ProseMirror | WebSocket | — |
| Storage | SQLite + per-project LevelDB | — | — |

## Mandatory Verification

**After ANY code change, run before declaring complete:**

```bash
bun run verify
```

Task is complete only when you see `✅ Verify completed`. Do not skip.

## Critical Rules

1. **Never disable lint rules** without explicit user approval
2. **Never edit** `frontend/src/api-client/` — it's auto-generated
3. **Never create** summary files (SUMMARY.md, FIXES.md, etc.)
4. **Frontend tests**: Use `npm test` (NOT `bun test` — incompatible)
5. **Backend commands**: Always use `bun` (NOT `npm` or `node`)

## Angular Patterns (Frontend)

```typescript
// ✅ Always use inject() — no constructor injection
private myService = inject(MyService);

// ✅ Use path aliases
import { MyComponent } from '@components/my-component';
```

```html
<!-- ✅ Modern control flow with track -->
@for (item of items; track item.id) { ... }
@if (condition) { ... } @else { ... }

<!-- ❌ Never use legacy directives -->
*ngIf, *ngFor, *ngSwitch
```

## Key Workflows

### API Changes
```bash
cd backend
bun run generate:openapi && bun run generate:angular-client
```

### E2E Tests
- Use `data-testid` selectors (never text/class-based)
- Helpers in `frontend/e2e/common/test-helpers.ts`
- See `frontend/e2e/BEST_PRACTICES.md`

## Project-Specific Gotchas

**Yjs Document IDs**: Frontend uses `username:slug:elements`, backend uses `username:slug:elements/` (trailing slash). This is intentional — y-websocket normalizes them. Do not "fix" this.

**OpenAPI Generation**: Script doesn't auto-terminate. Use 30-second timeout or manually stop.

## Key Files

| Purpose | Location |
|---------|----------|
| Project state | `frontend/src/app/services/project/project-state.service.ts` |
| Document sync | `frontend/src/app/services/project/document.service.ts` |
| Backend routes | `backend/src/routes/` |
| API schemas | `backend/src/schemas/` |
| E2E helpers | `frontend/e2e/common/test-helpers.ts` |
