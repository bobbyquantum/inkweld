# Backend: agent notes

Hono on Bun (also Node and Cloudflare Workers), Drizzle ORM on SQLite/D1,
LevelDB per project for Yjs documents (Durable Objects on Workers). The root
`AGENTS.md` rules still apply. Architecture overview:
`docs/site/docs/developer/architecture.md`.

## Conventions

- **Run on Bun**: `bun run dev` (localhost:8333), `bun test`, `bun run lint`.
  Not `npm` or `node`.
- **Type imports**: import Hono and Request/Response types with `import type`.
- Follow Hono middleware patterns; validate requests and responses with
  OpenAPI/Zod schemas (`src/schemas/`); return proper HTTP status codes.
- **API changes** need the OpenAPI spec and Angular client regenerated (see the
  root `AGENTS.md`); CI fails if they are stale.
- **Migrations**: `drizzle/` starts from a single `0000_baseline.sql` generated
  from `src/db/schema/`. Its statements use `IF NOT EXISTS` so a database
  created by the pre-squash migrations (the preview D1) records it as a no-op.
  Add new migrations with `bunx drizzle-kit generate` on top of it; never
  hand-patch columns at startup. Never squash or rewrite migrations again:
  every release since 1.0.0-beta.1 must upgrade automatically from any
  earlier one (root `AGENTS.md`, "Releases and versioning").
- **Sessions** are JWT bearer tokens (HS256, 30 days), not cookies; revoke them
  by bumping `users.sessionsValidFrom`. CSRF protection covers every
  state-changing request.
- **Per-project LevelDB**: each project has its own LevelDB instance, shared
  by all its documents through `YjsService.getPersistenceForProject()`. Never
  open a second handle for a project, and never `await` between looking the
  handle up and storing a new one: a client opens many documents at once, and
  a second handle can't take the LevelDB lock, so y-leveldb drops every write
  through it with only a console warning. Close handles with
  `releasePersistence()`, which waits for the lock before a reopen.
- **MCP canvas tools** (`mcp/tools/canvas.tools.ts`) only do the storage; what
  they accept and return is in `@inkweld/canvas`, shared with WebMCP. An edit
  must also mirror the canvas onto its element's `canvasConfig` metadata, which
  archives, templates and the media-usage scan read.
- **MCP upload URLs** (`routes/mcp-upload.routes.ts`) authenticate by the token
  in the path, since the caller is an agent's HTTP tool. Anything added there
  must re-check what the token was issued against. A tool's links for its caller
  use `ctx.requestOrigin`, not BASE_URL, which can be out of date. Details:
  `docs/site/docs/developer/mcp-oauth.md`.
- **Yjs document ids**: the backend/MCP use `username:slug:elements/` with a
  trailing slash, the frontend without. Not a bug; don't "fix" it.
- **HTTP routes that edit a Yjs document** must work on both runtimes.
  `yjsService` is Bun-only: on Workers it opens LevelDB and crashes the request
  with `indexedDB is not defined`. Use `openEditableDocument(documentId,
  documentRuntime(c))` (`services/yjs-document-access.ts`). On Bun it returns
  the live document. On Workers it loads a copy from the project DO's
  `GET /api/document-state`, and `commit()` sends only that copy's changes back
  as a `yUpdate`. AI auto-review uses it.

Layout of `src/`: `config/` (environment, route registration), `db/` (Drizzle
schema), `durable-objects/` (Workers), `middleware/` (auth, session, CSRF,
errors), `mcp/` (Model Context Protocol), `routes/`, `schemas/` (Zod/OpenAPI),
`services/` (business logic), `types/`, `utils/`.

## AI kill switch

`AI_KILL_SWITCH` (default ON = all AI disabled; the env var locks it) is
enforced on the server, not only by the UI hiding buttons. **Every new endpoint
that sends content to an AI provider must be gated** with `requireAiEnabled`
from `src/utils/ai-kill-switch.ts` (a 403 with `code: 'AI_DISABLED'`),
registered with `.use(path, …)` *before* the route handler. Use
`isAiKillSwitchOn(db)` / `resolveAiKillSwitch(value)` instead of reading the
config key yourself — they apply the env lock. Admin configuration endpoints
stay open so AI can be set up before the switch is turned off.
`test/ai-kill-switch.test.ts` lists the gated endpoints; add new ones there.

