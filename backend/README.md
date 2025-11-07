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
│   ├── entities/        # TypeORM entities (User, Project, Session)
│   ├── middleware/      # Middleware (auth, session, error handling)
│   ├── routes/          # API routes
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── project.routes.ts
│   │   ├── health.routes.ts
│   │   └── config.routes.ts
│   └── index.ts         # Application entry point
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
- `GET /api/projects/:id` - Get single project
- `POST /api/projects` - Create project (TODO)
- `PUT /api/projects/:id` - Update project (TODO)
- `DELETE /api/projects/:id` - Delete project (TODO)

## Differences from NestJS Version

1. **No Decorators**: Uses standard TypeScript/JavaScript instead of decorators
2. **Simpler Middleware**: Hono's middleware system is more straightforward
3. **Validation**: Uses Zod instead of class-validator
4. **Deployment**: Can deploy to multiple platforms (Cloudflare Workers, Vercel, AWS Lambda, etc.)
5. **Performance**: Lighter and faster than NestJS

## Migration Status

### ✅ Completed
- Basic project structure
- Database configuration (TypeORM)
- Session management
- Authentication endpoints (login, logout)
- User endpoints (basic CRUD)
- Health check endpoints
- Configuration endpoints

### 🚧 In Progress
- Complete project management endpoints
- Document/Element management
- WebSocket for Yjs collaboration
- Image upload/handling
- MCP (Model Context Protocol) integration
- OAuth (GitHub) implementation

### 📝 TODO
- E-book export (EPUB)
- Worldbuilding/Schema services
- Document snapshots
- File storage
- Lint service integration
- Complete test coverage

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

### Cloudflare Workers

```bash
# Deploy to Cloudflare Workers
wrangler deploy
```

### Docker

```bash
docker build -t inkweld-backend .
docker run -p 8333:8333 inkweld-backend
```

### Traditional Servers

The backend runs on Bun by default but can also run on Node.js:

```bash
node --import tsx src/index.ts
```

## License

MIT
