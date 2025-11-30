# Inkweld Development Container

A self-contained development environment for the Inkweld collaborative writing platform.

## What's Included

### Runtimes

- **Bun 1.3.3** - Backend runtime and package manager
- **Node.js 22 LTS** - Angular dev server and docs site

### Build Tools

- Python 3, Make, G++ - For native Node.js modules
- LevelDB development libraries
- libvips (Sharp image processing)
- SQLite3 CLI

### Pre-installed Global Tools

- Angular CLI 21
- TypeScript
- Wrangler (Cloudflare Workers CLI)
- Playwright browsers (Chromium, Firefox)

### VS Code Extensions

- Angular Language Service
- ESLint & Prettier
- Vitest Explorer
- Playwright Test
- Bun extension
- Docker tools
- SQLite Viewer
- GitLens & Git Graph

## Quick Start

1. **Open in VS Code** with the Dev Containers extension installed
2. Click "Reopen in Container" when prompted
3. Wait for the container to build and `npm run install-all` to complete
4. Start developing!

### Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or individually:
npm run dev:frontend  # Angular on http://localhost:4200
npm run dev:backend   # Hono/Bun on http://localhost:8333
npm run docs          # Docusaurus on http://localhost:3000
```

### Run Tests

```bash
# All tests
npm test

# Frontend unit tests (Vitest)
npm run test:frontend

# Backend unit tests (Bun test)
npm run test:backend

# E2E tests (Playwright)
npm run e2e
```

## Configuration

### Default Environment

The dev container sets up a SQLite-based development environment by default:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `DB_TYPE` | `sqlite` | Database type (sqlite/postgres) |
| `DB_PATH` | `/workspaces/inkweld/backend/data/dev.sqlite` | SQLite file path |
| `DATA_PATH` | `/workspaces/inkweld/backend/data/yjs` | Yjs document storage |
| `LOCAL_USERS_ENABLED` | `true` | Enable local auth |
| `USER_APPROVAL_REQUIRED` | `false` | Skip admin approval |

### Using PostgreSQL

For production-like testing with PostgreSQL:

1. Start the optional Postgres container:

   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d postgres
   ```

2. Update your environment:

   ```bash
   export DB_TYPE=postgres
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_USER=inkweld
   export DB_PASSWORD=inkweld_dev
   export DB_NAME=inkweld_dev
   ```

3. Access Adminer at <http://localhost:8080> for database management

## Ports

| Port | Service |
|------|---------|
| 4200 | Angular Frontend |
| 8333 | Hono/Bun Backend |
| 3000 | Docusaurus Docs |
| 5432 | PostgreSQL (optional) |
| 8080 | Adminer (optional) |

## Troubleshooting

### Native Module Build Failures

If you encounter issues with `better-sqlite3`, `leveldb`, or `sharp`:

```bash
# Rebuild native modules
cd backend
bun install --force
```

### Playwright Browser Issues

```bash
# Reinstall Playwright browsers
npx playwright install chromium firefox
```

### Bun Not Found

```bash
# Verify Bun installation
which bun
bun --version

# Reinstall if needed
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

## Updating the Dev Container

To rebuild after changes to `.devcontainer/`:

1. Open Command Palette (Ctrl+Shift+P)
2. Run "Dev Containers: Rebuild Container"