## Sync capacity (per-user storage quotas)

Each account has an allowance for the server storage of the projects it owns
(Yjs data + media + covers + published files). `users.syncQuotaBytes` is the
per-user override (`NULL` = instance default `SYNC_QUOTA_DEFAULT_BYTES`,
100 MB) and `users.storageUsedBytes` a fast running counter. Admin guide:
`docs/site/docs/admin-guide/sync-capacity.md`.

- **Off by default** (`SYNC_QUOTA_ENABLED=false`) so an upgrade never starts
  refusing uploads. Usage is measured and shown either way; the
  `GET /users/me/storage` response carries `enabled`.
- **Every write that adds project storage goes through
  `quotaService.assertCanStore()`** (media upload, cover upload, published
  file, MCP `apply_image` and `create_media_upload` URLs), and project creation
  through `assertCanCreateProject()`. A new storage write path must do the same, and
  pass `replacedBytes` when it overwrites a file so only the growth is charged.
  Deletions credit the counter (`recordDeletion`): media `DELETE`, cover
  delete, published-file delete, project delete (measured before teardown).
- **Yjs editing/sync is never blocked**, nor reads/exports/deletes. Don't add a
  quota check to the WebSocket or document paths.
- The counter drifts both ways (high: an uncounted deletion; low: Yjs growth
  is never counted), so `checkEnforcement` only trusts it while fresh: it may
  accept a write for `RECONCILE_MAX_AGE_MS` (10 min) after a recompute and
  refuse one for `RECONCILE_COOLDOWN_MS` (1 min); otherwise it reconciles
  against real storage first. Specs that need the fast path stamp the counter
  with `quotaService.persistUsage()`, and reset with
  `quotaService.clearReconcileCooldown()`.
- A refusal is **403 with `code: 'QUOTA_EXCEEDED'`** (and `reason`), so the
  client can tell it apart from an access-control 403.

## Serving index.html (custom HTML, CSP, ingress)

Details: `docs/site/docs/developer/legal-pages-and-custom-html.md` and
`docs/site/docs/developer/home-assistant-ingress.md`.

- `index.html` requests always go through `respondWithInjectedIndex()`, even
  when a `.br` variant exists, so admin custom HTML is substituted and the CSP
  header is sent. Keep any new serve path consistent with this.
- Never remove the `<!-- INKWELD_HEAD_EXTRA -->` / `<!-- INKWELD_BODY_EXTRA -->`
  markers when nothing is configured, and keep `ngsw.json` served through
  `patchNgswIndexHash()`: the service worker rejects an `index.html` whose hash
  differs from `ngsw.json`.
- Custom HTML is deliberately unsanitized; `injectCustomHtml` uses function
  replacements to avoid `$&` patterns.
- CSP (`src/utils/csp.ts`): never add `'unsafe-inline'` to `script-src`;
  `frontend/public/_headers` must carry the same base policy (`csp.spec.ts`
  checks).
- **Ingress trust is by TCP peer, never by header** (`src/utils/ingress.ts`,
  `INGRESS_TRUSTED_PROXY`). Don't switch it to `getClientIp()` /
  `X-Forwarded-For`. An ingress session is only valid for the Home Assistant
  user making the request (`ingressSessionMatches`).

## Auth and accounts

- Passkey ceremonies must use `rpFromRequest(c)`, not `rpFromContext(c)`, so
  the hosted app's origin is accepted when `ALLOW_INKWELD_APP_CLIENT` is on.
  A new origin check must include `getInkweldAppClientOrigins()` too. Passkey
  timestamps are stored in **seconds**. Details:
  `docs/site/docs/developer/passkeys.md`.
