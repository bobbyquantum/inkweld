# AI Agent Instructions for Inkweld

This document provides guidance for AI coding assistants (Copilot, Cline, Windsurf, Cascade, etc.) working on the Inkweld project.

---

## Project Overview

**Inkweld** is a collaborative creative writing platform built with:

- **Frontend**: Angular 20 (standalone components, modern control flow)
- **Backend**: NestJS 10 running on Bun
- **Database**: SQLite/D1 (Drizzle ORM) + LevelDB (per-project document storage)
- **Real-time**: Yjs + WebSocket for collaborative editing
- **Testing**: Jest (unit) + Playwright (e2e)

---

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

---

## Core Development Rules

### 1. Code Quality & Testing

- **Test Coverage Required**: Before completing any code change, ensure test coverage exists
- **All Tests Must Pass**: Run tests before submitting changes
- **Test Frameworks**:
  - Frontend: Jest (unit), Playwright (e2e) - **USE `npm test` NOT `bun test`**
  - Backend: Jest - uses Bun runtime
  - **Never use Jasmine** - this project uses Vitest exclusively
- **CRITICAL**: Always run frontend tests with `npm test` - Bun's test runner is incompatible with Angular tests

### 2. Linting & Formatting

- **Never disable lint rules** without explicit user approval
- If a lint rule needs disabling, ask the user first and explain why
- **Prefer fixing the issue** over disabling the rule
- Document any approved lint rule exceptions with clear comments
- Run `npm run lint:fix` to auto-fix issues before committing

### 3. Documentation

- **DO NOT create summary markdown files** (e.g., FIXES.md, STATUS.md, SUMMARY.md) unless explicitly requested
- Provide summaries in chat responses only
- Update existing documentation when making significant changes
- Keep AGENTS.md, README files, and code comments up to date

---

## Frontend Architecture (Angular 20)

### Technology Stack

- **Framework**: Angular 20 with standalone components
- **Dependency Injection**: Use `inject()` syntax, **NOT constructor injection**
- **Control Flow**: Use `@if`, `@for`, `@switch` directives (not `*ngIf`, `*ngFor`, `*ngSwitch`)
- **Modules**: Everything is standalone - no NgModules
- **State**: Service-based with RxJS
- **Testing**: Jest for unit tests, Playwright for e2e
- **Package Manager**: npm (dev server runs on Node.js)

### Angular Control Flow Guidelines

- Use `@if`/`@else` for conditionals (optionally assigning results with `as`)
- Use `@for` with `track` (prefer unique IDs like `item.id`, avoid identity)
- Use `@empty` for empty states in `@for` loops
- Leverage contextual variables: `$index`, `$count`, `$first`, `$last`, etc.
- Use `@switch`/`@case` with strict equality (`===`)
- **Replace all legacy** `*ngIf`, `*ngFor`, `*ngSwitch` directives

### Directory Structure

```
src/app/
├── components/      # Shared UI components
├── pages/           # Top-level routed pages
├── dialogs/         # Dialog components
├── services/        # Application services
├── guards/          # Route guards
├── interceptors/    # HTTP interceptors
├── models/          # TypeScript interfaces
├── pipes/           # Custom pipes
├── config/          # App-wide configuration
└── utils/           # Utility functions
```

### Frontend Best Practices

- Always use `inject()` for dependency injection
- Keep components focused and composable
- Use signals for reactive state when appropriate
- Maintain strict typing - avoid `any`
- Use alias imports (`@components`, `@services`, etc.)
- Follow existing patterns for consistency

---

## Backend Architecture (NestJS 10)

### Technology Stack

- **Runtime**: Bun (NOT Node.js)
- **Framework**: Hono (lightweight, runs on Bun and Cloudflare Workers)
- **Database**: Drizzle ORM with SQLite/D1 + LevelDB (Yjs documents)
- **Auth**: Session-based authentication with signed cookies
- **Testing**: Jest
- **Package Manager**: Bun

### Important Backend Rules

- **Run on Bun**: Use `bun` commands, not `npm` or `node`
- **Type Imports**: Import Request/Response types using `import type`, not regular import
- **Per-Project LevelDB**: Each project has its own LevelDB instance for document storage
- **Session Management**: Uses signed cookies for session authentication

### Directory Structure

```
src/
├── auth/            # Authentication module
├── user/            # User management
├── project/         # Project & document management
├── mcp/             # Model Context Protocol (AI integration)
├── common/          # Shared utilities
└── config/          # Configuration
```

### Backend Best Practices

- Follow Hono middleware patterns
- Use OpenAPI/Zod for request/response validation
- Keep routes focused and well-separated
- Handle errors gracefully with proper HTTP status codes
- Use Drizzle ORM best practices for database operations

---

## Testing Guidelines

### Unit Tests (Jest)

- **Location**: `*.spec.ts` files next to the code
- **Coverage Thresholds** (Frontend):
  - Statements: 80%
  - Functions: 80%
  - Lines: 80%
  - Branches: 60%
- **Run**: `npm test` (frontend) or `bun test` (backend)
- Use `jest-mock-extended` for deep mocking
- Use `@ngneat/spectator` for Angular component testing

### E2E Tests (Playwright - Frontend)

- **Location**: `frontend/e2e/`
- **Run**: `npm run e2e` or `bun run e2e`
- **CI Mode**: `npm run e2e:ci`
- Use test data IDs (`data-testid`) for stable selectors
- Avoid fragile selectors based on text or classes
- Mock API responses using the mock-api framework in `e2e/mock-api/`
- **Key Files**:
  - `e2e/fixtures.ts` - Test fixtures (authenticatedPage, anonymousPage)
  - `e2e/mock-api/` - Mock API handlers
  - `e2e/BEST_PRACTICES.md` - Detailed e2e testing guidelines

