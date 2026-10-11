# E2E Testing

This directory contains end-to-end tests for Inkweld, organized into the categories below:

## Test Categories

### 1. Local Tests (`e2e/local/`)

Tests that run in **pure local/offline mode** without any network access.

- **No Backend Required**: Tests run with the app in local mode
- **Network Blocked**: Any API request will **fail the test**
- **IndexedDB Storage**: All data stored locally
- **Parallel Execution**: Tests can run in parallel
- **Own Dev Server**: The config starts `npm start` on a free port (pin it with
  `PLAYWRIGHT_FRONTEND_PORT`); you do not need to start one yourself

```bash
npm run e2e:local        # Run local tests
npm run e2e:local:ui     # Run with UI
npm run e2e:local:debug  # Debug mode
npm run e2e:local:ci     # CI mode
```

### 2. Online Tests (`e2e/online/`)

Tests that run against the **real backend** with an in-memory database.

- **Real Backend**: Uses actual Bun server with SQLite in-memory
- **Full Integration**: Tests complete frontend-backend communication
- **Migration Tests**: Test offline → server workflows
- **Own Servers**: The config starts both the backend and the frontend on free
  ports (`PLAYWRIGHT_BACKEND_PORT` / `PLAYWRIGHT_FRONTEND_PORT` pin them)
- **Parallel Execution**: Config is `fullyParallel`; specs must not share
  mutable server state. A spec that changes a global setting starts its own
  backend through `common/isolated-backend.ts`

```bash
npm run e2e:online        # Run online tests
npm run e2e:online:ui     # Run with UI
npm run e2e:online:debug  # Debug mode
npm run e2e:online:ci     # CI mode
```

### 3. Screenshot Tests (`e2e/screenshots/`)

Tests that generate **promotional screenshots** for documentation.

- **Mock API**: Uses mock API handlers (no real backend)
- **Multiple Themes**: Captures light and dark mode variants
- **Multiple Viewports**: Desktop (1280x720) and mobile (375x667)
- **Output**: Screenshots saved to `docs/site/static/img/generated/`

```bash
npm run e2e:screenshots   # Generate all screenshots
```

### 4. MCP Tests (`e2e/mcp/`)

Tests for the **Model Context Protocol** server integration.

- **JSON-RPC**: Tests the MCP protocol over HTTP against a real backend
- **Inspector UI**: Tests MCP Inspector integration
- **Tool Discovery**: Verifies available MCP tools

```bash
npm run e2e:mcp           # Run MCP tests
```

### 5. Docker/Cloudflare Tests

Tests against containerized or deployed environments.

```bash
npm run e2e:docker        # Run against Docker container
npm run e2e:wrangler      # Run against wrangler dev
npm run e2e:cloudflare    # Run against deployed Cloudflare
```

## Running All Tests

```bash
# Run both local and online tests (recommended for CI)
npm run e2e

# CI mode (minimal output)
npm run e2e:ci
```

## Directory Structure

```
e2e/
├── common/                # Shared test utilities
│   ├── index.ts
│   ├── test-helpers.ts
│   ├── test-credentials.ts
│   ├── free-port.ts       # Free-port allocation for the configs
│   ├── isolated-backend.ts # Per-spec backend for global-setting tests
│   └── mock-llm-server.ts
├── local/                 # Local/offline mode tests (fixtures.ts + *.spec.ts)
├── online/                # Real backend tests (fixtures.ts + *.spec.ts, auth/)
├── docker/                # Global setup/teardown for the Docker suite
├── screenshots/           # Screenshot generation tests
│   ├── fixtures.ts        # Screenshot test fixtures
│   ├── mock-api/          # Mock API handlers
│   └── *-screenshots.spec.ts
├── mcp/                   # MCP protocol tests (fixtures.ts, mcp-setup.ts, mcp-*.spec.ts)
├── online-setup.ts        # Global setup for the online suite
└── wrangler-setup.ts      # Global setup for the wrangler suite (health check)
```

## Fixtures

### Local Fixtures (`e2e/local/fixtures.ts`)

| Fixture                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `localPage`            | Page in local mode with user configured, API requests blocked |
| `localPageWithProject` | Local page with a project pre-created                         |
| `localContext`         | Browser context for local mode (multi-page tests)             |

### Online Fixtures (`e2e/online/fixtures.ts`)

| Fixture                 | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `anonymousPage`         | Server mode, not authenticated                                     |
| `authenticatedPage`     | Server mode with registered user and JWT                           |
| `adminPage`             | Server mode with admin user (pre-seeded e2e-admin)                 |
| `offlinePage`           | Offline/local mode (for migration tests)                           |
| `serverUnavailablePage` | Server mode with API requests blocked (for offline fallback tests) |

### Screenshot Fixtures (`e2e/screenshots/fixtures.ts`)

| Fixture             | Description                                         |
| ------------------- | --------------------------------------------------- |
| `authenticatedPage` | Authenticated user with mock API and demo projects  |
| `adminPage`         | Admin user with mock API for admin page screenshots |
| `offlinePage`       | Local mode for editor/project screenshots           |
| `unconfiguredPage`  | No configuration set (shows setup screen)           |

