# E2E Testing Best Practices

## Table of Contents
1. [Test Structure](#test-structure)
2. [Naming Conventions](#naming-conventions)
3. [Selectors](#selectors)
4. [Test Data](#test-data)
5. [Assertions](#assertions)
6. [Async Operations](#async-operations)
7. [Test Isolation](#test-isolation)
8. [Performance](#performance)
9. [Debugging](#debugging)
10. [Common Pitfalls](#common-pitfalls)

---

## Test Structure

### Use Descriptive Test Names
```typescript
// ✅ Good
test('should register a new user successfully with valid credentials', async ({ page }) => {
  // ...
});

// ❌ Bad
test('registration works', async ({ page }) => {
  // ...
});
```

### Group Related Tests
```typescript
test.describe('User Registration', () => {
  test.describe('Validation', () => {
    test('should enforce password strength requirements', async ({ page }) => {
      // ...
    });
    
    test('should validate password confirmation matches', async ({ page }) => {
      // ...
    });
  });
  
  test.describe('Success Flows', () => {
    test('should register and auto-login', async ({ page }) => {
      // ...
    });
  });
});
```

### Use beforeEach for Setup
```typescript
test.describe('Project Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Common setup for all tests in this group
    await page.goto('/projects');
  });
  
  test('should list projects', async ({ page }) => {
    // Test specific code
  });
});
```

---

## Naming Conventions

### Test Files
- Use `.spec.ts` suffix
- Name after the feature: `registration.spec.ts`, `projects.spec.ts`
- Group by feature area in folders: `auth/`, `projects/`

### Test Descriptions
- Start with "should" for behavior tests
- Be specific about expected outcome
- Include relevant context

```typescript
// ✅ Good
test('should show error when username is already taken', async ({ page }) => {});
test('should automatically login after successful registration', async ({ page }) => {});

// ❌ Bad  
test('username error', async ({ page }) => {});
test('login', async ({ page }) => {});
```

---

## Selectors

### Always Use Test Data IDs
```typescript
// ✅ Good - Stable, semantic selector
await page.getByTestId('username-input').fill('user');
await page.getByTestId('register-button').click();

// ❌ Bad - Fragile, implementation-dependent
await page.locator('input[name="username"]').fill('user');
await page.locator('.register-btn').click();
```

### Fallback to Role-Based Selectors
```typescript
// ✅ Good - Accessible
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('test@example.com');

// ⚠️ Only when necessary
await page.locator('button:has-text("Submit")').click();
```

### Add Test IDs to Components
```html
<!-- ✅ Good -->
<input 
  matInput
  formControlName="username"
  data-testid="username-input" />

<button 
  mat-raised-button
  type="submit"
  data-testid="register-button">
  Register
</button>
```

---

## Test Data

### Generate Unique Values
```typescript
import { generateUniqueUsername, generateUniqueSlug } from './test-helpers';

// ✅ Good - Prevents conflicts
test('should create project', async ({ page }) => {
  const projectSlug = generateUniqueSlug('my-project');
  await createProjectViaUI(page, 'My Project', projectSlug);
});

// ❌ Bad - Can cause flaky tests
test('should create project', async ({ page }) => {
  await createProjectViaUI(page, 'My Project', 'my-project');
});
```

### Use Constants for Common Values
```typescript
import { TEST_CONSTANTS } from './test-helpers';

// ✅ Good
await page.getByTestId('password-input').fill(TEST_CONSTANTS.VALID_PASSWORD);

// ❌ Bad - Magic strings
await page.getByTestId('password-input').fill('ValidPass123!');
```

### Keep Test Data Realistic
```typescript
// ✅ Good - Realistic data
const user = {
  username: 'john_doe',
  email: 'john@example.com',
  name: 'John Doe'
};

// ❌ Bad - Unrealistic
const user = {
  username: 'x',
  email: 'a@b.c',
  name: 'A'
};
```

---

## Assertions

### Use Specific Assertions
```typescript
// ✅ Good - Specific and clear
await expect(page.getByTestId('username-input')).toBeVisible();
await expect(page.getByTestId('error-message')).toContainText('Username is required');
await expect(page).toHaveURL('/dashboard');

// ❌ Bad - Too generic
const element = await page.locator('.username').isVisible();
expect(element).toBeTruthy();
```

### Assert on Multiple States
```typescript
// ✅ Good - Comprehensive
test('should disable button during submission', async ({ page }) => {
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toContainText('Submitting...');
});
```

### Verify Navigation
```typescript
// ✅ Good - Explicit navigation check
await page.getByTestId('submit-button').click();
await expect(page).toHaveURL('/success');

// ⚠️ Less reliable - might pass before navigation
await page.getByTestId('submit-button').click();
await page.waitForTimeout(1000);
```

---

## Async Operations

### Wait for Specific Conditions
```typescript
// ✅ Good - Wait for specific element
await expect(localPage.locator('[data-testid="user-menu-button"]')).toBeVisible()

// ✅ Good - Wait for URL change
await page.waitForURL('/projects');

// ❌ Bad - Wait for network idle, use element assertions instead
await page.waitForLoadState('networkidle');

// ❌ Bad - Arbitrary timeouts
await page.waitForTimeout(5000);
```

### Handle Race Conditions
```typescript
// ✅ Good - Wait for button to be ready
await page.getByTestId('submit-button').waitFor({ state: 'visible' });
await page.getByTestId('submit-button').click();

// ❌ Bad - Might click before ready
await page.getByTestId('submit-button').click();
```

### Use Promise.all for Parallel Operations
```typescript
// ✅ Good - Parallel execution
await Promise.all([
  page.waitForNavigation(),
  page.getByTestId('submit-button').click()
]);

// ⚠️ Slower - Sequential execution
await page.getByTestId('submit-button').click();
await page.waitForNavigation();
```

---

## Test Isolation

### Clean State Between Tests
```typescript
test.describe('User Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });
});
```

### Don't Depend on Test Order
```typescript
// ✅ Good - Each test is independent
test('test A', async ({ page }) => {
  await setupTestA(page);
  // Test A logic
});

test('test B', async ({ page }) => {
  await setupTestB(page);
  // Test B logic
});

// ❌ Bad - Test B depends on Test A
test('test A - create user', async ({ page }) => {
  await createUser(page);
});

test('test B - use user from A', async ({ page }) => {
  // Assumes user from test A exists
});
```

### Use Fixtures for Shared Setup
```typescript
// ✅ Good - Use fixtures
test('authenticated test', async ({ authenticatedPage: page }) => {
  // Already authenticated via fixture
});

// ❌ Bad - Repeated setup
test('test 1', async ({ page }) => {
  await loginViaUI(page, 'user', 'pass');
  // test logic
});

test('test 2', async ({ page }) => {
  await loginViaUI(page, 'user', 'pass');
  // test logic
});
```

---

## Performance

### Run Tests in Parallel
```typescript
// Tests in different files run in parallel by default
// Use test.describe.serial for sequential execution
test.describe.serial('Sequential Tests', () => {
  test('runs first', async ({ page }) => {});
  test('runs second', async ({ page }) => {});
});
```

### Use Selective Test Execution
```bash
# Run specific file
npx playwright test registration.spec.ts

# Run tests matching pattern
npx playwright test -g "username"

# Run in headed mode for debugging
npx playwright test --headed
```

### Optimize Waits
```typescript
// ✅ Good - Specific wait
await page.waitForSelector('[data-testid="result"]');

// ❌ Bad - Arbitrary long wait
await page.waitForTimeout(10000);
```

---

## Debugging

### Use UI Mode
```bash
npx playwright test --ui
```

### Enable Trace
```typescript
// In playwright.config.ts
use: {
  trace: 'on',  // or 'retain-on-failure'
}
```

### Add Debug Points
```typescript
test('debug test', async ({ page }) => {
  await page.goto('/login');
  
  // Pause test execution
  await page.pause();
  
  // Take screenshot
  await page.screenshot({ path: 'debug.png' });
  
  // Log page content
  console.log(await page.content());
});
```

### Use test.only for Focused Testing
```typescript
// Run only this test
test.only('focus on this', async ({ page }) => {
  // ...
});

// Skip this test
test.skip('skip this', async ({ page }) => {
  // ...
});
```

---

## IDE Integration & Config Switching

### Using Playwright in VS Code

When running tests through the Playwright VS Code extension or IDE integration, you can switch between different test configurations for various scenarios:

#### Switching Test Environments

The Inkweld project provides multiple Playwright configurations:

- **`playwright.online.config.ts`** - Default: Tests against live backend (port 8333)
- **`playwright.local.config.ts`** - Tests with local/mock functionality
- **`playwright.docker.config.ts`** - Tests in Docker environment
- **`playwright.wrangler.config.ts`** - Tests with Cloudflare Workers
- **`playwright.screenshots.config.ts`** - Configuration for screenshot capture

#### Method 1: Using Environment Variables

```bash
# Run online tests (default)
TEST_ENV=online npx playwright test

# Run local tests
TEST_ENV=local npx playwright test

# Run docker tests
TEST_ENV=docker npx playwright test

# Run wrangler tests
TEST_ENV=wrangler npx playwright test

# Run screenshot tests
TEST_ENV=screenshots npx playwright test
```

#### IDE Extension Usage

When using the Playwright VS Code extension (Test Explorer or inline test run buttons), the configuration is determined by:

1. The `playwright.env` setting in VS Code (`settings.json`)
2. The `TEST_ENV` environment variable (if set in terminal)
3. The default in `playwright.config.ts` (if neither above is set)

##### Method 2: VS Code Playwright Settings 

Edit your VS Code `settings.json` (⌘+Shift+P → "Preferences: Open Settings (JSON)"):

```jsonc
{
  "playwright.env": {
    "TEST_ENV": "online"     // or "local", "docker", "wrangler", "screenshots"
  }
}
```

**Benefits**: 
- Persists across IDE restarts
- Automatically picked up by Playwright extension
- No need to set environment variables manually
- Easy to toggle between different test scenarios

To set `TEST_ENV` in your terminal session:

```bash
# macOS/Linux
export TEST_ENV=local
npx playwright test

# Or inline
TEST_ENV=local npx playwright test

# Windows (PowerShell)
$env:TEST_ENV = "local"
npx playwright test

# Windows (Command Prompt)
set TEST_ENV=local
npx playwright test
```

### Testing Different Scenarios

| Config | Use Case | Notes |
|--------|----------|-------|
| `online` | Full integration tests | Requires backend running on port 8333 |
| `local` | Local/mock API scenarios | Tests local functionality |
| `docker` | Docker containerized tests | Used in CI/CD pipeline |
| `wrangler` | Cloudflare Workers | Tests against D1/Durable Objects |
| `screenshots` | Documentation screenshots | Generates screenshots for docs site |

---

## Common Pitfalls

### Avoid Flaky Tests

#### ❌ Bad - Flaky due to timing
```typescript
test('flaky test', async ({ page }) => {
  await page.getByTestId('button').click();
  await page.waitForTimeout(1000); // Might not be enough
  expect(await page.getByTestId('result').textContent()).toBe('Success');
});
```

#### ✅ Good - Reliable
```typescript
test('reliable test', async ({ page }) => {
  await page.getByTestId('button').click();
  await expect(page.getByTestId('result')).toHaveText('Success');
});
```

### Handle Dynamic Content

#### ❌ Bad - Fails if content changes
```typescript
await expect(page.getByTestId('welcome-message')).toHaveText('Welcome, John!');
```

#### ✅ Good - Flexible assertion
```typescript
await expect(page.getByTestId('welcome-message')).toContainText('Welcome');
```
```

### Don't Test Implementation Details

#### ❌ Bad - Testing internal state
```typescript
const state = await page.evaluate(() => window['appState']);
expect(state.isLoading).toBe(false);
```

#### ✅ Good - Testing user-visible behavior
```typescript
await expect(page.getByTestId('loading-spinner')).not.toBeVisible();
await expect(page.getByTestId('content')).toBeVisible();
```

### Clean Up Resources

#### ✅ Good - Proper cleanup
```typescript
test('file upload', async ({ page }) => {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('upload-button').click()
  ]);
  
  await fileChooser.setFiles('test-file.pdf');
  
  // Clean up after test
  test.afterEach(async () => {
    await deleteUploadedFile(page);
  });
});
```

---

## Mobile Testing Specifics

### Use Appropriate Viewport
```typescript
import { devices } from '@playwright/test';

test.use({
  ...devices['iPhone 12']
});
```

### Use Touch Actions
```typescript
// ✅ Good for mobile
await page.getByTestId('button').tap();

// ❌ Bad - Uses mouse events
await page.getByTestId('button').click();
```

### Test Orientation Changes
```typescript
test('handles orientation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // Portrait
  // Test portrait behavior
  
  await page.setViewportSize({ width: 667, height: 375 }); // Landscape
  // Test landscape behavior
});
```

---

## Summary Checklist

Before committing your test:

- ✅ Test name clearly describes behavior
- ✅ Uses test data IDs for selectors
- ✅ Generates unique test data
- ✅ Waits for specific conditions, not arbitrary timeouts
- ✅ Tests are isolated and independent
- ✅ Assertions are specific and meaningful
- ✅ Follows project naming conventions
- ✅ Includes error scenarios
- ✅ Passes linting
- ✅ Runs reliably (not flaky)

---

## Additional Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Project E2E README](./README.md)
- [Test Helpers Documentation](./test-helpers.ts)
- [Quick Start Guide](./QUICK_START.md)
