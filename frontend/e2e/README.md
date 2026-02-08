# E2E Testing

This directory contains end-to-end tests for Inkweld, organized into five categories:

## Test Categories

### 1. Local Tests (`e2e/local/`)
Tests that run in **pure local/offline mode** without any network access.

- **No Backend Required**: Tests run with the app in local mode
- **Network Blocked**: Any API request will **fail the test**
- **IndexedDB Storage**: All data stored locally
- **Parallel Execution**: Tests can run in parallel

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
- **Sequential Execution**: Tests run one at a time

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

- **JSON-RPC**: Tests MCP protocol over stdio
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
│   └── test-helpers.ts
├── local/                 # Local/offline mode tests
│   ├── fixtures.ts        # Local test fixtures
│   ├── about.spec.ts
│   ├── documents-list.spec.ts
│   ├── element-ref.spec.ts
│   ├── find-in-document.spec.ts
│   ├── folder-operations.spec.ts
│   ├── image-insert.spec.ts
│   ├── launch.spec.ts
│   ├── media-storage.spec.ts
│   ├── media-tab.spec.ts
│   ├── not-found.spec.ts
│   ├── project-import-export.spec.ts
│   ├── projects.spec.ts
│   ├── publish.spec.ts
│   ├── quick-open.spec.ts
│   ├── snapshot.spec.ts
│   ├── template-import.spec.ts
│   ├── worldbuilding.spec.ts
│   └── README.md
├── online/                # Real backend tests
│   ├── fixtures.ts        # Online test fixtures
│   ├── about.spec.ts
│   ├── account-settings.spec.ts
│   ├── admin.spec.ts
│   ├── announcements.spec.ts
│   ├── auth/              # Auth sub-tests
│   │   ├── login.spec.ts
│   │   ├── oauth.spec.ts
│   │   └── registration.spec.ts
│   ├── auth.spec.ts
│   ├── error-handling.spec.ts
│   ├── image-generation.spec.ts
│   ├── launch.spec.ts
│   ├── media-storage.spec.ts
│   ├── migration.spec.ts
│   ├── migration-simple.spec.ts
│   ├── oauth-mcp.spec.ts
│   ├── project-switching.spec.ts
│   ├── projects.spec.ts
│   ├── publish.spec.ts
│   ├── relationships-tab.spec.ts
│   ├── server-unavailable.spec.ts
│   ├── simple.spec.ts
│   └── README.md
├── screenshots/           # Screenshot generation tests
│   ├── fixtures.ts        # Screenshot test fixtures
│   ├── mock-api/          # Mock API handlers
│   ├── about-screenshots.spec.ts
│   ├── admin-ai-screenshots.spec.ts
│   ├── admin-kill-switch-screenshots.spec.ts
│   ├── documents-list-screenshots.spec.ts
│   ├── element-ref-screenshots.spec.ts
│   ├── project-rename-screenshots.spec.ts
│   ├── pwa-screenshots.spec.ts
│   ├── quick-open-screenshots.spec.ts
│   ├── relationships-tab-screenshots.spec.ts
│   ├── setup-screenshots.spec.ts
│   ├── tags-screenshots.spec.ts
│   └── templates-tab-screenshots.spec.ts
└── mcp/                   # MCP protocol tests
    ├── mcp-auth.spec.ts
    ├── mcp-discovery.spec.ts
    ├── mcp-inspector.spec.ts
    ├── mcp-mutation-tools.spec.ts
    ├── mcp-resources.spec.ts
    └── mcp-search-tools.spec.ts
```

## Fixtures

### Local Fixtures (`e2e/local/fixtures.ts`)

| Fixture | Description |
|---------|-------------|
| `localPage` | Page in local mode with user configured, API requests blocked |
| `localPageWithProject` | Local page with a project pre-created |
| `localContext` | Browser context for local mode (multi-page tests) |

### Online Fixtures (`e2e/online/fixtures.ts`)

| Fixture | Description |
|---------|-------------|
| `anonymousPage` | Server mode, not authenticated |
| `authenticatedPage` | Server mode with registered user and JWT |
| `adminPage` | Server mode with admin user (pre-seeded e2e-admin) |
| `offlinePage` | Offline/local mode (for migration tests) |
| `serverUnavailablePage` | Server mode with API requests blocked (for offline fallback tests) |

### Screenshot Fixtures (`e2e/screenshots/fixtures.ts`)

| Fixture | Description |
|---------|-------------|
| `authenticatedPage` | Authenticated user with mock API and demo projects |
| `adminPage` | Admin user with mock API for admin page screenshots |
| `offlinePage` | Local mode for editor/project screenshots |
| `unconfiguredPage` | No configuration set (shows setup screen) |

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

const SCREENSHOTS_DIR = join(process.cwd(), '..', 'docs', 'site', 'static', 'img', 'generated');

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
  waitForNetworkIdle,
  clearAllStorage,
  fillFormFields,
  createProjectWithTwoSteps,
  storeRealMediaInIndexedDB,
  storeRealEpubInIndexedDB,
  DEMO_ASSETS,
} from '../common';
```

## Configuration Files

| File | Purpose | Base URL |
|------|---------|----------|
| `playwright.config.ts` | Main router (routes via TEST_ENV) | varies |
| `playwright.local.config.ts` | Local/offline tests | `http://localhost:4200` |
| `playwright.online.config.ts` | Online tests (real backend) | `http://localhost:4400` |
| `playwright.screenshots.config.ts` | Screenshot generation | `http://localhost:4200` |
| `playwright.mcp.config.ts` | MCP protocol tests | N/A (JSON-RPC) |
| `playwright.docker.config.ts` | Docker container tests | `http://localhost:9333` |
| `playwright.wrangler.config.ts` | Wrangler dev (Workers) | `http://localhost:4400` |
| `playwright.cloudflare.config.ts` | Deployed Cloudflare | Custom URL via env var |

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

- Run `npx wrangler login` to authenticate
- Create D1 database: `cd backend && npx wrangler d1 create inkweld_dev`
- Configure `backend/wrangler.toml.local` with your database_id

**Note:** Wrangler dev is slower to start (~30-60s) than the Bun backend.

### Cloudflare Deployed (Remote Testing)

Tests against actually deployed Cloudflare services (Pages + Workers).
Useful for smoke testing after deployments.

```bash
CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare
```

**Caution:** Tests create real data in the deployed environment!

## CI/CD

The default `npm run e2e` runs both local and online tests sequentially:

1. Local tests run first (faster, no backend startup)
2. Online tests run second (requires backend)

For CI, use `npm run e2e:ci` for minimal output.

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
