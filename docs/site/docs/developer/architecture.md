---
id: architecture
title: Architecture Overview
description: Technical architecture and design decisions in Inkweld.
sidebar_position: 1
---

## System Architecture

Inkweld is a monorepo application with distinct frontend and backend services:

```
┌─────────────────────────────────────────────────────┐
│                   Browser Client                    │
│  Angular 20 SPA + IndexedDB (offline storage)      │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP + WebSocket
┌─────────────────┴───────────────────────────────────┐
│               Backend Server (Bun)                  │
│         Hono API + WebSocket Handler                │
├─────────────────┬───────────────────────────────────┤
│   TypeORM/DB    │         Yjs + LevelDB            │
│   (Users/Meta)  │      (Document CRDTs)            │
└─────────────────┴───────────────────────────────────┘
```

## Frontend (Angular 20)

### Technology Stack

- **Framework**: Angular 20 with standalone components
- **State Management**: Service-based with RxJS
- **Offline Storage**: IndexedDB via y-indexeddb
- **Real-Time**: Yjs + y-websocket provider
- **Editor**: ProseMirror with y-prosemirror binding
- **Build**: Angular CLI + Vite
- **Testing**: Jest (unit) + Playwright (e2e)

### Modern Angular Patterns

```typescript
// Dependency injection with inject()
export class MyComponent {
  private projectService = inject(ProjectService);
  private router = inject(Router);
}

// Modern control flow
@if (project) {
  <app-editor [project]="project" />
} @else {
  <app-loading />
}

@for (item of items; track item.id) {
  <app-item [data]="item" />
}
```

### Key Services

- **ProjectStateService** - Central project state management
- **UnifiedProjectService** - Hybrid online/offline operations
- **DocumentService** - Yjs document lifecycle
- **WorldbuildingService** - Template/schema system
- **AuthService** - Authentication and session management

## Backend (Bun + Hono)

### Technology Stack

- **Runtime**: Bun (JavaScript runtime built for speed)
- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL or SQLite via TypeORM
- **Document Storage**: LevelDB (per-project instances)
- **Real-Time**: Native WebSocket support
- **Testing**: Bun's built-in test runner

### API Architecture

```typescript
// Hono route example
app.get('/api/projects', authMiddleware, async (c) => {
  const user = c.get('user');
  const projects = await projectService.findByUser(user.id);
  return c.json(projects);
});

// WebSocket upgrade
app.get('/ws/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  return wsHandler.upgrade(c.req.raw, projectId);
});
```

### Key Modules

