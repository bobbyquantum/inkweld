# E2E Tests Quick Start Guide

## Prerequisites
- Frontend dev server must be running on `http://localhost:4200`
- Run `bun install` to ensure all dependencies are installed

## Quick Commands

### List All Tests
```bash
npx playwright test --list
```

### Run All E2E Tests
```bash
npx playwright test
# or
bun run e2e
```

### Run Specific Test Files

#### Registration Tests (10 tests)
```bash
npx playwright test e2e/auth/registration.spec.ts
```

#### Login Tests (5 tests)
```bash
npx playwright test e2e/auth/login.spec.ts
```

#### Project Workflow Tests (17 tests)
```bash
npx playwright test e2e/projects.spec.ts
```

#### Mobile Tests (15 tests)
```bash
npx playwright test e2e/mobile.spec.ts
```

#### Error Handling Tests (25 tests)
```bash
npx playwright test e2e/error-handling.spec.ts
```

#### Setup Mode Tests (6+ tests)
```bash
npx playwright test e2e/setup.spec.ts
npx playwright test e2e/setup-integration.spec.ts
```

#### Launch Tests (2 tests)
```bash
npx playwright test e2e/launch.spec.ts
```

### Run with Visual Feedback

#### UI Mode (Recommended for Development)
```bash
npx playwright test --ui
```
Interactive browser with test results, traces, and debugging tools.

#### Headed Mode (See Browser)
```bash
npx playwright test --headed
```

#### Debug Mode (Step Through Tests)
```bash
npx playwright test --debug
```

### Run Specific Test by Name
```bash
npx playwright test -g "should register a new user successfully"
```

### Run Tests in Parallel
```bash
npx playwright test --workers=4
```

### Generate Test Report
```bash
npx playwright show-report
```

## Test Categories

### Authentication (15 tests total)
- `e2e/auth/login.spec.ts` - Login flows
- `e2e/auth/registration.spec.ts` - Registration flows

### Projects (17 tests)
- `e2e/projects.spec.ts` - Project CRUD operations

### Mobile (15 tests)
- `e2e/mobile.spec.ts` - Mobile-specific interactions

### Error Handling (25 tests)
- `e2e/error-handling.spec.ts` - Edge cases and error scenarios

### Setup & Launch (8+ tests)
- `e2e/setup.spec.ts` - Setup mode
- `e2e/setup-integration.spec.ts` - Setup integration
- `e2e/launch.spec.ts` - App launch

## Continuous Integration

### Run Tests for CI
```bash
CI=1 npx playwright test
```
This will:
- Run with retries (2 attempts)
- Use single worker (no parallel)
- Fail on test.only
- Generate CI-friendly reports

## Debugging Failed Tests

### View Last Test Report
```bash
npx playwright show-report
```

### View Traces
```bash
npx playwright show-trace trace.zip
```

### Run Failed Tests Only
```bash
npx playwright test --last-failed
```

## Common Issues

### Dev Server Not Running
```
Error: page.goto: net::ERR_CONNECTION_REFUSED
```
**Solution**: Start the dev server first
```bash
bun run start
# or
ng serve
```

### Port Already in Use
**Solution**: Kill the process or change the port in `playwright.config.ts`

### Tests Timing Out
**Solution**: Increase timeout in individual tests
```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test code
});
```

## Best Practices

1. **Run Tests Before Committing**
   ```bash
   npx playwright test --reporter=list
   ```

2. **Focus on Specific Area**
   ```bash
   npx playwright test e2e/auth/
   ```

3. **Use UI Mode for Development**
   ```bash
   npx playwright test --ui
   ```

4. **Check Coverage**
   Run all tests and review the HTML report:
   ```bash
   npx playwright test
   npx playwright show-report
   ```

## Updating Tests

### Add New Test Data IDs
1. Add `data-testid` to component template
2. Use in test: `page.getByTestId('my-element')`

### Add New Mock API Endpoints
1. Create handler in `e2e/mock-api/[feature].ts`
2. Register in `e2e/fixtures.ts` `initializeMockApi()`
3. Use in tests

### Create New Test File
```typescript
import { expect, test } from './fixtures';

test.describe('Feature Name', () => {
  test('should do something', async ({ authenticatedPage: page }) => {
    await page.goto('/path');
    await expect(page).toHaveURL('/path');
  });
});
```

## Environment Variables

### Custom Base URL
```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 npx playwright test
```

### Headless Mode
```bash
HEADLESS=false npx playwright test
```

## Performance Tips

1. **Run Specific Tests During Development**
   - Don't run all 80+ tests for every change
   - Use `--ui` mode for quick iteration

2. **Use Parallel Execution**
   - Tests run in parallel by default
   - Adjust workers: `--workers=4`

3. **Mock API is Fast**
   - No real backend needed
   - Tests complete quickly

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Project E2E Test Structure](./README.md)
- [Test Improvements Summary](./E2E_IMPROVEMENTS_SUMMARY.md)

---

**Quick Stats:**
- Total E2E Tests: ~80
- New Tests Added: 67
- Coverage: Authentication, Projects, Mobile, Error Handling, Setup
- Average Run Time: ~2-3 minutes for full suite
