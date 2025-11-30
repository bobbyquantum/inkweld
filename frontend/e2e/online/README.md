# Online E2E Tests

This folder contains end-to-end tests that run against the **real backend server**.

## Key Characteristics

- **Real Backend**: Tests run against the actual Bun backend server
- **In-Memory Database**: The backend uses an in-memory SQLite database for isolation
- **Sequential Execution**: Tests run sequentially to avoid database state conflicts
- **Full Integration**: Tests verify complete frontend-backend integration

## Fixtures

### `anonymousPage`
A page configured for server mode but without authentication. Use for testing login/register flows.

### `authenticatedPage`
A page with a freshly registered user and valid JWT token. Use for testing authenticated features.

### `offlinePage`
A page in offline mode. Used for testing migration scenarios from offline to online.

## Running Tests

```bash
# Run all online tests
npm run e2e:online

# Run with UI
npm run e2e:online:ui

# Run in debug mode
npm run e2e:online:debug

# Run in CI mode
npm run e2e:online:ci
```

## Writing Tests

```typescript
import { expect, test } from './fixtures';

test.describe('My Online Feature', () => {
  test('should work with real backend', async ({ authenticatedPage: page }) => {
    // This uses the real backend API
    await page.goto('/create-project');
    // ... your test
  });
});
```

## Backend Configuration

The backend starts with these environment variables:
- `NODE_ENV=test`
- `DB_TYPE=sqlite`
- `DB_DATABASE=:memory:` (in-memory for isolation)
- `USER_APPROVAL_REQUIRED=false`
- `GITHUB_ENABLED=false`

## Use Cases

1. **Migration Tests**: Testing offline → server migration workflows
2. **Auth Flows**: Testing real registration/login with the backend
3. **API Integration**: Verifying frontend-backend communication
4. **Data Persistence**: Testing that data persists correctly on the server

## Important Notes

1. **Sequential**: Tests run one at a time due to database state
2. **Fresh State**: Each test gets a fresh browser context
3. **Unique Users**: Use unique usernames (e.g., `testuser-${Date.now()}`) to avoid conflicts