- `PASSWORD_LOGIN_ENABLED` and `EMAIL_RECOVERY_ENABLED` default to `false`
  (passwordless-first). The online e2e backend opts into both.
- **Account deletion** (`account-deletion.service.ts`, shared by self-service
  and admin deletion) reserves with `userService.reserveForDeletion()` — never
  by disabling the account, which breaks the Durable Object wipe — and tears
  down every owned project before deleting the user row. Details:
  `docs/site/docs/developer/account-deletion.md`.

## Projects and storage

- **Project rename** (`PUT /projects/:u/:s` with a new `slug`) moves
  everything stored under the slug before the database update, in
  `moveProjectData` (`services/project-data.service.ts`). A failed step undoes
  the earlier ones, newest first, and the project keeps its old slug.
  - Files: `StorageService.moveProjectDirectory`, a directory rename on disk,
    and in R2 a copy of every `<user>/<slug>/` object followed by deleting the
    originals only after all copies succeed (a retry skips objects already
    copied). **Anything new stored per project must live under that prefix**,
    or move with it.
  - Documents on Bun: LevelDB names each document by its full id
    (`u:slug:docId`, and `…/`), so after the directory moves
    `yjsService.renameProjectDocuments` rewrites the names. Moving the
    directory alone leaves the renamed project empty on the server.
  - Documents on Workers: the Durable Object is copied to the object of the
    new slug (`prepareProjectDurableObjectMove`, see
    `src/durable-objects/AGENTS.md`) and the old object is wiped once the
    database has the new slug.
- **A new project starts empty**: `POST /projects` runs `removeProjectData`
  (Yjs documents, project directory or R2 prefix, Durable Object; the same
  helper delete and account deletion use) for the new slug right after
  inserting the row. Renames from before documents moved left populated
  Durable Objects and R2 objects under old slugs, and older deletes left whole
  project directories, so a project created there would open with that data.
  It runs after the insert because the Durable Object only lets the project's
  owner wipe it, and because a duplicate create then fails on the unique index
  before it can wipe the winner's data. If the wipe fails, the row is removed
  without a tombstone (`discardCreated`) and the create returns 500; an
  existing tombstone is only cleared once the wipe has succeeded.
- **Share links**: the share page (`routes/share-page.routes.ts`) is served by
  the API server. Build its URL with `getPublicApiUrl(c)`, never `getBaseUrl`
  (SITE_URL is the frontend on split deployments). `share` is a reserved
  username. Details: `frontend/src/app/services/publish/AGENTS.md`.
- **Sync manifest** (`GET /projects/:u/:s/docs/sync-manifest`,
  `services/document-revision.service.ts`) returns an opaque revision token per
  document. On Bun it is the document's LevelDB update clock
  (`yjsService.getDocumentRevisions`), read under **both** `<id>/` (how
  WebSocket-edited docs are stored) and `<id>` (MCP/backend writers) — a single
  clock when one exists, `slash/bare` when both do. Workers tokens come from
  the Durable Object (`src/durable-objects/AGENTS.md`). `revision: null` means
  "never persisted"; `unknown: true` means "could not read, sync it".
- **Mirrored lists**: `src/utils/schema-hash.ts` must stay byte-equivalent to
  `frontend/src/app/utils/schema-hash.ts` (both specs assert the same golden
  hash), and `BACKGROUND_PRESET_IDS` in `services/appearance.service.ts` must
  match `frontend/src/app/config/background-presets.ts`.

## Wrangler version pin

`package.json` pins `wrangler` to an **exact** `4.116.0` with a local patch
(`patches/wrangler@4.116.0.patch` via `patchedDependencies`), and Renovate is
disabled for it. **Do not change it to a range or drop the patch**: newer
releases (and unpatched 4.116.0) crash `wrangler dev` mid-run in CI
(cloudflare/workers-sdk#15317). If you must bump it, regenerate the patch with
`bun patch wrangler`. Full history, the crash mechanism and when to unpin:
`docs/site/docs/admin-guide/ci-cd.md` → "Wrangler version pin".
