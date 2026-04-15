# Inkweld Backend (Hono)

This is the new Hono-based backend for Inkweld, designed to be easier to deploy and not tied to any specific cloud provider.

## Features

- Built with [Hono](https://hono.dev/) - A lightweight, fast web framework
- Runs on Bun runtime (also compatible with Node.js, Deno, Cloudflare Workers)
- Drizzle ORM for database operations (SQLite/D1)
- Session-based authentication with signed cookies
- Zod for request validation
- WebSocket support for real-time collaboration (Yjs)
- LevelDB for per-project document storage

## Getting Started

### Prerequisites

- Bun 1.3.11 or higher
- SQLite (default, automatic) or Cloudflare D1

### Installation

```bash
cd backend
bun install
```

### Configuration

Copy `.env.example` to `.env` at the **project root** (not in backend/):

```bash
# From project root
cp .env.example .env
```

The backend automatically loads `.env` from the project root.

Key environment variables:
- `PORT` - Server port (default: 8333)
- `DB_TYPE` - Database type (`sqlite` or `d1`)
- `SESSION_SECRET` - Secret key for session encryption
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### Development

```bash
bun run dev
```

This starts the server with hot reload on port 8333.

### Production Build

```bash
# Standard builds
bun run build        # Build for Bun runtime
bun run build:node   # Build for Node.js runtime

# Binary builds (standalone executables)
bun run build:binary       # Backend-only binary
bun run build:binary:full  # Full binary with embedded frontend (recommended)
```

#### Full Binary Build

The `build:binary:full` command creates a single self-contained executable (~68MB) that includes:
- Bun runtime
- Complete backend API server
- Full Angular frontend application
- All static assets (images, fonts, CSS, JS)
- Interactive setup wizard for first-time users

**Benefits:**
- ✅ Single file deployment
- ✅ No runtime dependencies required
- ✅ Faster startup and asset serving
- ✅ Simplified distribution
- ✅ Guided first-time setup

**First-Time Usage:**

When you run the binary for the first time without a configuration file, it will launch an interactive setup wizard:

```bash
./dist/inkweld

# The wizard will ask you:
# - Port to run on (default: 8333)
# - Database location
# - Whether to require user approval
# - Optional OpenAI API key
# - Where to save the configuration
```

**Configuration Locations:**

The binary automatically checks for `.env` files in this order:
1. Current directory (`./.env`)
2. User config directory:
   - **Linux/Mac**: `~/.inkweld/.env`
   - **Windows**: `%APPDATA%\Inkweld\.env`

**Usage:**
```bash
# First run - setup wizard
./dist/inkweld

# Subsequent runs - uses saved configuration
./dist/inkweld

# Override with environment variables
DB_PATH=./data/inkweld.db PORT=8333 ./dist/inkweld

# Non-interactive (skip setup wizard)
DB_PATH=:memory: ./dist/inkweld
```

The binary automatically detects embedded frontend assets and serves them at the root path. Visit `http://localhost:8333` in your browser to access the application. No need to set `FRONTEND_DIST` environment variable.

#### Standard Runtime

For non-binary deployments:
```bash
bun run build
bun start
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (env, route registration)
│   ├── db/              # Drizzle schema and database setup
│   ├── middleware/      # Middleware (auth, session, CSRF, error handling)
│   ├── routes/          # API routes (auth, user, project, document,
│   │                    # element, image, snapshot, admin, ai-*, mcp,
│   │                    # collaboration, comment, media, share,
│   │                    # announcement, oauth, github-auth,
│   │                    # password-reset, published-file, etc.)
│   ├── schemas/         # Zod/OpenAPI request/response schemas
│   ├── services/        # Business logic services
│   ├── bun-app.ts       # Bun runtime entry point
│   ├── node-app.ts      # Node.js runtime entry point
│   └── worker-app.ts    # Cloudflare Workers runtime entry point
├── test/                # Test suite
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

All API routes are mounted under `/api/v1/`. The canonical reference is the
auto-generated OpenAPI spec at [`backend/openapi.json`](./openapi.json) and the
interactive API docs on the documentation site.

High-level groups:

- **Health & config** — `/api/v1/health`, `/api/v1/config`
- **Auth** — `/api/v1/auth/*` (login/logout, GitHub OAuth, password reset)
- **Users** — `/api/v1/users/*` (profile, search, avatars, registration)
- **Projects** — `/api/v1/projects/*` (projects, documents, elements, images,
  published files)
- **Snapshots** — `/api/v1/snapshots/*`
- **Collaboration** — `/api/v1/collaboration/*`, `/api/v1/comments/*`,
  `/api/v1/share/*`
- **Media** — `/api/v1/media/*`
- **AI** — `/api/v1/ai/lint`, `/api/v1/ai/image`, `/api/v1/ai/text`,
  `/api/v1/ai/providers`, `/api/v1/ai/mcp`, `/api/v1/ai/image-profiles`
- **MCP keys** — `/api/v1/mcp-keys/*`
- **Admin** — `/api/v1/admin/*` (users, stats, config, announcements,
  image profiles, image audits, email)
- **Announcements** — `/api/v1/announcements/*`
- **OAuth metadata** — `/.well-known/*` (mounted at root for MCP OAuth 2.1)

CSRF protection is applied via middleware (origin-based), not a token endpoint.

## Design Choices

This Hono backend was designed with the following principles:

1. **No Decorators**: Uses standard TypeScript/JavaScript instead of decorator-based patterns
2. **Simple Middleware**: Hono's middleware system is lightweight and straightforward
3. **Validation**: Uses Zod for schema validation
4. **Multi-Platform**: Can deploy to Bun, Node.js, Cloudflare Workers, Vercel, AWS Lambda, etc.
5. **Performance**: Lightweight and fast

## Implemented Features

- Database configuration (Drizzle ORM with SQLite/D1)
- Session management with signed cookies
- Authentication (login, logout, session-based, GitHub OAuth, password reset)
- User management (register, search, profile, avatars)
- Project CRUD and sharing (collaborators, invitations, share links)
- Document CRUD, element hierarchy, document snapshots
- Worldbuilding elements with schemas and templates
- Inline comments and threads
- Image upload/processing (project covers, user avatars)
- Per-project media library with server sync
- EPUB, PDF (Typst), Markdown, and HTML export; publish plans
- Project archive import/export
- CSRF protection (origin-based middleware)
- WebSocket support for Yjs collaboration (Bun runtime + Durable Objects
  on Workers)
- LevelDB persistence for documents (Bun/Node)
- Health check and config endpoints
- Request validation with Zod
- Error handling middleware
- CORS and security headers
- AI text/lint features with provider abstraction (OpenAI, OpenRouter,
  Fal.ai, Stable Diffusion, Workers AI)
- AI image generation with admin-configured model profiles
- MCP (Model Context Protocol) endpoint with OAuth 2.1 + PKCE
- Admin dashboard APIs (stats, config, announcements, image audits, email)

Refer to the root [`README.md`](../README.md#feature-roadmap) for the
project-wide feature roadmap.

## Testing

```bash
bun test
```

## Linting

```bash
bun run lint
bun run lint:fix
```

## Deployment

### Multiple Runtime Support

This backend supports three different runtime environments:

1. **Bun** (recommended for local dev) - Uses native `bun:sqlite`
2. **Node.js** (traditional hosting) - Uses `better-sqlite3`
3. **Cloudflare Workers** (serverless) - Uses D1 database

#### Local Development

```bash
# Bun (with Yjs WebSocket support)
bun run dev

# Node.js (without Yjs)
bun run dev:node

# Cloudflare Workers (local)
bun run dev:worker
```

#### Cloudflare Workers Deployment

1. **Setup Configuration**:
   ```bash
   # Copy example configuration
   cp wrangler.toml.example wrangler.toml
   ```

2. **Create D1 Databases**:
   ```bash
   # Dev database
   npx wrangler d1 create inkweld_dev
   
   # Production database
   npx wrangler d1 create inkweld_prod
   ```

3. **Update wrangler.toml**:
   - Add the database IDs from step 2 to the `[env.dev.d1_databases]` and `[env.production.d1_databases]` sections
   - Uncomment the D1 binding configuration

4. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

5. **Deploy**:
   ```bash
   # Deploy to dev environment
   bun run deploy:dev
   
   # Deploy to production environment
   bun run deploy:prod
   ```

6. **View Logs**:
   ```bash
   bun run logs:dev
   bun run logs:prod
   ```

#### Docker Deployment

```bash
docker build -t inkweld-backend .
docker run -p 8333:8333 inkweld-backend
```

#### Traditional Servers (Node.js)

```bash
# Build for Node.js
bun run build:node

# Run with Node.js
bun run start:node
```

## License

MIT
