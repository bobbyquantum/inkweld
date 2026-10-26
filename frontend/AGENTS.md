# Frontend: agent notes

Angular (standalone components, signals, RxJS services), Vitest for unit tests,
Playwright for e2e, Transloco for i18n. The root `AGENTS.md` rules still apply.
Feature-specific notes live in `AGENTS.md` files next to the code (listed at the
end).

## Commands

```bash
npm run dev          # Dev server (localhost:4200)
npm test             # Vitest. NEVER `bun test`: Bun's runner can't run Angular tests
npm test -- <file-pattern>
npm run lint         # npm run lint:fix to auto-fix
npm run e2e          # Playwright (npm run e2e:ci in CI mode)
npm run storybook    # Component workbench (localhost:6006)
```

Never run `npm install` here; install from the repo root with `bun install`.

## Angular conventions

- Everything is standalone; no NgModules.
- **`inject()` for dependency injection, never constructor injection.**
- **Built-in control flow only**: `@if`/`@else` (with `as` when useful),
  `@for` with `track` on a unique id (not identity) and `@empty`, `@switch`.
  No `*ngIf`, `*ngFor`, `*ngSwitch`.
- Signals for reactive state where appropriate; strict typing, no `any`.
- Alias imports (`@components`, `@services`, …).
- Never edit `src/api-client/`; it is generated (see the root `AGENTS.md`).

