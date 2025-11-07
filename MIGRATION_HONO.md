# Migration Guide: NestJS to Hono Backend

## Overview

This document provides guidance for migrating from the NestJS backend (`server/`) to the new Hono backend (`backend/`).

## Why Migrate?

The NestJS backend has proven difficult to deploy, particularly to platforms like Cloudflare Workers. The new Hono backend offers:

- **Easier Deployment**: Works on multiple platforms (Cloudflare Workers, Vercel, AWS Lambda, traditional servers)
- **Lighter Weight**: Smaller bundle size and faster startup
- **Simpler Code**: No decorators, more straightforward middleware
- **Better DX**: Faster hot reload and development experience
- **Platform Agnostic**: Not tied to any specific cloud provider

## Architecture Comparison

### NestJS Backend (`server/`)
- Framework: NestJS 10
- Runtime: Bun
- Validation: class-validator
- DI: Decorators
- Routing: Controller decorators
- Deployment: Difficult (requires custom build configs)

### Hono Backend (`backend/`)
- Framework: Hono 4
- Runtime: Bun (also Node.js, Deno, Cloudflare Workers)
- Validation: Zod
- DI: Function composition
- Routing: Functional API
- Deployment: Easy (multiple platforms)

## Quick Start with New Backend

### 1. Install Dependencies

```bash
npm run install-backend
# or
cd backend && bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env` in the root directory (already exists):

```bash
# .env
PORT=8333
NODE_ENV=development
DB_TYPE=sqlite
SESSION_SECRET=your-secret-key
ALLOWED_ORIGINS=http://localhost:4200
USER_APPROVAL_REQUIRED=false
GITHUB_ENABLED=false
```

### 3. Start Development Server

```bash
npm run dev:backend
# or
cd backend && bun run dev
```

The server will start on `http://localhost:8333`

### 4. Test with Frontend

```bash
npm run dev:with-new-backend
```

This starts both the new backend and frontend concurrently.

## Feature Parity Status

### ✅ Implemented
- Health check endpoints
- Config endpoints
- Basic authentication (login/logout)
- User management (register, search)
- Session management with TypeORM
- Database support (PostgreSQL/SQLite)
- CORS and security middleware
- Request validation (Zod)

### 🚧 In Progress
- Complete project CRUD operations
- OAuth (GitHub) integration
- Avatar upload/management

### 📝 TODO
- Document/Element management
- Yjs WebSocket collaboration
- Image processing
- MCP (Model Context Protocol)
- E-book export (EPUB)
- Worldbuilding/Schema services
- Document snapshots
- File storage
- Lint service

## API Endpoints Comparison

### Health Checks
```
NestJS:  GET /api/health
Hono:    GET /api/health        ✅ Implemented
Hono:    GET /api/health/ready  ✅ Implemented
```

### Authentication
```
NestJS:  POST /api/v1/auth/login
Hono:    POST /api/auth/login         ✅ Implemented

NestJS:  POST /api/v1/auth/logout
Hono:    POST /api/auth/logout        ✅ Implemented

NestJS:  GET /api/v1/auth/providers
Hono:    GET /api/auth/providers      ✅ Implemented
```

### Users
```
NestJS:  GET /api/v1/users/me
Hono:    GET /api/user/me             ✅ Implemented

NestJS:  POST /api/v1/users/register
Hono:    POST /api/user/register      ✅ Implemented

NestJS:  GET /api/v1/users
Hono:    GET /api/user                ✅ Implemented

NestJS:  GET /api/v1/users/search
Hono:    GET /api/user/search         ✅ Implemented
```

### Projects
```
NestJS:  GET /api/v1/projects
Hono:    GET /api/projects             ✅ Implemented (read-only)

NestJS:  GET /api/v1/projects/:id
Hono:    GET /api/projects/:id         ✅ Implemented (read-only)

NestJS:  POST /api/v1/projects
Hono:    POST /api/projects            📝 TODO

NestJS:  PUT /api/v1/projects/:id
Hono:    PUT /api/projects/:id         📝 TODO

NestJS:  DELETE /api/v1/projects/:id
Hono:    DELETE /api/projects/:id      📝 TODO
```

## Code Migration Examples

### Request Validation

**NestJS (class-validator):**
```typescript
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@Post('login')
async login(@Body() dto: LoginDto) {
  // ...
}
```

**Hono (Zod):**
```typescript
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

app.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  // ...
});
```

### Dependency Injection

**NestJS:**
```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}
}
```

**Hono:**
```typescript
import { getDataSource } from '../config/database';

export function createUserService() {
  const dataSource = getDataSource();
  const userRepo = dataSource.getRepository(User);
  
  return {
    async findUser(id: string) {
      return userRepo.findOne({ where: { id } });
    }
  };
}
```

### Middleware

**NestJS:**
```typescript
@UseGuards(SessionAuthGuard)
@Get('me')
async getMe(@Request() req) {
  return req.user;
}
```

**Hono:**
```typescript
import { requireAuth } from '../middleware/auth';

app.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json(user);
});
```

## Testing

### Running Tests

```bash
npm run test:backend
# or
cd backend && bun test
```

### Writing Tests

**Example Test:**
```typescript
import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';

describe('Health Check', () => {
  it('should return 200', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});
```

## Deployment

### Development
```bash
bun run dev
```

### Production (Traditional Server)
```bash
bun run build
bun start
```

### Cloudflare Workers
```bash
# Coming soon
wrangler deploy
```

### Docker
```bash
# Coming soon
docker build -t inkweld-backend .
docker run -p 8333:8333 inkweld-backend
```

## Troubleshooting

### Database Connection Issues

If you see `ECONNREFUSED` errors:
- Check that `DB_TYPE=sqlite` in `.env` (for development)
- Or ensure PostgreSQL is running if using `DB_TYPE=postgres`

### Session Issues

If sessions aren't working:
- Ensure `SESSION_SECRET` is set in `.env`
- Check that the database is initialized
- Verify CORS settings include credentials

### Port Conflicts

If port 8333 is in use:
- Change `PORT=8334` (or another port) in `.env`
- Update frontend proxy config to match

## Contributing

When adding new features to the Hono backend:

1. Follow existing patterns (see `src/routes/` for examples)
2. Use Zod for validation
3. Use TypeORM for database operations
4. Add tests for new endpoints
5. Update this migration guide

## Timeline

- **Phase 1** (Current): Core features (auth, users, basic projects)
- **Phase 2**: Full project management, documents, elements
- **Phase 3**: Real-time collaboration (Yjs WebSocket)
- **Phase 4**: Advanced features (MCP, export, worldbuilding)
- **Phase 5**: Deprecate NestJS backend

## Questions?

For issues or questions about the new backend:
1. Check the [README](backend/README.md)
2. Review existing code in `backend/src/`
3. Ask in discussions or open an issue

## Summary

The new Hono backend offers a simpler, more deployable architecture while maintaining compatibility with existing TypeORM entities and database schemas. The migration is incremental, allowing both backends to coexist during development.