### Testing Best Practices

- Write tests before or alongside implementation
- Test behavior, not implementation details
- Keep tests isolated and independent
- Use descriptive test names
- Mock external dependencies appropriately
- Ensure tests are deterministic and don't rely on timing

---

## Development Workflow

### Getting Started

```bash
# Install dependencies
bun install

# Start development servers (both frontend & backend)
npm start

# Run tests
npm test
```

### Common Commands

```bash
# Frontend
cd frontend
npm start              # Dev server (localhost:4200)
npm test               # Run Jest tests
npm run e2e            # Run Playwright tests
npm run lint           # Run linter
npm run lint:fix       # Auto-fix lint issues

# Backend
cd server
bun run start:dev      # Dev server (localhost:8333)
bun test               # Run tests
bun run generate:openapi  # Generate OpenAPI spec
```

### Code Style

- Use Prettier for formatting (configured in `.prettierrc`)
- Follow ESLint rules (configured in `eslint.config.*`)
- Use meaningful variable and function names
- Keep functions small and focused
- Comment complex logic
- Use TypeScript strict mode

---

## Common Patterns

### Frontend Service Injection

```typescript
// ✅ Correct - use inject()
export class MyComponent {
  private myService = inject(MyService);
}

// ❌ Wrong - don't use constructor injection
export class MyComponent {
  constructor(private myService: MyService) {}
}
```

### Angular Control Flow

```typescript
// ✅ Correct - new control flow
@if (condition) {
  <div>Content</div>
} @else {
  <div>Alternative</div>
}

@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <div>No items</div>
}

// ❌ Wrong - legacy syntax
<div *ngIf="condition">Content</div>
<div *ngFor="let item of items">{{ item.name }}</div>
```

### Backend Type Imports

```typescript
// ✅ Correct - use import type
import type { Request, Response } from 'express';

// ❌ Wrong - regular import
import { Request, Response } from 'express';
```

---

## Project-Specific Context

### Real-time Collaboration

- Uses Yjs for CRDT-based collaborative editing
- WebSocket connections for real-time sync
- LevelDB stores per-project document state
- Offline editing capability with automatic sync

### Authentication

- Session-based auth with httpOnly cookies
- CSRF protection on all state-changing requests
- GitHub OAuth support (optional)
- User approval system (configurable)

### File Structure

- Projects contain documents and elements
- Documents use ProseMirror for rich text editing
- Elements are hierarchical (folders, files, etc.)
- Files stored in project-specific directories

### API Client

- Auto-generated from OpenAPI specification
- Located in `frontend/src/api-client/`
- **Regenerate**: First generate OpenAPI spec, then Angular client

**Important - OpenAPI Generation**: The `generate:openapi` script doesn't terminate automatically. Use a 30-second timeout:

```powershell
# PowerShell (Windows)
$job = Start-Job -ScriptBlock { Set-Location server; bun run generate:openapi 2>&1 }
$null = Wait-Job $job -Timeout 30
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job

# Then generate Angular client
cd server && bun run generate:angular-client
```

**Note**: OpenAPI generation runs in "preview mode" and doesn't need database connectivity. It will succeed even if database connection fails afterward (that's expected).

---

## Debugging Tips

### Frontend Debugging

- Use Angular DevTools browser extension
- Check browser console for errors
- Use `ng.probe()` in console for component inspection
- Check Network tab for API call failures
- Review Playwright traces for e2e test failures: `npx playwright show-trace <trace-file>`

### Backend Debugging

- Use VS Code debugger (configured in `.vscode/launch.json`)
- Check server logs for stack traces
- Verify database connections
- Test API endpoints with Swagger UI at `/api`
- Use `console.log()` or proper logging service

---

## When Things Go Wrong

### Build Failures

- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear Angular cache: `rm -rf .angular`
- Check for TypeScript errors: `npx tsc --noEmit`
- Verify all dependencies are installed

### Test Failures

- Run single test: `npm test -- <test-file-pattern>`
- Check for async timing issues
- Verify mock setup is correct
- Ensure tests are isolated
- Check Playwright trace files for e2e failures

### Lint Errors

- Run auto-fix: `npm run lint:fix`
- Check ESLint configuration
- Verify Prettier formatting
- Review specific error messages

---

## Contributing

### Before Submitting Changes

1. ✅ All tests pass (`npm test` in both frontend and backend)
2. ✅ Linting passes (`npm run lint`)
3. ✅ Code is properly formatted
4. ✅ New features have test coverage
5. ✅ Documentation is updated if needed
6. ✅ No console errors or warnings

### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Write clear commit messages
- Reference related issues
- Include tests for new functionality
- Update documentation as needed

---

## Resources

- **Getting Started**: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)
- **CI/CD Pipeline**: [docs/CI_CD.md](docs/CI_CD.md)
- **E2E Testing**: [frontend/e2e/BEST_PRACTICES.md](frontend/e2e/BEST_PRACTICES.md)
- **Admin CLI**: [backend/ADMIN_CLI.md](backend/ADMIN_CLI.md)
- **API Documentation**: <http://localhost:8333/api> (served by the Hono backend)
- **OpenAPI Spec**: [backend/openapi.json](backend/openapi.json)

---

## Questions or Issues?

If you encounter patterns, issues, or edge cases not covered here, suggest adding them to this document to help future AI agents and contributors.

**Remember**: The goal is to write maintainable, tested, well-documented code that follows the project's established patterns and conventions.
