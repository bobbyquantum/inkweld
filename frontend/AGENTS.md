# Frontend: agent notes

Angular (standalone components, signals, RxJS services), Vitest for unit tests,
Playwright for e2e, Transloco for i18n. The root `AGENTS.md` rules still apply.
Feature-specific notes live in `AGENTS.md` files next to the code (listed at the
end).

## Commands

```bash
npm run dev          # Dev server (localhost:4200)
npm test             # Vitest. NEVER `bun test`: Bun's runner can't run Angular tests
npm test -- --include=<path>
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
- **Leaving a page destroys it.** `CustomRouteReuseStrategy` keeps no page
  for a later visit, so `ngOnInit` reads the query params and resets the
  form on every visit. Don't bring back a page cache: a kept page skipped
  `ngOnInit` and came back as it was left. A navigation that stays on the
  same route (only the params or query params change) reuses the component
  in place, so read params from the observables or set
  `data: { reuseComponent: false }` to get a fresh component, as setup and
  the project tabs do.

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
- **Never hold a `setTimeout` mock that runs its callback on the spot across an
  `await`.** Spec files in a worker share globals (`isolate: false`), so a real
  timer left by an earlier test can fire during the wait. If it reschedules
  itself through the mock, as a `ReconnectScheduler` whose attempt fails at once
  does, the loop never yields to the event loop: no timer fires again, not even
  the test timeout, and the worker runs out of heap. Confine the mock to one
  synchronous call (`runWithImmediateTimers` in `document.service.spec.ts`).
- **A delayed `URL.revokeObjectURL` from an earlier spec file can land in your
  test.** `setup-vitest.ts` replaces the mock for each spec file, but the late
  call looks up the global when it runs, so it reaches the current mock. After
  an `await`, assert on a URL only your test uses
  (`not.toHaveBeenCalledWith(url)`), not `not.toHaveBeenCalled()`. The default
  `URL.createObjectURL` mock returns `blob:mock-url` for every caller, so give
  your test its own value first
  (`vi.spyOn(URL, 'createObjectURL').mockReturnValue(...)`).
- **Specs must pass in any locale and time zone.** Contributors run them on
  their own machines, Windows included, where `toLocaleString()` and `Intl`
  without a locale follow the machine's settings (the `number` pipe doesn't:
  `LOCALE_ID` is `'en'`). Build expected text with the same call as the code
  (`(1000).toLocaleString()`), and give date inputs the local times the UI
  produces (`new Date(2025, 0, 15)`, not `'2025-01-15T00:00:00Z'`). To check,
  run `bun exec "export TZ=Pacific/Kiritimati LC_ALL=fr_FR.UTF-8; npm test"`
  here, and again with `ar_EG.UTF-8` for non-Latin digits. `bun exec` runs it
  in Bun's shell, so the same line works in bash, PowerShell and Command
  Prompt; keep the `export`, because an inline `TZ=… npm test` there doesn't
  replace a `TZ` the machine already sets. `TZ` works on every OS, but Node
  reads `LC_ALL` only on Linux and macOS: on Windows the locale is the
  regional format in Settings (Time & language → Language & region), so
  change it there to try another.

## E2E tests (Playwright)

Read `e2e/BEST_PRACTICES.md` before writing one.

- Select with `data-testid`, never text or class.
- Fixtures per suite: `e2e/{local,online,mcp,screenshots}/fixtures.ts`
  (`authenticatedPage`, `anonymousPage`). Shared helpers: `e2e/common/`.
- Local-mode suites fail on any `/api/` request.
- A spec that changes an instance-wide setting must start its own backend with
  `e2e/common/isolated-backend.ts` (online config, `E2E_BACKEND_RUNTIME=bun`),
  or it breaks specs running in parallel. Restoring the setting afterwards is
  not enough: an account registered while `PASSWORD_LOGIN_ENABLED` is off has no
  password, and the spec that registered it fails much later.
- A test can take twice as long in a full parallel run as it does alone, so one
  that passes alone can still run past the 30 s default. Check a long test in a
  full run, and give it `test.slow()` if it really needs the time.
- The online backend opts into `PASSWORD_LOGIN_ENABLED=true` and
  `EMAIL_RECOVERY_ENABLED=true` (`playwright.online.config.ts`) because the
  fixtures use the password API.
- Every job traces the first attempt of each test and uploads
  `test-results/`; open a trace with `npx playwright show-trace <trace.zip>`.
- **Touch gestures**: Playwright's touchscreen only taps. Send swipes and
  long-press drags as raw touch points over CDP (`Finger` in
  `e2e/local/project-tree-touch.spec.ts`); Chromium holds back `touchmove`
  until the finger leaves a slop region of about 15 px.
- **Reduced motion changes drop timing.** The suites run with
  `reducedMotion: 'reduce'`, which gives every element a 0.01 ms transition
  (`src/themes/theme.scss`), so the CDK animates each drop and
  `cdkDragEnded` fires after the dragged row's `touchend`. Without the
  preference, as for most users, the drop doesn't animate and the drag ends
  first. Test what happens on release under
  `page.emulateMedia({ reducedMotion: 'no-preference' })`.

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
- **Every API path segment goes through `encodePathSegment()`**
  (`utils/url-path.ts`), which percent-encodes it and throws for `.`, `..`
  and non-strings. Hand-built paths call it for each segment; the generated
  API client calls it for every path parameter (`encodeApiPathParam` in
  `config/api.config.ts`), so a generated call given such a value throws
  synchronously, before any request; a caller outside a `try` handles that
  (`UserAvatarComponent` falls back to its generated avatar). Ids read from
  project data are checked before they name a server resource: comment
  thread and message ids must be UUIDs (`isCommentId` in
  `services/project/comment.service.ts`; the comment popover shows and acts
  on a server thread only once it has loaded the open mark's thread, and
  shows any other server comment as unavailable), and a `media://` filename
  must be one plain path segment (`safeMediaReferenceFilename` /
  `isSafeMediaFilename` in `utils/media-reference.ts`), else it resolves to
  no image without a request.
