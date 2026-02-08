# E2E Tests Quick Start Guide

## Prerequisites
- Frontend dev server must be running on `http://localhost:4200` (for local/screenshot tests)
- Backend server must be running on `http://localhost:9333` (for online tests)
- Run `bun install` to ensure all dependencies are installed
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
npx playwright test --config=playwright.local.config.ts e2e/local/documents-list.spec.ts

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

### Local Tests (`e2e/local/`)
| File | Feature |
|------|---------|
| `about.spec.ts` | About page navigation and content |
| `documents-list.spec.ts` | Documents list tab |
| `element-ref.spec.ts` | Element references (@mentions) |
| `find-in-document.spec.ts` | Find and replace |
| `folder-operations.spec.ts` | Folder creation and navigation |
| `image-insert.spec.ts` | Image insertion in editor |
| `launch.spec.ts` | App launch in local mode |
| `media-storage.spec.ts` | Local media storage |
| `media-tab.spec.ts` | Media library management |
| `not-found.spec.ts` | 404 page |
| `project-import-export.spec.ts` | Project import/export |
| `projects.spec.ts` | Project CRUD operations |
| `publish.spec.ts` | Publishing features |
| `quick-open.spec.ts` | Quick file open (Ctrl+P) |
| `snapshot.spec.ts` | Document snapshots |
| `template-import.spec.ts` | Template importing |
| `worldbuilding.spec.ts` | Worldbuilding elements |

### Online Tests (`e2e/online/`)
| File | Feature |
|------|---------|
| `about.spec.ts` | About/changelog pages |
| `account-settings.spec.ts` | Account settings and OAuth |
| `admin.spec.ts` | Admin dashboard |
| `announcements.spec.ts` | Admin announcements |
| `auth/login.spec.ts` | Login flows |
| `auth/oauth.spec.ts` | OAuth integration |
| `auth/registration.spec.ts` | Registration flows |
| `auth.spec.ts` | Authentication |
| `error-handling.spec.ts` | Error scenarios |
| `image-generation.spec.ts` | AI image generation |
| `launch.spec.ts` | App launch with server |
| `media-storage.spec.ts` | Server media storage |
| `migration.spec.ts` | Offline to server migration |
| `migration-simple.spec.ts` | Simple migration |
| `oauth-mcp.spec.ts` | OAuth with MCP |
| `project-switching.spec.ts` | Multi-project switching |
| `projects.spec.ts` | Server project management |
| `publish.spec.ts` | Publishing with server |
| `relationships-tab.spec.ts` | Relationship management |
| `server-unavailable.spec.ts` | Server unavailability |
| `simple.spec.ts` | Basic end-to-end |

### Screenshot Tests (`e2e/screenshots/`)
| File | Feature |
|------|---------|
| `about-screenshots.spec.ts` | About page |
| `admin-ai-screenshots.spec.ts` | Admin AI settings |
| `admin-kill-switch-screenshots.spec.ts` | AI kill switch |
| `documents-list-screenshots.spec.ts` | Documents list tab |
| `element-ref-screenshots.spec.ts` | Element references |
| `project-rename-screenshots.spec.ts` | Project renaming |
| `pwa-screenshots.spec.ts` | Main UI (bookshelf, editor, dialogs, media, setup) |
| `quick-open-screenshots.spec.ts` | Quick open feature |
| `relationships-tab-screenshots.spec.ts` | Relationships UI |
| `setup-screenshots.spec.ts` | Setup flow (mobile) |
| `tags-screenshots.spec.ts` | Tags management |
| `templates-tab-screenshots.spec.ts` | Templates UI |

## Continuous Integration

### Run Tests for CI
```bash
npm run e2e:ci
```
This will:
- Run local tests first, then online tests
- Run with retries (1-3 attempts)
- Capture screenshots on failure
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
npx ng serve                  # For local/screenshot tests
npx ng serve --port 4400      # For online tests (with proxy)
```

### Backend Not Running (Online Tests)
**Solution**: Start the backend
```bash
cd ../backend && bun run dev   # Starts on port 9333
```

### Tests Timing Out
**Solution**: Increase timeout in individual tests
```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test code
});
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TEST_ENV` | Select config: `local`, `online`, `docker`, `wrangler`, `screenshots` |
| `API_BASE_URL` | Override backend URL for online tests |
| `CLOUDFLARE_FRONTEND_URL` | Frontend URL for Cloudflare deployed tests |
| `CI` | Set to `1` for CI mode |

## Resources

- [Playwright Documentation](https://playwright.dev)
- [E2E README](./README.md)
- [Best Practices](./BEST_PRACTICES.md)
- [Test Coverage Matrix](./COVERAGE.md)

---

**Quick Stats:**
- Total E2E Spec Files: ~56
- Estimated Total Tests: ~300
- Coverage: Authentication, Projects, Documents, Folders, Media, Publishing, Admin, About, Settings, Setup, MCP
