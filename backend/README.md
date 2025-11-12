# Inkweld Backend (Hono)

This is the new Hono-based backend for Inkweld, designed to be easier to deploy and not tied to any specific cloud provider.

## Features

- Built with [Hono](https://hono.dev/) - A lightweight, fast web framework
- Runs on Bun runtime (also compatible with Node.js, Deno, Cloudflare Workers)
- TypeORM for database operations (PostgreSQL/SQLite)
- Session-based authentication with TypeORM session store
- Zod for request validation
- WebSocket support for real-time collaboration (Yjs)
- LevelDB for per-project document storage

## Getting Started

### Prerequisites

- Bun 1.3.1 or higher
- PostgreSQL (or SQLite for development)

### Installation

```bash
cd backend
bun install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:
- `PORT` - Server port (default: 8333)
- `DB_TYPE` - Database type (`postgres` or `sqlite`)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` - Database connection
- `SESSION_SECRET` - Secret key for session encryption
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### Development

```bash
bun run dev
```

This starts the server with hot reload on port 8333.

### Production Build

```bash
bun run build
bun start
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (env, database)
│   ├── entities/        # TypeORM entities (User, Project, Session, DocumentSnapshot)
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

## Differences from NestJS Version

1. **No Decorators**: Uses standard TypeScript/JavaScript instead of decorators
2. **Simpler Middleware**: Hono's middleware system is more straightforward
3. **Validation**: Uses Zod instead of class-validator
4. **Deployment**: Can deploy to multiple platforms (Cloudflare Workers, Vercel, AWS Lambda, etc.)
5. **Performance**: Lighter and faster than NestJS

## Migration Status

### ✅ Fully Implemented
- Complete project structure
- Database configuration (TypeORM with PostgreSQL/SQLite)
- Session management with TypeORM store
- Authentication (login, logout, session-based)
- User management (register, search, profile, avatars)
- Project CRUD operations (create, read, update, delete)
- Document snapshots (create, list, get, delete)
- Image upload and processing (project covers, user avatars)
- File storage service (per-project and user files)
- CSRF protection
- WebSocket support for Yjs collaboration
- LevelDB persistence for documents
- Health check and config endpoints
- Request validation with Zod
- Error handling middleware
- CORS and security headers

### Features Complete
All core functionality from the NestJS backend has been ported and is production-ready.

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