- **Backgrounds**: never reference `/home_background.png` in a component
  stylesheet; use the mixins in `src/themes/_app-background.scss`
  (`services/core/AGENTS.md`).
- **AI features**: gate them on `SystemConfigService.isAiOffForUser`,
  `isAiAutoReviewEnabled` or `isAiImageGenerationEnabled`, which combine the
  server kill switch with the user's own "No AI / Allow AI" preference
  (`SettingsService.aiAllowed`, default No AI). The browser keeps a copy
  that `AiPreferenceSyncService` keeps in step with the server account's
  `aiAllowed` (`GET`/`PATCH /users/me`): an unsynced change made in the
  browser is sent up, otherwise the account wins. Change the choice only
  through `setAiAllowed`, which marks it unsynced. The raw
  `isAiKillSwitchEnabled` is for admin pages only.
- **Adding profiles**: every path that creates a profile asks
  `AppModePolicyService` (`APP_MODE`); see `services/core/AGENTS.md`.
  A profile never changes server, and a new server never takes the id of
  another server's profile (same file, "Server profile ids").
- **The session token only goes to the active profile's server.** A manual
  `Authorization` header or a socket token comes from
  `AuthTokenService.getTokenForUrl(url)` with the URL being contacted (`null`
  for any other server), never straight from `getToken()`. `AuthInterceptor`
  applies the same rule to `HttpClient` requests, and tokens are only
  written through `AuthTokenService`, which records each one's server
  (`services/auth/AGENTS.md`).
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
- **CDK drag and drop**: on release the CDK emits `cdkDragEnded` before
  `cdkDropListDropped`, so a drop handler can't read state that the drag-end
  handler clears (see `drop()` in `components/project-tree/`).

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

**Error codes** of errors thrown as `PasskeyError` or `UserServiceError` are
mapped to keys in `services/core/error-translation.service.ts`; add new codes
there and the key to the right JSON file. Unmapped errors fall back to
`errors.unknown`. Sign-in callback codes are mapped separately (below).

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

**Sign-in callback codes**: OIDC sign-in failures and GitHub's `email_in_use`
arrive on `/oauth/callback` as `?error=<code>` (GitHub's other failures still
redirect to `/?error=…`). `ERROR_MESSAGE_KEYS` in `OAuthCallbackComponent`
maps the codes that have their own message (`email_in_use` →
`auth.oauthCallback.emailInUse`); add new ones there. Any other code shows
`errors.unknown`.

**Adding a locale**: copy `public/assets/i18n/en/` to `<lang>/` and translate
it; register the Angular locale data (`registerLocaleData`) and add
`{ id, label }` to `availableLangs` in `app.config.ts`; make sure
`transloco-loader.ts` loads its scope files; add its translations to
`src/testing/transloco-test-provider.ts`. The language switcher in General
Settings appears once there is more than one language.

## Feature notes next to the code

| Area | Notes |
|---|---|
| Profile-scoped storage, server profile ids, profile upgrades, project rename, APP_MODE, backgrounds, update dialog | `src/app/services/core/AGENTS.md` |
| Starting offline, bulk sync planner | `src/app/services/sync/AGENTS.md` |
| Canvas Yjs model | `src/app/services/canvas/AGENTS.md` |
| Where the session token is sent, passkeys, policy acceptance | `src/app/services/auth/AGENTS.md` |
| WebMCP tools | `src/app/services/webmcp/AGENTS.md` |
| EPUB output, share links | `src/app/services/publish/AGENTS.md` |
| Per-element schema copies, identity images | `src/app/services/worldbuilding/AGENTS.md` |
| Template (schema) editor | `src/app/components/worldbuilding/AGENTS.md` |
| Editor schema and tables | `src/app/components/element-ref/AGENTS.md` |
| Markdown input rules | `src/app/components/editor-input-rules/AGENTS.md` |
| Conversations | `src/app/components/conversation/AGENTS.md` |
