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

- Bun 1.3.6 or higher
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

The binary automatically detects embedded frontend assets and serves them. Visit `http://localhost:8333` in your browser to access the application.

# With custom configuration
DB_PATH=./data/inkweld.db PORT=8333 ./dist/inkweld-backend
```

The binary automatically detects embedded frontend assets and serves them at the root path. No need to set `FRONTEND_DIST` environment variable.

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
│   ├── config/          # Configuration (env)
│   ├── db/              # Drizzle schema and database setup
│   ├── middleware/      # Middleware (auth, session, CSRF, error handling)
│   ├── routes/          # API routes
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── project.routes.ts
│   │   ├── image.routes.ts
│   │   ├── snapshot.routes.ts
│   │   ├── csrf.routes.ts
│   │   ├── health.routes.ts
│   │   └── config.routes.ts
│   ├── services/        # Business logic services
│   │   ├── file-storage.service.ts
│   │   ├── image.service.ts
│   │   └── yjs.service.ts
│   └── index.ts         # Application entry point
├── test/                # Test suite
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

### Health
- `GET /api/health` - Health check
- `GET /api/health/ready` - Readiness check

### Configuration
- `GET /api/config` - Get public configuration

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `GET /api/auth/providers` - Get available OAuth providers
- `GET /api/auth/authorization/github` - Initiate GitHub OAuth
- `GET /api/auth/code/github` - GitHub OAuth callback

### Users
- `GET /api/user/me` - Get current user profile
- `GET /api/user` - Get paginated users
- `GET /api/user/search` - Search users
- `POST /api/user/register` - Register new user
- `GET /api/user/check-username` - Check username availability

### Projects
- `GET /api/projects` - Get all projects for current user
- `GET /api/projects/:username/:slug` - Get single project
- `POST /api/projects` - Create project
- `PUT /api/projects/:username/:slug` - Update project
- `DELETE /api/projects/:username/:slug` - Delete project

### Images
- `POST /api/images/:username/:slug/cover` - Upload project cover
- `GET /api/images/:username/:slug/cover` - Get project cover
- `DELETE /api/images/:username/:slug/cover` - Delete project cover

### Snapshots
- `GET /api/snapshots/:username/:slug` - List snapshots for project
- `GET /api/snapshots/:username/:slug/:id` - Get single snapshot
- `POST /api/snapshots/:username/:slug` - Create snapshot
- `DELETE /api/snapshots/:username/:slug/:id` - Delete snapshot

### CSRF
- `GET /api/csrf/token` - Get CSRF token for protected requests

## Design Choices

This Hono backend was designed with the following principles:

1. **No Decorators**: Uses standard TypeScript/JavaScript instead of decorator-based patterns
2. **Simple Middleware**: Hono's middleware system is lightweight and straightforward
3. **Validation**: Uses Zod for schema validation
4. **Multi-Platform**: Can deploy to Bun, Node.js, Cloudflare Workers, Vercel, AWS Lambda, etc.
5. **Performance**: Lightweight and fast

## Migration Status

### ✅ Fully Implemented
- Complete project structure
- Database configuration (Drizzle ORM with SQLite/D1)
- Session management with signed cookies
- Authentication (login, logout, session-based, GitHub OAuth)
- User management (register, search, profile, avatars)
- Project CRUD operations (create, read, update, delete)
- Document CRUD operations (create, read, update, delete)
- Element hierarchy management (folders, files, worldbuilding items)
- Document snapshots (create, list, get, delete)
- Image upload and processing (project covers, user avatars)
- File storage service (per-project and user files)
- EPUB export functionality
- CSRF protection
- WebSocket support for Yjs collaboration (Bun runtime)
- LevelDB persistence for documents
- Health check and config endpoints
- Request validation with Zod
- Error handling middleware
- CORS and security headers
- AI Linting (OpenAI integration)
- AI Image generation (OpenAI GPT Image)
- MCP (Model Context Protocol) integration

### ❌ Not Yet Implemented (Critical Features)

The following features have **NOT** been implemented yet:

#### **Worldbuilding Schema System** (HIGH PRIORITY)
- **Missing**: Schema Service for managing worldbuilding templates
- **Missing**: Schema Controller/Routes for template management API
- **Impact**: Users cannot initialize or manage worldbuilding templates (character, location, etc.)
- **API Endpoints Needed**:
  - `POST /api/v1/projects/:username/:slug/schemas/initialize-defaults`
  - Schema library CRUD operations
  - Custom template creation/editing

#### **Worldbuilding Service** (HIGH PRIORITY)
- **Missing**: Service to initialize worldbuilding elements with schema snapshots
- **Missing**: Schema embedding into Yjs documents
- **Impact**: Worldbuilding elements lack structured templates and default data

**Note**: The frontend expects these APIs and the feature is advertised as a core capability. This is the most critical missing feature for production readiness.

### 🔶 Partially Implemented
- Archive import/export (basic structure exists, needs completion)
- Project renaming/slug changes (not yet supported)

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