`src/app/` holds `components/` (shared UI), `pages/` (routed pages),
`dialogs/`, `services/`, `guards/`, `interceptors/`, `models/`, `pipes/`,
`config/`, `utils/` and `editor/` (a barrel of ProseMirror plugin factories so
`document.service.ts` doesn't import from `components/`).

## Unit tests (Vitest)

- `*.spec.ts` next to the code. Coverage thresholds: 80% statements,
  functions and lines; 60% branches.
- Use `vitest-mock-extended` for deep mocks. Never Jasmine.
- Add `translocoTestProvider()` (`src/testing/transloco-test-provider.ts`) to
  `imports` in `TestBed.configureTestingModule()` for any component that
  translates.
- The API client returns `Observable<HttpEvent<T>>`; in tests, use an `obs()`
  helper returning `Observable<any>` for mock return values.

## E2E tests (Playwright)

Read `e2e/BEST_PRACTICES.md` before writing one.

- Select with `data-testid`, never text or class.
- Fixtures per suite: `e2e/{local,online,mcp,screenshots}/fixtures.ts`
  (`authenticatedPage`, `anonymousPage`). Shared helpers: `e2e/common/`.
- Local-mode suites fail on any `/api/` request.
- A spec that changes an instance-wide setting must start its own backend with
  `e2e/common/isolated-backend.ts` (online config, `E2E_BACKEND_RUNTIME=bun`),
  or it breaks specs running in parallel.
- The online backend opts into `PASSWORD_LOGIN_ENABLED=true` and
  `EMAIL_RECOVERY_ENABLED=true` (`playwright.online.config.ts`) because the
  fixtures use the password API.
- Every job traces the first attempt of each test and uploads
  `test-results/`; open a trace with `npx playwright show-trace <trace.zip>`.

## Rules that apply across the app

- **Local document databases are profile-scoped.** Every path that opens a
  prose or worldbuilding IndexedDB database uses
  `storageContext.prefixDocumentId(docId)`; the WebSocket id stays bare. See
  `services/core/AGENTS.md`, which also covers the single project-rename path
  (`renameProjectInContext()`; don't add a second copy step).
- **The app must work under a path prefix** (Home Assistant ingress). Use
  relative asset URLs (`assets/…`, not `/assets/…`) and `appUrl()` /
  `appOrigin()` from `utils/app-base.ts` for full-page navigations, new
  windows and server URLs. Under ingress, sign-out and the account/server
  switcher are hidden.
- **Backgrounds**: never reference `/home_background.png` in a component
  stylesheet; use the mixins in `src/themes/_app-background.scss`
  (`services/core/AGENTS.md`).
- **AI features**: gate them on `SystemConfigService.isAiOffForUser`,
  `isAiAutoReviewEnabled` or `isAiImageGenerationEnabled`, which combine the
  server kill switch with the user's own "No AI / Allow AI" preference
  (`SettingsService.aiAllowed`, default No AI, per browser). The raw
  `isAiKillSwitchEnabled` is for admin pages only.
- **Adding profiles**: every path that creates a profile asks
  `AppModePolicyService` (`APP_MODE`); see `services/core/AGENTS.md`.
- **Storage quota errors** are 403 with `code: 'QUOTA_EXCEEDED'`; tell them
  apart from access errors with `getQuotaExceeded()` /
  `StorageUsageService.noteQuotaError()`, and only warn when
  `StorageUsageService.enforced` is true. A refused media upload throws
  `MediaQuotaExceededError`, stops the batch and pauses background uploads for
  `QUOTA_UPLOAD_PAUSE_MS` (`services/local/media-sync.service.ts`); files stay
  local. Manual "Upload all" and a server-side media delete lift the pause.
  Deleting media in the Media tab (server mode) deletes the server copy first
  and keeps the local copy if that fails.
- **Project archives** (`.inkweld.zip`): when the format changes, bump
  `ARCHIVE_VERSION` in `models/project-archive.ts`, document it in that
  file's version-history JSDoc, and make
  `services/project/project-import.service.ts` upgrade the previous version
  (tested in its spec). Since 1.0.0-beta.1, dropping support for an older
  archive version is not an option (root `AGENTS.md`, "Releases and
  versioning").
  `ARCHIVE_VERSION` (file format) and the backend `PROTOCOL_VERSION` (live Yjs
  sync) are separate. Docs: `docs/site/docs/developer/project-archives.md`.
- **Markdown input rules** are opt-in (`components/editor-input-rules/AGENTS.md`).

## Internationalization (Transloco)

**Never hardcode user-facing English strings.** English is the source
language; translations are JSON files per locale and scope in
`public/assets/i18n/<lang>/<scope>.json` (`common`, `app`, `login`, `home`,
`settings`, …). `transloco-loader.ts` merges the scope files, `app.config.ts`
configures `provideTransloco()` with `autoPrefixKeys: false` (full dot-notation
keys), and `services/core/locale.service.ts` persists the active language.

- **Templates**: `{{ 'login.myNewField' | transloco }}`.
- **TypeScript**: `inject(TranslocoService).translate('login.welcomeBack', { username })`.
- **Keys**: scope prefix for scope strings (`login.title`, `home.syncAll`);
  shared strings flat at the root (`cancel`, `close`, `retry`); dots for
  grouping (`login.errors.loginFailed`); `{{param}}` for interpolation.
- Components with no user-facing strings (e.g. `AriaTabPanelComponent`,
  `TreeNodeIconComponent`) don't use Transloco.

**Error codes** are mapped to keys in `services/core/error-translation.service.ts`;
add new codes there and the key to the right JSON file. Unmapped errors fall
back to `errors.unknown`.

| Error class | Code | Translation key / behaviour |
|---|---|---|
| `PasskeyError` | `CANCELLED` | Silent |
| `PasskeyError` | `PENDING_APPROVAL` | Redirect to `/approval-pending` |
| `PasskeyError` | `VERIFICATION_FAILED` | `login.errors.verificationFailed` |
| `PasskeyError` | `NETWORK_ERROR` | `login.errors.networkError` |
| `PasskeyError` | `UNSUPPORTED` | `login.errors.unsupported` |
| `PasskeyError` | `ACCOUNT_DISABLED` | `login.errors.accountDisabled` |
| `UserServiceError` | `LOGIN_FAILED` | `login.errors.loginFailed` |
| `UserServiceError` | `ACCOUNT_PENDING` | Redirect to `/approval-pending` |

**Adding a locale**: copy `public/assets/i18n/en/` to `<lang>/` and translate
it; register the Angular locale data (`registerLocaleData`) and add
`{ id, label }` to `availableLangs` in `app.config.ts`; make sure
`transloco-loader.ts` loads its scope files; add its translations to
`src/testing/transloco-test-provider.ts`. The language switcher in General
Settings appears once there is more than one language.

## Feature notes next to the code

| Area | Notes |
|---|---|
| Profile-scoped storage, project rename, APP_MODE, backgrounds, update dialog | `src/app/services/core/AGENTS.md` |
| Starting offline, bulk sync planner | `src/app/services/sync/AGENTS.md` |
| Canvas Yjs model | `src/app/services/canvas/AGENTS.md` |
| Passkeys, policy acceptance | `src/app/services/auth/AGENTS.md` |
| WebMCP tools | `src/app/services/webmcp/AGENTS.md` |
| EPUB output, share links | `src/app/services/publish/AGENTS.md` |
| Per-element schema copies, identity images | `src/app/services/worldbuilding/AGENTS.md` |
| Template (schema) editor | `src/app/components/worldbuilding/AGENTS.md` |
| Editor schema and tables | `src/app/components/element-ref/AGENTS.md` |
| Markdown input rules | `src/app/components/editor-input-rules/AGENTS.md` |
| Conversations | `src/app/components/conversation/AGENTS.md` |
