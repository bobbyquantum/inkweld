# E2E Tests Quick Start Guide

## Prerequisites

- Nothing needs to be running: each Playwright config starts the servers it
  needs (the frontend for local tests; backend and frontend for online and MCP
  tests) on free ports. The screenshots config uses `http://localhost:4200`.
- Run `bun install` (from the repo root) to ensure all dependencies are installed
- Run `npx playwright install chromium` to install the browser

## Quick Commands

### List All Tests

```bash
# List local tests
npx playwright test --config=playwright.local.config.ts --list

# List online tests
npx playwright test --config=playwright.online.config.ts --list

# List screenshot tests
npx playwright test --config=playwright.screenshots.config.ts --list
```

### Run All E2E Tests

```bash
# Run local + online tests
npm run e2e

# CI mode
npm run e2e:ci
```

### Run by Test Suite

#### Local Tests (no backend required)

```bash
npm run e2e:local           # Run all local tests
npm run e2e:local:ui        # Run with UI
npm run e2e:local:debug     # Debug mode
```

#### Online Tests (requires backend)

```bash
npm run e2e:online          # Run all online tests
npm run e2e:online:ui       # Run with UI
npm run e2e:online:debug    # Debug mode
```

#### Screenshot Tests (no backend required)

```bash
npm run e2e:screenshots     # Generate all screenshots
```

### Run Specific Test Files

```bash
# Local tests
npx playwright test --config=playwright.local.config.ts e2e/local/about.spec.ts
npx playwright test --config=playwright.local.config.ts e2e/local/projects.spec.ts
npx playwright test --config=playwright.local.config.ts e2e/local/project-documents.spec.ts

# Online tests
npx playwright test --config=playwright.online.config.ts e2e/online/auth/registration.spec.ts
npx playwright test --config=playwright.online.config.ts e2e/online/auth/login.spec.ts
npx playwright test --config=playwright.online.config.ts e2e/online/account-settings.spec.ts
npx playwright test --config=playwright.online.config.ts e2e/online/about.spec.ts

# Screenshot tests
npx playwright test --config=playwright.screenshots.config.ts e2e/screenshots/pwa-screenshots.spec.ts
npx playwright test --config=playwright.screenshots.config.ts e2e/screenshots/about-screenshots.spec.ts
```

### Run with Visual Feedback

#### UI Mode (Recommended for Development)

```bash
npm run e2e:local:ui    # Local tests with UI
npm run e2e:online:ui   # Online tests with UI
```

Interactive browser with test results, traces, and debugging tools.

#### Headed Mode (See Browser)

```bash
npx playwright test --config=playwright.local.config.ts --headed
```

#### Debug Mode (Step Through Tests)

```bash
npm run e2e:local:debug
npm run e2e:online:debug
```

### Run Specific Test by Name

```bash
npx playwright test --config=playwright.local.config.ts -g "should navigate to about page"
```

### Generate Test Report

```bash
npx playwright show-report
```

## Test Categories

Each suite is a directory of `*.spec.ts` files named after the feature they
cover, so `ls` is the up-to-date index:

| Suite       | Directory          | Notes                                                                              |
| ----------- | ------------------ | ---------------------------------------------------------------------------------- |
| Local       | `e2e/local/`       | Offline mode, no backend, API requests fail the test                               |
| Online      | `e2e/online/`      | Real Bun backend with an in-memory database (`auth/` holds login and registration) |
| Screenshots | `e2e/screenshots/` | Mock API; writes images for the docs site                                          |
| MCP         | `e2e/mcp/`         | MCP protocol tests against a real backend                                          |

See [COVERAGE.md](./COVERAGE.md) for which routes and features each suite covers.

## Continuous Integration

### Run Tests for CI

```bash
npm run e2e:ci
```

This will:

- Run local tests first, then online tests
- Retry a failed test once (`retries` is 1 under `CI`, 0 otherwise)
- Keep traces and screenshots of failures
- Add the `list` and `html` reporters

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

### Port Already in Use / Wrong Server

The configs pick free ports and start their own servers, so a manually started
`ng serve` is not required. To run against a server you started yourself, pin
the port (the config reuses an existing server outside CI):

```bash
PLAYWRIGHT_FRONTEND_PORT=4200 npm run e2e:local
```

The online and MCP backends are never reused (`reuseExistingServer: false`),
so a stray backend on the dev port 8333 does not interfere.

### Tests Timing Out

**Solution**: Increase timeout in individual tests

```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test code
});
```

## Environment Variables

| Variable                                               | Description                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `TEST_ENV`                                             | Select the config used by plain `playwright test`: `online` (default), `local`, `docker`, `wrangler`, `screenshots`, `mcp` |
| `PLAYWRIGHT_FRONTEND_PORT` / `PLAYWRIGHT_BACKEND_PORT` | Pin the ports the configs would otherwise pick                                                                             |
| `API_BASE_URL`                                         | Backend URL used by the wrangler, docker and MCP setups                                                                    |
| `CLOUDFLARE_FRONTEND_URL`                              | Frontend URL for Cloudflare deployed tests                                                                                 |
| `CI`                                                   | Set for CI mode (retries, no server reuse)                                                                                 |

## Resources

- [Playwright Documentation](https://playwright.dev)
- [E2E README](./README.md)
- [Best Practices](./BEST_PRACTICES.md)
- [Test Coverage Matrix](./COVERAGE.md)