## Writing Tests

### Local Test Example

```typescript
import { expect, test } from './fixtures';

test.describe('My Feature', () => {
  test('works in local mode', async ({ localPage: page }) => {
    // Any API call will FAIL the test
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

### Online Test Example

```typescript
import { expect, test } from './fixtures';

test.describe('My Feature', () => {
  test('works with real backend', async ({ authenticatedPage: page }) => {
    // Uses real backend API
    await page.goto('/create-project');
    await page.getByTestId('project-title-input').fill('Test');
    await page.getByTestId('project-slug-input').fill('test');
    await page.getByTestId('create-project-button').click();
    await expect(page).toHaveURL(/test/);
  });
});
```

### Screenshot Test Example

```typescript
import { join } from 'path';
import { test } from './fixtures';

const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

test.describe('My Feature Screenshots', () => {
  test('capture feature - desktop light', async ({ offlinePage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/my-feature');
    await page.waitForSelector('.feature-content', { state: 'visible' });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'feature-desktop-light.png'),
      fullPage: true,
    });
  });
});
```

## Common Helpers

Available from `e2e/common/test-helpers.ts`:

```typescript
import {
  TEST_CONSTANTS,
  generateUniqueUsername,
  generateUniqueSlug,
  clearAllStorage,
  fillFormFields,
  createProjectWithTwoSteps,
  storeRealMediaInIndexedDB,
  storeRealEpubInIndexedDB,
  DEMO_ASSETS,
} from '../common';
```

## Configuration Files

| File                               | Purpose                                                                                                           | Servers / URL                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `playwright.config.ts`             | Router that picks a config via `TEST_ENV` (`online` default, `local`, `docker`, `wrangler`, `screenshots`, `mcp`) | varies                                                         |
| `playwright.local.config.ts`       | Local/offline tests                                                                                               | Starts the frontend on a free port                             |
| `playwright.online.config.ts`      | Online tests (real backend)                                                                                       | Starts backend and frontend on free ports                      |
| `playwright.screenshots.config.ts` | Screenshot generation                                                                                             | Starts the frontend on `http://localhost:4200`                 |
| `playwright.mcp.config.ts`         | MCP protocol tests                                                                                                | Starts the backend and the MCP Inspector on free ports         |
| `playwright.docker.config.ts`      | Docker container tests                                                                                            | Container started by global setup, free port                   |
| `playwright.wrangler.config.ts`    | Wrangler dev (Workers)                                                                                            | Frontend `4400`, backend `9333` by default (env vars override) |
| `playwright.cloudflare.config.ts`  | Deployed Cloudflare (not selectable via `TEST_ENV`; use `npm run e2e:cloudflare`)                                 | `CLOUDFLARE_FRONTEND_URL`                                      |

Ports are allocated by `common/free-port.ts` so several worktrees or agent
sessions can run e2e at once. Set `PLAYWRIGHT_FRONTEND_PORT` /
`PLAYWRIGHT_BACKEND_PORT` to pin them. Retries are 1 in CI and 0 otherwise
(the deployed-Cloudflare config uses 3 / 1).

## Cloudflare Workers Testing

### Wrangler Dev (Local Workers Runtime)

Tests against `wrangler dev` which runs the Cloudflare Workers runtime locally.
This provides a more production-like environment with D1 database and Durable Objects.

```bash
npm run e2e:wrangler        # Run against wrangler dev
npm run e2e:wrangler:ui     # Run with UI
npm run e2e:wrangler:debug  # Debug mode
```

**Prerequisites:**

- `backend/wrangler.toml` (copy `backend/wrangler.toml.example`). The local D1
  database is initialised by the config's webServer command
  (`bun run init:d1-local`) and `wrangler dev --local` runs it all on disk, so
  no Cloudflare login or real database is needed

**Note:** Wrangler dev is slower to start (~30-60s) than the Bun backend. The
suite runs serially with one worker.

### Cloudflare Deployed (Remote Testing)

Tests against actually deployed Cloudflare services (Pages + Workers).
Useful for smoke testing after deployments.

```bash
CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare
```

**Caution:** Tests create real data in the deployed environment!

## CI/CD

The default `npm run e2e` runs the local suite and then the online suite:

1. Local tests run first (faster, no backend startup)
2. Online tests run second (starts the backend itself)

For CI, use `npm run e2e:ci`, which adds the `list` and `html` reporters.

## Adding New Tests

1. **Pure local/offline feature**: Add to `e2e/local/`
2. **Requires real backend**: Add to `e2e/online/`
3. **Migration/mode-switching**: Add to `e2e/online/`
4. **Screenshots for docs**: Add to `e2e/screenshots/`
5. **MCP protocol features**: Add to `e2e/mcp/`

## Additional Resources

- [Best Practices](./BEST_PRACTICES.md)
- [Quick Start Guide](./QUICK_START.md)
- [Test Coverage Matrix](./COVERAGE.md)
- [Local Tests README](./local/README.md)
- [Online Tests README](./online/README.md)
