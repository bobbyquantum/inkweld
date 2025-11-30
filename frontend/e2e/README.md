# E2E Testing

This directory contains end-to-end tests for Inkweld, organized into three categories:

## Test Categories

### 1. Offline Tests (`e2e/offline/`)
Tests that run in **pure offline mode** without any network access.

- **No Backend Required**: Tests run with the app in offline mode
- **Network Blocked**: Any API request will **fail the test**
- **IndexedDB Storage**: All data stored locally
- **Parallel Execution**: Tests can run in parallel

```bash
npm run e2e:offline        # Run offline tests
npm run e2e:offline:ui     # Run with UI
npm run e2e:offline:debug  # Debug mode
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
```

### 3. Legacy/Mock Tests (root `e2e/` folder)
Tests using mock API responses. These are being migrated to offline/online.

```bash
npx playwright test       # Run mock API tests
```

## Running All Tests

```bash
# Run both offline and online tests (recommended for CI)
npm run e2e

# CI mode (minimal output)
npm run e2e:ci
```

## Cloudflare Workers Testing

In addition to the standard test modes, you can test against Cloudflare Workers:

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
# Set the deployed frontend URL
CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare

# With UI
CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare:ui
```

**⚠️ Caution:** Tests create real data in the deployed environment!
Consider using a dedicated test environment or running read-only tests only.

## Directory Structure

```
e2e/
├── common/              # Shared test utilities
│   ├── index.ts
│   └── test-helpers.ts
├── offline/             # Offline mode tests
│   ├── fixtures.ts      # Offline test fixtures
│   ├── worldbuilding.spec.ts
│   └── README.md
├── online/              # Real backend tests
│   ├── fixtures.ts      # Online test fixtures
│   ├── migration.spec.ts
│   ├── auth.spec.ts
│   └── README.md
├── mock-api/            # Mock API handlers (legacy)
├── auth/                # Auth tests (mock API)
├── fixtures.ts          # Legacy fixtures
└── *.spec.ts            # Legacy test files
```

## Fixtures

### Offline Fixtures (`e2e/offline/fixtures.ts`)

| Fixture | Description |
|---------|-------------|
| `offlinePage` | Page in offline mode, API requests blocked |
| `offlinePageWithProject` | Offline page with a project pre-created |
| `offlineContext` | Browser context for offline mode |

### Online Fixtures (`e2e/online/fixtures.ts`)

| Fixture | Description |
|---------|-------------|
| `anonymousPage` | Server mode, not authenticated |
| `authenticatedPage` | Server mode with registered user and JWT |
| `offlinePage` | Offline mode (for migration tests) |

## Writing Tests

### Offline Test Example

```typescript
import { expect, test } from './fixtures';

test.describe('My Feature', () => {
  test('works offline', async ({ offlinePage: page }) => {
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
  getAppMode,
  getOfflineProjects,
} from '../common';
```

## Configuration Files

| File | Purpose |
|------|---------|
| `playwright.offline.config.ts` | Offline test configuration |
| `playwright.online.config.ts` | Online test configuration |
| `playwright.wrangler.config.ts` | Wrangler dev (local Workers runtime) |
| `playwright.cloudflare.config.ts` | Deployed Cloudflare testing |
| `playwright.config.ts` | Legacy mock API tests |

## CI/CD

The default `npm run e2e` runs both offline and online tests sequentially:

1. Offline tests run first (faster, no backend startup)
2. Online tests run second (requires backend)

For CI, use `npm run e2e:ci` for minimal output.

## Adding New Tests

1. **Pure offline feature**: Add to `e2e/offline/`
2. **Requires real backend**: Add to `e2e/online/`
3. **Migration/mode-switching**: Add to `e2e/online/`
