# Full-Stack E2E Tests

This directory contains end-to-end tests that require both the frontend and backend servers to be running with real API integration (no mocking).

## Purpose

These tests verify:

- **Real backend integration**: Tests hit actual API endpoints, not mocks
- **Database operations**: Verify data persistence across requests
- **Authentication flows**: Test real session management
- **Migration workflows**: Offline→server project migration
- **WebSocket connections**: Test real-time collaboration (Yjs sync)

## Running Full-Stack Tests

### Prerequisites

1. Backend must be configured with test environment:
   - SQLite in-memory database
   - Test data directory
   - User approval disabled for automated testing

2. Both servers will be started automatically by Playwright

### Run Commands

```bash
# Run full-stack tests with UI
npm run e2e:fullstack

# Run full-stack tests in CI mode (headless)
npm run e2e:fullstack:ci

# Run specific test file
npx playwright test --config=playwright.fullstack.config.ts migration.spec.ts

# Debug a test
npx playwright test --config=playwright.fullstack.config.ts --debug migration.spec.ts
```

## Test Configuration

**File**: `playwright.fullstack.config.ts`

Key features:

- **Dual WebServer**: Starts both backend (port 8333) and frontend (port 4200)
- **Test Environment**: Backend uses test-specific env vars
- **Sequential Workers**: Tests run one at a time to avoid database conflicts
- **Extended Timeout**: 60s timeout for migration operations

Backend test configuration:

```env
NODE_ENV=test
DB_TYPE=sqlite
DB_DATABASE=:memory:
DATA_PATH=/tmp/inkweld-test-data
SESSION_SECRET=test-session-secret
USER_APPROVAL_REQUIRED=false
```

## Test Fixtures

**File**: `fixtures.ts`

Available fixtures:

- `anonymousPage`: Not logged in, server mode configured
- `authenticatedPage`: Auto-registers and logs in unique test user
- `offlinePage`: Offline mode with clean localStorage

Helper functions:

- `createOfflineProject()`: Create project in offline/server mode
- `openUserSettings()`: Navigate to settings dialog
- `getOfflineProjects()`: Get list of offline projects from localStorage
- `getAppMode()`: Get current app mode ('offline' | 'server')

## Test Files

### `migration.spec.ts`

Tests offline→server migration workflow:

1. **Basic Migration Test**:
   - Creates offline projects
   - Switches to server mode
   - Migrates projects via UI
   - Verifies projects exist on server

2. **Duplicate Handling Test**:
   - Creates project offline
   - Creates same project on server
   - Verifies graceful handling of duplicates

3. **Content Preservation Test**:
   - Creates offline project with document content
   - Migrates to server
   - Verifies content persisted after migration

## Writing New Tests

### Example Test Structure

```typescript
import { test, expect, authenticatedPage } from './fixtures';

test.describe('My Feature', () => {
  test('should do something', async ({ authenticatedPage }) => {
    // Test automatically has:
    // - Backend running on port 8333
    // - Frontend running on port 4200
    // - User registered and logged in
    // - Server mode configured
    
    await authenticatedPage.goto('/');
    // ... rest of test
  });
});
```

### Best Practices

1. **Use Fixtures**: Always use provided fixtures instead of managing auth manually
2. **Real Data**: Tests create real data in the test database
3. **Unique Names**: Generate unique project/user names using timestamps
4. **Wait for Operations**: Use `waitForTimeout()` for Yjs sync operations
5. **Clean State**: Each test gets fresh database (in-memory SQLite)
6. **Error Handling**: Test both success and failure scenarios

## Debugging

### View Test Output

```bash
# Run with headed browser
npx playwright test --config=playwright.fullstack.config.ts --headed

# Run with Playwright Inspector
npx playwright test --config=playwright.fullstack.config.ts --debug

# Generate trace
npx playwright test --config=playwright.fullstack.config.ts --trace on
npx playwright show-trace trace.zip
```

### Common Issues

**Backend fails to start**:

- Check if port 8333 is already in use
- Verify backend dependencies are installed (`cd ../backend && bun install`)
- Check backend logs in test output

**Frontend fails to start**:

- Check if port 4200 is already in use
- Verify frontend dependencies are installed (`npm install`)
- Clear Angular cache: `rm -rf .angular`

**Tests timeout**:

- Increase timeout in `playwright.fullstack.config.ts`
- Check network tab in Playwright trace
- Verify WebSocket connections succeed

**Database conflicts**:

- Tests should run sequentially (workers: 1)
- Verify each test uses unique usernames/projects
- Check for leaked database connections

## CI Integration

These tests are designed to run in CI pipelines:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm run install-all

- name: Run full-stack e2e tests
  run: cd frontend && npm run e2e:fullstack:ci
```

## Performance Considerations

- **Startup Time**: Both servers take ~5-10s to start
- **Test Duration**: Migration tests can take 30-60s each
- **Database**: In-memory SQLite is fast but uses RAM
- **Cleanup**: Servers shut down automatically after tests

## Maintenance

When updating tests:

- Keep test data realistic but minimal
- Test critical paths, not every edge case
- Document any new fixtures or helpers
- Update this README with new test files

## Related Documentation

- **E2E Best Practices**: `../BEST_PRACTICES.md` (frontend-only e2e guidelines)
- **Backend Test Config**: `../../backend/.env.test.example`
- **Migration Service**: `../../src/app/services/migration.service.ts`
- **Playwright Docs**: <https://playwright.dev/>