- **auth/** - Session-based authentication
- **routes/** - HTTP endpoints
- **services/** - Business logic layer
- **db/** - Database connection and TypeORM setup
- **durable-objects/** - (Cloudflare Workers deployment only)

## Real-Time Collaboration (Yjs)

### CRDT Technology

Yjs uses Conflict-free Replicated Data Types (CRDTs) to enable:

- **Concurrent editing** without conflicts
- **Eventual consistency** across all clients
- **Offline support** with automatic merging
- **Fine-grained updates** (character-level)

### Data Flow

```
User types → ProseMirror → y-prosemirror
                              ↓
                          Yjs document
                              ↓
            ┌─────────────────┴─────────────────┐
            ↓                                   ↓
     y-websocket                          y-indexeddb
    (to server)                       (local cache)
            ↓
    WebSocket server
            ↓
      y-leveldb
   (persistence)
```

### Per-Project Storage

Each project gets its own LevelDB instance:

```
data/
├── username1/
│   ├── project-slug/
│   │   └── leveldb/ (Yjs documents)
├── username2/
    └── another-project/
        └── leveldb/
```

Benefits:

- **Isolation** - Projects don't interfere
- **Scalability** - Independent read/write operations
- **Cleanup** - Easy to delete project data
- **Connection pooling** - Automatic idle connection management

## Database Schema

### TypeORM Entities

- **User** - Authentication and profile data
- **Project** - Project metadata and ownership
- **ProjectElement** - File/folder structure
- **WorldbuildingSchema** - Template definitions
- **Session** - Express session store

### Document Storage

- **Metadata** → PostgreSQL/SQLite (via TypeORM)
- **Document content** → LevelDB (via Yjs)
- **Offline cache** → IndexedDB (client-side)

## Authentication & Security

### Session-Based Auth

- **httpOnly cookies** for CSRF protection
- **Session store** backed by TypeORM
- **No JWT tokens** (intentional design choice)
- **Optional GitHub OAuth** (configurable)

### Security Measures

- **CORS** configuration via `ALLOWED_ORIGINS`
- **CSRF protection** on state-changing requests
- **Content Security Policy** headers
- **Rate limiting** (configurable)
- **User approval workflow** (optional)

## Deployment Targets

### Bun (Primary)

```bash
bun run dev          # Development
bun run build        # Production build
bun run start        # Production server
```

### Node.js (Compatible)

```bash
bun run build:node   # Transpile for Node
node dist/node-runner.js
```

### Cloudflare Workers (Experimental)

```bash
bun run build:worker
npx wrangler deploy
```

Requires:

- Durable Objects for WebSocket persistence
- D1 database binding
- R2 for file storage (optional)

### Docker (Recommended for Production)

```bash
docker build -t inkweld -f backend/Dockerfile .
docker run -p 8333:8333 -v inkweld_data:/data inkweld
```

Benefits:

- Includes both frontend and backend
- Automatic migrations on startup
- Volume mounting for persistence
- Health check endpoint

## Build Pipeline

### Development

```bash
npm start  # Runs both frontend and backend
```

Powered by:

- **Concurrently** to run multiple processes
- **Angular CLI** dev server (port 4200)
- **Bun** runtime (port 8333)

### Production

```bash
# Frontend
cd frontend
bun run build
bun run compress  # Optional

# Backend
cd backend
bun run build
```

Output:

- **frontend/dist/** - Angular production bundle
- **backend/dist/** - Bun-optimized backend code

### Docker Build

Multi-stage Dockerfile:

1. **Frontend build** stage (Node.js)
2. **Backend build** stage (Bun)
3. **Runtime** stage (minimal Bun image)
   - Copies frontend dist to static assets
   - Includes migrations for auto-run
   - Non-root user for security

## Testing Strategy

### Frontend Tests

```bash
npm test          # Jest unit tests
npm run e2e       # Playwright e2e tests
```

- **Unit tests** with @ngneat/spectator
- **E2E tests** with fixtures (authenticatedPage, etc.)
- **Mock API** handlers in `e2e/mock-api/`
- **Screenshot tests** for visual regression

### Backend Tests

```bash
bun test
```

- **Unit tests** for services and utilities
- **Integration tests** for API endpoints
- **Supertest** for HTTP assertions
- **In-memory SQLite** for test isolation

## API Documentation

### OpenAPI Specification

Generated from code annotations:

```bash
cd backend
bun run generate:openapi
```

Output: `backend/openapi.json`

### Client Generation

Auto-generate TypeScript client for frontend:

```bash
cd backend
bun run generate:angular-client
```

Output: `frontend/src/api-client/`

**Never edit generated files manually.**

## Code Quality

### Linting

- **ESLint** with TypeScript support
- **Prettier** for formatting
- **Shared config** across frontend/backend

### Pre-commit Hooks

Consider adding:

- Lint-staged for fast checks
- Husky for Git hooks
- Prettier format check

### CI/CD

GitHub Actions workflow:

1. **Lint** all code
2. **Test** frontend and backend
3. **Build** Docker image
4. **Publish** to GHCR (on main branch)

## Performance Considerations

### Frontend

- **Lazy loading** for routes
- **OnPush change detection** where appropriate
- **Virtual scrolling** for long lists (consider)
- **Service Worker** for offline support

### Backend

- **LevelDB connection pooling** with automatic cleanup
- **Database indexing** on foreign keys
- **Pagination** for large result sets
- **WebSocket connection limits** (configurable)

### Real-Time

- **Debounced updates** for UI refresh
- **Incremental sync** (only changed content)
- **Efficient CRDT** merging via Yjs
- **Binary encoding** over WebSocket

## Development Workflow

### Workspace Structure

```
inkweld/
├── frontend/          # Angular app
├── backend/           # Bun/Hono API
├── docs/
│   └── site/         # Docusaurus docs
├── assets/           # Demo covers, etc.
└── package.json      # Root scripts
```

### NPM Scripts (Root)

```bash
npm run install-all   # Install all dependencies
npm start            # Start dev servers
npm test             # Run all tests
npm run lint         # Lint all code
```

### Git Workflow

1. Create feature branch
2. Make changes + add tests
3. Run `npm test` and `npm run lint`
4. Open PR
5. CI validates
6. Merge to main

## Extensibility

### Custom Worldbuilding Templates

Define schemas in database:

```typescript
interface WorldbuildingSchema {
  name: string;
  tabs: SchemaTab[];
}

interface SchemaTab {
  title: string;
  fields: SchemaField[];
}
```

### Plugin System (Future)

Consider:

- Custom document types
- Export format plugins
- Theme customization
- Integration hooks (Discord, Slack)

## Next Steps

- Review [API documentation](/api)
- Read [deployment guide](../hosting/docker)
- Check the [user guide](../user-guide/projects)
- Explore the [features](../features)
