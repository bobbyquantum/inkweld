# E2E Testing with Mock Authentication

This directory contains end-to-end tests using Playwright along with a custom mock API infrastructure to simulate backend responses, particularly for authentication flows.

## Architecture

The e2e testing framework consists of several components:

1. **Mock API Layer**: Intercepts API requests and returns mock responses
2. **Authentication Mocking**: Simulates registration, login, and OAuth flows
3. **Test Fixtures**: Pre-configured page objects with different authentication states
4. **Test Helpers**: Helper functions for common auth-related operations

## Getting Started

### Running Tests

To run the e2e tests:

```bash
# Run all e2e tests
npm run e2e

# Run specific test files
npx playwright test e2e/auth/login.spec.ts

# Run with UI mode
npx playwright test --ui
```

### Debug Mode

For debugging tests:

```bash
# Run with debug mode
npx playwright test --debug
```

## Using the Mock API

The mock API infrastructure automatically intercepts all requests to API endpoints and provides mock responses. You don't need a real backend server running to execute the tests.

### Authentication States

The framework provides three authentication states available as fixtures:

1. `anonymousPage`: Unauthenticated user (default)
2. `authenticatedPage`: Standard authenticated user
3. `adminPage`: Admin user with elevated privileges

Example usage:

```typescript
import { test, expect } from '../fixtures';

// Test with anonymous user
test('anonymous test', async ({ anonymousPage: page }) => {
  // page is not authenticated
});

// Test with authenticated user
test('authenticated test', async ({ authenticatedPage: page }) => {
  // page is already authenticated
});

// Test with admin user
test('admin test', async ({ adminPage: page }) => {
  // page is authenticated as admin
});
```

### Test Helpers

The fixtures module provides helper functions for common UI interactions:

```typescript
import { test, expect, loginViaUI, registerViaUI, createProjectViaUI } from '../fixtures';
import { generateUniqueUsername, TEST_CONSTANTS } from './test-helpers';

test('login flow', async ({ anonymousPage: page }) => {
  await loginViaUI(page, 'testuser', TEST_CONSTANTS.VALID_PASSWORD);
  // Now authenticated
});

test('registration flow', async ({ anonymousPage: page }) => {
  const username = generateUniqueUsername();
  await registerViaUI(page, username, TEST_CONSTANTS.VALID_PASSWORD);
  // Now registered and authenticated
});

test('create project flow', async ({ authenticatedPage: page }) => {
  await createProjectViaUI(page, 'My Project', 'my-project', 'Description');
  // Project created and navigated to project page
});
```

### Utility Functions

Additional utility functions are available in `test-helpers.ts`:

```typescript
import { 
  generateUniqueUsername, 
  generateUniqueSlug,
  waitForNetworkIdle,
  clearAllStorage,
  fillFormFields,
  TEST_CONSTANTS 
} from './test-helpers';

// Generate unique identifiers
const username = generateUniqueUsername('user');
const slug = generateUniqueSlug('project');

// Fill multiple form fields at once
await fillFormFields(page, {
  'project-title-input': 'My Project',
  'project-slug-input': 'my-project',
  'project-description-input': 'Description'
});

// Wait for network to be idle
await waitForNetworkIdle(page);

// Use common test constants
const password = TEST_CONSTANTS.VALID_PASSWORD;
const timeout = TEST_CONSTANTS.TIMEOUTS.MEDIUM;
```

## Mock Credentials

### Pre-configured Users

The mock API comes with pre-configured users:

1. **Standard User**:
   - Username: `testuser`
   - Password: `correct-password`
   - Name: `Test User`

2. **Admin User**:
   - Username: `adminuser`
   - Password: `correct-password`
   - Name: `Admin User`

### OAuth Providers

The following OAuth providers are mocked:

- Google
- GitHub
- Facebook

## Extending the Mock API

### Adding New Endpoints

To add new mock endpoints, create a new handler file in the `mock-api` directory and register it in the initialization:

```typescript
// Example: mock-api/products.ts
import { Route } from '@playwright/test';
import { mockApi } from './index';

export function setupProductHandlers() {
  mockApi.addHandler('**/api/products', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' }
      ])
    });
  });
}
```

Then register in the initialization:

```typescript
// fixtures.ts (update initializeMockApi function)
function initializeMockApi(): void {
  setupAuthHandlers();
  setupUserHandlers();
  setupProductHandlers(); // Add your new handler here
}
```

## Test Organization

Tests are organized by feature area:

- `auth/`: Authentication-related tests
  - `login.spec.ts`: Login flow tests
  - `registration.spec.ts`: Registration flow tests
  - `oauth.spec.ts`: OAuth authentication tests
  - `protected-routes.spec.ts`: Authorization tests

Additional test directories can be added for other feature areas.
