# AI Agent Instructions for Inkweld

Inkweld is a collaborative creative writing platform. This file holds the rules
that apply to every change. Notes for one area live in `AGENTS.md` files next
to the code (`frontend/`, `backend/`, and folders below them); **before
changing code in an area, read the `AGENTS.md` files on the path to it** if your
tool hasn't loaded them already. Longer design notes are in the developer docs
(`docs/site/docs/developer/`). The full map is at the end.

## Stack

- **Frontend** (`frontend/`): Angular, standalone components, Vitest +
  Playwright, Transloco i18n. Rules: `frontend/AGENTS.md`.
- **Backend** (`backend/`): Hono on Bun (also Node and Cloudflare Workers),
  Drizzle ORM on SQLite/D1, LevelDB per project (Durable Objects on Workers).
  Rules: `backend/AGENTS.md`.
- **Real-time**: Yjs CRDTs over WebSocket, offline-first with IndexedDB.
- **Shared packages** (`packages/`): `inkweld-async`, `inkweld-canvas`,
  `inkweld-presence`, `inkweld-prosemirror`.

## Rules for every change

1. **Bun installs only.** Run `bun install` from the repo root. Never run
   `npm install` / `npm ci` inside `frontend/`, `backend/` or `docs/site/`
   (a `preinstall` guard errors). `npm test`, `npm run lint`,
   `npm run e2e` are fine.
2. **Tests.** Every change needs test coverage and all tests must pass.
   Frontend: `npm test` (Vitest), **never `bun test`**, never Jasmine.
   Backend: `bun test`.
3. **Verify before declaring done**: `bun run verify` runs type checking,
   lint, the unit tests (packages, frontend, backend) and a docs build. It
   passes only when the last line reads `--- verify (fast) passed in <N>s ---`.
   Use `bun run verify:e2e` or `bun run verify:full` when e2e tests or the
   docs screenshots are affected.
4. **Never disable a lint rule** without asking the user first; fix the issue
   instead. Document any approved exception in a comment.
5. **No summary markdown files** (FIXES.md, STATUS.md, …) unless asked;
   summarize in chat. Keep `AGENTS.md` files, READMEs and docs up to date when
   behaviour changes.
6. **Never edit `frontend/src/api-client/`.** After an API change, regenerate:
   `cd backend && bun run generate:openapi && bun run generate:angular-client`
   (needs a Java runtime). CI's "OpenAPI Spec + Client Freshness" job fails if
   `backend/openapi.json` or the client are stale.
7. **Never push to `production`** unless asked: it deploys inkweld.app. It only
   fast-forwards to a commit already on `main`
   (`git push origin origin/main:production`). `main` deploys
   preview.inkweld.app. Deploy steps live in
   `deploy-cloudflare-reusable.yml`; see
   `docs/site/docs/admin-guide/ci-cd.md`.

## Commands

```bash
bun install              # from the repo root
npm run dev              # frontend :4200 + backend :8333
npm test                 # all unit tests
npm run lint             # npm run lint:fix to auto-fix
bun run format           # bun fmt; format:check only reports
npm run typecheck        # every TS project, via `bun check`
bun run verify           # the pre-completion check
bun run deploy           # interactive deployment wizard
```

API docs (Swagger UI) are served at <http://localhost:8333/api>.

**Type checking** uses `bun check` (Bun ≥ 1.4.3), a typescript-go port that
reports the same errors as `tsc`. It is the only check on specs, e2e and the
backend: Vitest, Playwright and `bun test` strip types without checking them,
and `ng build` covers only the app sources. It follows TypeScript 7, so an
option TS 7 removed (e.g. `baseUrl`) is an error even though `tsc` 6 accepts
it. `frontend/tsconfig.json` only references the real projects
(`"files": []`), so check it with `bun check -b`.

## Code style

- Prettier and ESLint configs are in each package. `bun fmt` formats (it
  reads `.prettierrc*`); ESLint does not check formatting, so run
  `bun run format` and `npm run lint:fix` before committing
  (`bun run format:check` is what verify and CI run). TypeScript strict
  mode; small, focused functions; comment complex logic; follow the
  surrounding patterns.
