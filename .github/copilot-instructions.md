# Copilot Instructions for Inkweld

## Project Architecture

Inkweld is a **collaborative creative writing platform** with a monorepo structure:

- **Frontend**: Angular 21 standalone components (port 4200, runs on Node.js)
- **Backend**: Hono on Bun runtime (port 8333)
- **Database**: Drizzle ORM (SQLite/D1) + per-project LevelDB for Yjs documents
- **Real-time**: Yjs CRDTs via WebSocket for collaborative editing

```
Root (npm) → Frontend (bun+npm) + Backend (bun)
```

**Critical**: Frontend dev server uses Node.js (`npm start`), but backend uses Bun (`bun run dev`).

## AI Development Tools

### Model Context Protocol (MCP)

This project is configured with the **Angular CLI MCP Server**, which enables AI assistants to access real-time Angular documentation and best practices directly from angular.dev.

**Configuration**: The MCP server is configured in `.vscode/mcp.json` and provides the following tools:

- `get_best_practices` - Retrieves current Angular coding standards
- `search_documentation` - Searches angular.dev in real-time
- `list_projects` - Analyzes workspace structure
- `find_examples` (experimental) - Searches curated Angular code examples
- `modernize` (experimental) - Provides migration instructions for upgrading code

**Benefits**:

- AI assistants have access to up-to-date Angular documentation
- Reduces reliance on potentially outdated training data
- Project-aware guidance based on actual workspace structure
- Official Angular patterns and best practices

**Restart Required**: After MCP configuration changes, restart VS Code or your AI assistant to enable the integration.

For more information, visit: https://angular.dev/ai/mcp

## Code Quality Rules (Non-Negotiable)

### 1. Testing Requirements

- **All code changes require test coverage** - no exceptions
- **All tests must pass** before considering work complete
- Run `npm test` (frontend) or `bun test` (backend) before submitting
- Use Vitest for unit tests (NOT Jasmine)
- Use Playwright for e2e tests with test fixtures in `frontend/e2e/fixtures.ts`

### 2. Linting is Sacred

- **NEVER disable lint rules** without explicit user approval
- If a lint rule needs disabling, ask first and explain why
- Run `npm run lint:fix` (frontend) or `bun run lint:fix` (backend)
- Prefer fixing the issue over disabling rules

### 3. No Summary Files

- **DO NOT create** `SUMMARY.md`, `FIXES.md`, `STATUS.md`, or similar unless explicitly requested
- Provide summaries in conversation only
- Update existing documentation when making significant changes

## Frontend-Specific Patterns (Angular 21)

### Dependency Injection - Always Use `inject()`

```typescript
// ✅ CORRECT - Modern Angular 21
export class MyComponent {
  private myService = inject(MyService);
  private router = inject(Router);
}

// ❌ WRONG - Don't use constructor injection
export class MyComponent {
  constructor(private myService: MyService) {}
}
```

### Control Flow - Use Modern Syntax

```html
<!-- ✅ CORRECT - Angular 21 control flow -->
@if (condition) {
<div>Content</div>
} @else {
<div>Alternative</div>
} @for (item of items; track item.id) {
<div>{{ item.name }}</div>
} @empty {
<div>No items</div>
} @switch (value) { @case ('a') {
<div>A</div>
} @case ('b') {
<div>B</div>
} @default {
<div>Default</div>
} }

<!-- ❌ WRONG - Legacy syntax (don't use) -->
<div *ngIf="condition">Content</div>
<div *ngFor="let item of items">{{ item.name }}</div>
```

**Always use `track` with `@for`** - prefer `track item.id` over `track $index`.

### Path Aliases

Use import aliases for cleaner imports:

- `@components/...`
- `@services/...`
- `@models/...`
- `@utils/...`

### Testing

- **Unit tests**: Vitest with `@ngneat/spectator` for components
- **E2E tests**: Playwright with fixtures (`authenticatedPage`, `anonymousPage`, `adminPage`)
- Use `data-testid` attributes for stable selectors in e2e tests
- Mock API responses using `frontend/e2e/mock-api/` framework

## Backend-Specific Patterns (Hono + Bun)

### Runtime - Always Use Bun

```bash
# ✅ CORRECT
bun run start:dev
bun test
bun run admin

# ❌ WRONG - Don't use Node.js for backend
npm run start:dev
node dist/main.js
```

### Type Imports for Express Types

```typescript
// ✅ CORRECT - Use import type
import type { Request, Response } from "express";

// ❌ WRONG - Regular import causes issues with Bun
import { Request, Response } from "express";
```

### Per-Project LevelDB Storage

- Each project gets its own LevelDB instance for Yjs documents
- Located in `data/<username>/<project-slug>/`
- Automatic cleanup of idle connections
- Uses `y-leveldb` adapter for persistence

### Session-Based Authentication

- Session store uses signed cookies (Hono cookie middleware)
- httpOnly cookies with CSRF protection
- No JWT tokens (intentional design choice)
- GitHub OAuth is optional (configurable via env vars)

## Development Workflow

### Starting Development

```bash
# Install all dependencies (from root)
bun install

# Start both frontend and backend
npm start  # Runs concurrently

# Or individually:
cd frontend && npm start      # Port 4200
cd backend && bun run dev     # Port 8333
```

### Running Tests

```bash
# All tests (both frontend and backend)
npm test

# Frontend only
cd frontend && npm test        # Vitest
cd frontend && npm run e2e     # Playwright

# Backend only
cd backend && bun test
```

### API Client Generation

When backend API changes:

```bash
cd backend
bun run generate:openapi        # Updates openapi.json
bun run generate:angular-client # Regenerates frontend/src/api-client/
```

