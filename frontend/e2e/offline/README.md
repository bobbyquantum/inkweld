# Offline E2E Tests

This folder contains end-to-end tests that run in **pure offline mode**.

## Key Characteristics

- **No Network Access**: Any API request will cause the test to **fail immediately**
- **IndexedDB Storage**: All data is stored locally using IndexedDB
- **No Backend Required**: Tests run without starting a backend server
- **Parallel Execution**: Tests can run in parallel since they don't share state

## Fixtures

### `offlinePage`
A page configured for offline mode with a test user profile. Network requests to the API are blocked and will fail the test.

### `offlinePageWithProject`
A page in offline mode with a test project already created. Useful for tests that need an existing project.

### `offlineContext`
A browser context configured for offline mode. Use this when you need multiple pages.

## Running Tests

```bash
# Run all offline tests
npm run e2e:offline

# Run with UI
npm run e2e:offline:ui

# Run in debug mode
npm run e2e:offline:debug

# Run in CI mode
npm run e2e:offline:ci
```

## Writing Tests

```typescript
import { expect, test } from './fixtures';

test.describe('My Offline Feature', () => {
  test('should work without network', async ({ offlinePage: page }) => {
    // Any API call will FAIL the test automatically
    await page.goto('/');
    // ... your test
  });
});
```

## Important Notes

1. **API Calls Fail Tests**: The fixtures automatically fail the test if any API request is made
2. **WebSocket Blocked**: WebSocket connections to the server are also blocked
3. **Use Helpers**: Common helpers are re-exported from `./fixtures`, e.g., `createOfflineProject`
4. **Verify Offline Mode**: Tests should verify features work correctly without server connectivity