- **Awaiting in loops**: SonarCloud flags `await` in a loop (S9382) and
  `async` functions with no `await` (S7503). Don't disable the rules.
  Independent iterations: `await Promise.all(items.map(...))`, or
  `mapWithConcurrency` (`backend/src/utils/concurrency.ts`) /
  `forEachConcurrent` (`@inkweld/async`) when the fan-out must be bounded.
  Work that must run in order (ordered writes, IndexedDB transactions on one
  database, rate-limited calls, progress, early exit): `@inkweld/async`'s
  `forEachSequential`, `mapSequential`, `firstResultSequential`,
  `forEachPage`, `chunk`, with a one-line comment saying why it is
  sequential. An `async` function that never awaits: drop `async` and return
  `Promise.resolve(...)` / `Promise.reject(...)`; if the body can throw
  synchronously and callers rely on a rejection, keep `async` and
  `return await` the promise.

## Releases and versioning

release-please cuts releases (`.github/workflows/release-please.yml`,
`release-please-config.json`); the process is under "Releasing" in
`docs/site/docs/admin-guide/ci-cd.md`.

- **PR titles are the changelog.** PRs are squash-merged, so the Conventional
  Commit title decides the bump (`fix` patch, `feat` minor, `!` major; during
  the 1.0 beta every release is the next `1.0.0-beta.N`) and the CHANGELOG
  line. `docs`/`refactor`/`test`/`build`/`ci`/`chore`/`style` are hidden and
  never cause a release; Renovate uses `chore(deps)`. `feat`/`fix` titles
  also show up as highlights in the in-app update dialog
  (`frontend/scripts/write-sw-app-data.ts` writes them into `ngsw.json`
  `appData`), so write them for users.
- **Scopes come from `.github/commit-scopes.json`.** A scope is optional; when
  used it must be on that list (CI checks it), and each one has the emoji
  `release-please.yml` adds to its release-note entries
  (`scripts/add-scope-emoji.mjs`). Add a new scope there in the PR that
  needs it.
- **Never bump versions by hand.** release-please updates the three
  `package.json` files and every line marked `// x-release-please-version`
  (`backend/src/config/env.ts`, `frontend/src/environments/environment*.ts`).
  A new hardcoded app version needs that marker and an `extra-files` entry.
  `MIN_CLIENT_VERSION` and the OpenAPI `info.version` are compatibility/API
  versions, not the app version.
- `CHANGELOG.md` is rendered in-app (About → Changelog) by `ChangelogService`,
  which parses `## [X.Y.Z] - date` and release-please's
  `## [X.Y.Z](compare-url) (date)` headings. Don't add a `## [Unreleased]`
  section: release-please inserts new entries above the first `## [` heading.
- Tags pushed by release-please don't trigger workflows (GITHUB_TOKEN), so it
  calls `release.yml` (multi-arch Docker image) via `workflow_call`.
- **Upgrade path commitment.** From 1.0.0-beta.1 on, every release must
  upgrade automatically from any earlier one (README "Status"): forward
  Drizzle migrations only, local IndexedDB/Yjs data upgraded in place, and
  archives at every earlier `ARCHIVE_VERSION` still importable. A change that
  would make users export, reset or migrate by hand needs an automatic
  migration instead.
- Versions can carry a pre-release suffix (`1.0.0-beta.1`);
  `version-compatibility.service.ts` compares only `MAJOR.MINOR.PATCH`.

## Gotchas that apply anywhere

- **Yjs Document ID Trailing Slash**: the frontend uses
  `username:slug:elements`, the backend/MCP `username:slug:elements/`.
  **This is not a bug; do not "fix" it.** y-websocket normalizes them. If you
  see it while debugging sync, look elsewhere.
- **Local document databases are profile-scoped**: IndexedDB names carry
  `storageContext.prefixDocumentId(docId)`; WebSocket ids stay bare.
  (`frontend/src/app/services/core/AGENTS.md`)
- **AI kill switch**: every new endpoint that sends content to an AI provider
  must be gated with `requireAiEnabled` and listed in
  `backend/test/ai-kill-switch.test.ts`. Frontend AI features gate on the
  user's AI preference too. (`backend/AGENTS.md`, `frontend/AGENTS.md`)
- **Backend routes that edit a Yjs document** use `openEditableDocument()`,
  never `yjsService` directly: `yjsService` is Bun-only and crashes on
  Workers. (`backend/AGENTS.md`)
- **Storage quotas**: every server write that adds project storage calls
  `quotaService.assertCanStore()`; Yjs editing/sync is never blocked.
  (`backend/AGENTS.md`)
- **Bulk sync is conservative**: the planner may cause extra syncs, never a
  missed edit. Never use a Durable Object's `snapshot` key as a revision
  token. (`frontend/src/app/services/sync/AGENTS.md`,
  `backend/src/durable-objects/AGENTS.md`)