The API client is **auto-generated** - never edit files in `frontend/src/api-client/` directly.

## Common Tasks

### Adding a New API Endpoint

1. Create/modify route/handler in `backend/src/*/`
2. Add Swagger decorators (`@ApiOperation`, `@ApiResponse`, etc.)
3. Run `bun run generate:angular-client` from `backend/`
4. Use generated types in frontend services
5. Write controller tests using Bun test
6. Update e2e mock API handlers if needed

### Adding a New Frontend Component

1. Use Angular CLI: `ng generate component path/component-name`
2. Make it standalone (default in Angular 21)
3. Use `inject()` for dependency injection
4. Use modern control flow (`@if`, `@for`, `@switch`)
5. Write component tests using Spectator
6. Add e2e tests if user-facing

### E2E Test Best Practices

- Use fixtures from `frontend/e2e/fixtures.ts`:
  - `authenticatedPage` - logged-in user
  - `anonymousPage` - not logged in
  - `adminPage` - admin user
- Always use `data-testid` attributes for selectors
- Generate unique test data using `test-helpers.ts` utilities
- Mock API responses in `frontend/e2e/mock-api/`
- See `frontend/e2e/BEST_PRACTICES.md` for detailed guidelines

## Project-Specific Conventions

### Real-Time Collaboration

- Documents use **Yjs** for CRDT-based editing
- ProseMirror is the rich text editor (via `y-prosemirror` binding)
- WebSocket connections managed by `y-websocket`
- Offline editing supported via `y-indexeddb` (frontend)
- Each project's Yjs documents stored in separate LevelDB instance

### Project Structure

- Projects belong to users (`user.username/project.slug`)
- Projects contain **elements** (hierarchical: folders, files, documents)
- Documents can have worldbuilding templates (character, location, etc.)
- File storage in `backend/data/<username>/<project-slug>/`

### Worldbuilding Features

- Template system for structured content (characters, locations, etc.)
- Schema-based with customizable tabs and fields
- Managed by `WorldbuildingService` (frontend) and `SchemaService` (backend)
- Templates stored in project-specific LevelDB

## Configuration & Environment

### Frontend Environment

- Development: `frontend/src/environments/environment.ts`
- Production: `frontend/src/environments/environment.prod.ts`
- App config stored in localStorage as `inkweld-app-config`

### Backend Environment Variables

Key variables (see `.env.example` at project root):

- `DB_TYPE`: `sqlite` or `d1` (defaults to sqlite)
- `PORT`: Server port (default 8333)
- `SESSION_SECRET`: Session encryption key
- `DATA_PATH`: Base path for project data (default `./data`)
- `USER_APPROVAL_REQUIRED`: Require admin approval for new users (default true)
- `GITHUB_ENABLED`: Enable GitHub OAuth (default false)

## Debugging Tips

### Frontend

- Use Angular DevTools browser extension
- Check browser console for errors
- Use Playwright trace viewer for failed e2e tests: `npx playwright show-trace trace.zip`
- Mock API issues: Check `frontend/e2e/mock-api/` handlers

### Backend

- VS Code debugger configured in `.vscode/launch.json`
- Check server logs for stack traces
- Swagger UI at `http://localhost:8333/api` for API testing
- Use `bun --inspect` for debugging

### Common Issues

- **Module resolution errors**: Run `bun install` from root
- **Build failures**: Clear caches with `rm -rf .angular node_modules && bun install`
- **Test failures**: Run single test with `npm test -- <pattern>` to isolate issues
- **Lint errors**: Run `npm run lint:fix` to auto-fix

## Deployment

### Docker

- Production image built with `npm run build:image:prod`
- Multi-stage build optimized for size
- Runs on Bun in production
- Published to GitHub Container Registry (GHCR)

### CI/CD Pipeline

- GitHub Actions on push to `main` and PRs
- Runs tests, linting, and builds
- Auto-publishes Docker images on main branch
- See `.github/workflows/ci.yml` and `docs/CI_CD.md`

## Key Files & Directories

### Documentation

- `AGENTS.md` - Comprehensive AI agent instructions (superset of this file)
- `docs/GETTING_STARTED.md` - Setup guide
- `docs/CI_CD.md` - CI/CD pipeline details
- `frontend/e2e/BEST_PRACTICES.md` - E2E testing guidelines

### Configuration

- `frontend/angular.json` - Angular workspace config
- `backend/wrangler.toml` - Cloudflare Workers bindings/config
- `backend/openapi.json` - API specification (generated)
- `.vscode/tasks.json` - VS Code tasks for build/run

### Critical Services (Frontend)

- `project-state.service.ts` - Central project state management
- `unified-project.service.ts` - Hybrid online/offline project operations
- `document.service.ts` - Yjs document management
- `worldbuilding.service.ts` - Template/schema system

### Critical Modules (Backend)

- `auth/` - Authentication (local + GitHub OAuth)
- `project/` - Project & document management
- `user/` - User management
- `mcp/` - Model Context Protocol (AI integration)

## Remember

1. **Tests are mandatory** - no merging without passing tests
2. **Lint rules are enforced** - ask before disabling
3. **Frontend uses `inject()`** - no constructor DI
4. **Backend targets Bun** - Node.js & Workers builds exist, but Bun is preferred during development
5. **Use modern Angular control flow** - `@if`, `@for`, `@switch`
6. **E2E tests use fixtures** - `authenticatedPage`, etc.
7. **API client is generated** - don't edit manually
8. **Consult AGENTS.md** for comprehensive details

When in doubt, refer to `AGENTS.md` for complete guidance.