- **Never construct the ProseMirror `Schema` in `packages/inkweld-prosemirror`**;
  it breaks typing in the editor. (`frontend/src/app/components/element-ref/AGENTS.md`)
- **The built `index.html` must contain no inline script**
  (`inlineCritical: false` stays) and `script-src` never gets
  `'unsafe-inline'`. (`docs/site/docs/developer/legal-pages-and-custom-html.md`)
- **The frontend must work under a path prefix** (Home Assistant ingress):
  relative asset URLs, `appUrl()` / `appOrigin()` for navigations.
- **Ingress headers are trusted by TCP peer only**, never by
  `X-Forwarded-For`. (`docs/site/docs/developer/home-assistant-ingress.md`)
- **Passkey timestamps are seconds**; the frontend multiplies by 1000. Passkey
  ceremonies use `rpFromRequest(c)`. (`docs/site/docs/developer/passkeys.md`)
- **Wrangler is pinned to exactly 4.116.0 with a local patch.** Don't change it
  to a range. (`backend/AGENTS.md`)
- **Reserved usernames** (`privacy`, `terms`, `share`, `delete-account`) back
  real routes; frontend ones stay above the `:username` route.
- **Mirrored lists** must stay in step: `schemaContentHash` (frontend and
  backend `utils/schema-hash.ts`, same golden hash) and the background preset
  ids (`background-presets.ts` ↔ `BACKGROUND_PRESET_IDS`).
- **Project archive format changes** bump `ARCHIVE_VERSION`
  (`frontend/AGENTS.md`).
- **No hardcoded user-facing English** in the frontend; use Transloco keys.

## Where the details live

| Topic | Location |
|---|---|
| Angular conventions, tests, e2e, i18n, frontend-wide rules | `frontend/AGENTS.md` |
| Hono conventions, migrations, AI kill switch, quotas, serving `index.html`, auth, rename, share links, sync manifest | `backend/AGENTS.md` |
| Durable Object storage and revision tokens | `backend/src/durable-objects/AGENTS.md` |
| Profile-scoped storage, project rename, APP_MODE, app backgrounds, update dialog | `frontend/src/app/services/core/AGENTS.md` |
| Starting offline, bulk sync planner | `frontend/src/app/services/sync/AGENTS.md` |
| Canvas Yjs model | `frontend/src/app/services/canvas/AGENTS.md` |
| Passkeys and policy acceptance (frontend) | `frontend/src/app/services/auth/AGENTS.md` |
| WebMCP browser tools | `frontend/src/app/services/webmcp/AGENTS.md` |
| EPUB output, published file share links | `frontend/src/app/services/publish/AGENTS.md` |
| Per-element schema copies, identity images | `frontend/src/app/services/worldbuilding/AGENTS.md` |
| Template (schema) editor | `frontend/src/app/components/worldbuilding/AGENTS.md` |
| Editor schema and tables | `frontend/src/app/components/element-ref/AGENTS.md` |
| Markdown input rules | `frontend/src/app/components/editor-input-rules/AGENTS.md` |
| Conversations (speech-bubble documents) | `frontend/src/app/components/conversation/AGENTS.md` |
| Shared ProseMirror specs | `packages/inkweld-prosemirror/AGENTS.md` |
| Architecture, real-time layer, bulk sync design | `docs/site/docs/developer/architecture.md` |
| Passkeys (key files, data flow, env vars) | `docs/site/docs/developer/passkeys.md` |
| Legal pages, custom HTML, CSP, service worker hash | `docs/site/docs/developer/legal-pages-and-custom-html.md` |
| Account deletion | `docs/site/docs/developer/account-deletion.md` |
| Home Assistant ingress | `docs/site/docs/developer/home-assistant-ingress.md` |
| Project archives | `docs/site/docs/developer/project-archives.md` |
| Cloud Sync | `docs/site/docs/developer/cloud-sync.md` |
| CI/CD, hosted deploys, wrangler pin history | `docs/site/docs/admin-guide/ci-cd.md` |
| Sync capacity (admin view) | `docs/site/docs/admin-guide/sync-capacity.md` |
| E2E practices | `frontend/e2e/BEST_PRACTICES.md` |
| Getting started | `docs/site/docs/getting-started.md` |

If you hit a pattern or trap that isn't covered, add it to the `AGENTS.md`
closest to the code it concerns, and add a one-line pointer here only if it
can bite anywhere in the repo.
