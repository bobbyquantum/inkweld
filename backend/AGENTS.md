# Backend: agent notes

Hono on Bun (also Node and Cloudflare Workers), Drizzle ORM on SQLite/D1,
LevelDB per project for Yjs documents (Durable Objects on Workers). The root
`AGENTS.md` rules still apply. Architecture overview:
`docs/site/docs/developer/architecture.md`.

## Conventions

- **Run on Bun**: `bun run dev` (localhost:8333), `bun test`, `bun run lint`.
  Not `npm` or `node`.
- **Type imports**: import Hono and Request/Response types with `import type`.
- **NODE_ENV**: read it through `config/runtime-env.ts`, never as
  `process.env.NODE_ENV` or `process.env['NODE_ENV']`: Bun's bundler replaces
  both with their build-time value, so the compiled Docker binary would keep
  the build machine's environment. Security-relevant decisions use
  `runtimeEnv(c.env)`: pass the request's bindings (on Workers `[vars]` are not
  in `process.env`), and a Worker without a NODE_ENV binding counts as
  production. `configuredNodeEnv()` also falls back to the value Wrangler wrote
  into the bundle, so it is only for the log format and the switches the
  Wrangler e2e backend turns off with NODE_ENV=test.
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
  state-changing request. MCP OAuth sessions outlive a login, so they check the
  same watermark and `enabled`/`approved` on every request and refresh
  (`mcpOAuthService.isSessionRevoked`). A new way to end a user's sessions also
  calls `mcpOAuthService.revokeUserSessions`, as `userService` does.
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
  archives, templates and the media-usage scan read: `commit({ mirrorCanvas })`,
  which on Workers leaves it to the Durable Object. Mirroring on a Worker's copy
  misses other edits, and overlapping copies leave the element in the project
  several times.
- **MCP upload URLs** (`routes/mcp-upload.routes.ts`) authenticate by the token
  in the path, since the caller is an agent's HTTP tool. Anything added there
  must re-check what the token was issued against. A URL works once because
  `createProjectFile` only stores a file that isn't there; checking first is not
  enough. A tool's links for its caller use `ctx.requestOrigin`, not BASE_URL,
  which can be out of date. Details: `docs/site/docs/developer/mcp-oauth.md`.
- **Yjs document ids**: the backend/MCP use `username:slug:elements/` with a
  trailing slash, the frontend without. Not a bug; don't "fix" it.
- **Read-only sockets**: a viewer's socket may send only sync step 1 and
  awareness. `isYjsFrameBlockedForViewer` (`utils/yjs-document-utils.ts`)
  enforces it for both runtimes and for frames queued before auth. It reads
  the types with lib0's `readVarUint`, as the sync handlers do. Never judge a
  client's frame by its raw bytes: a padded varuint (`0x82 0x00` is 2) reads
  differently, and that let viewers' updates through.
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
registered with `.use(path, …)` _before_ the route handler. Use
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
  file, MCP `apply_image`, `create_media_upload` URLs and `save_canvas_image`),
  and project creation
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
- **Overlapping writes**: `assertCanStore` counts a write in the same SQL
  statement that checks it fits, and a reconcile doesn't store its figure over a
  counter that moved while it measured. Keep it in the database: a promise or
  lock shared between requests isn't safe on Workers.
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

## Rendering canvases on the server

`render_canvas` and `save_canvas_image` draw through `services/canvas-render/`.
Docs: `docs/site/docs/developer/mcp-oauth.md`.

- **The WebAssembly and the fonts reach each runtime differently**, so an entry
  point registers them: `registerCanvasRenderAssets` in `bun-app.ts` and
  `node-app.ts` (`assets.file.ts`, `with { type: 'file' }`) and in
  `cloudflare-runner.ts` (`assets.worker.ts`, Wrangler bundles the `.wasm` as a
  compiled module, since Workers cannot compile at run time). Nothing registered
  means the tools answer "not available".
- **`resvg` and its render result must be `free()`d.** WebAssembly memory is not
  garbage collected.
- **Rebuild the font pack** with `bun scripts/build-canvas-font-pack.ts` after
  changing `CANVAS_BUNDLED_FONTS` or the font files. It checks the files against
  `frontend/scripts/font-digests.json`.
- **Never fetch an image from a URL stored in a canvas**, and check a stored
  `media:` reference with `isMediaReference` before using it as a filename:
  anyone with edit access can store any value, through the sync socket as well.
- **Check an image's pixels, not just its file size** (`readImageSize`): a 1.5 MB
  PNG of one colour can decode to gigabytes, and WebAssembly memory never shrinks.
- **Text outside `CANVAS_BUNDLED_FONTS` isn't the only difference from the app**:
  the server's measurements have no kerning, so a line very close to its width
  can break differently. `text-layout.ts` follows Konva's search on purpose,
  including what it does when letter spacing makes widths shrink.

## Auth and accounts

- **Signing key**: session tokens, MCP OAuth tokens, the MCP layer's own
  tokens and the Durable Object all get it from `signingSecret(c.env)`
  (`config/signing-secret.ts`), never from `config.databaseKey` directly. The
  rule is `chooseSigningKey` in `config/env.ts`: DATABASE_KEY, else
  SESSION_SECRET. Outside development/test, no key, the development key or a
  sample value from the docs (`PUBLISHED_KEYS`) is refused; a key shorter than
  32 characters is refused everywhere, except that a short DATABASE_KEY is
  passed over for a usable SESSION_SECRET (with a warning), because it still
  encrypts stored settings. A refusal throws `SigningSecretError` (a generic
  500 and one log line). Bun and Node also check at start-up, more strictly:
  a short DATABASE_KEY stops them. Resolve the key outside any `try` that turns
  failures into "invalid token" (the Durable Object answers with
  `access-denied:error` or a 500), so a missing key is a server error and
  clients keep their tokens. When the list of sample values changes, keep
  `SAMPLE_SECRETS` in step: `configService` also reads settings stored under
  any published key and stores them again under the configured one. The
  Docker image's entrypoint (`scripts/docker-entrypoint.sh`) generates a key in
  `/data/.inkweld-key` when neither variable is set, and sets
  `WEBAUTHN_RP_ID=localhost` (derive from `ALLOWED_ORIGINS`) when that is
  unset, so an install made before the image ran with the production checks
  still starts after an upgrade.
- Passkey ceremonies must use `rpFromRequest(c)`, not `rpFromContext(c)`, so
  the hosted app's origin is accepted when `ALLOW_INKWELD_APP_CLIENT` is on.
  A new origin check must include `getInkweldAppClientOrigins()` too. Passkey
  timestamps are stored in **seconds**. Details:
  `docs/site/docs/developer/passkeys.md`.
- `PASSWORD_LOGIN_ENABLED` and `EMAIL_RECOVERY_ENABLED` default to `false`
  (passwordless-first). The online e2e backend opts into both.
- **OIDC** (`routes/oidc-auth.routes.ts`, `services/oidc-auth.service.ts`):
  accounts are keyed by issuer and subject, never linked by email. Compare `iss`
  with the issuer discovery returned, not `new URL().href`, which adds a slash
  that providers such as Pocket ID don't publish. `OIDC_ONLY` is enforced on the
  server, so a new route that signs someone in or creates an account must refuse
  while it is on. Only a fresh instance elects an admin. Details:
  `docs/site/docs/configuration.md`.
- **GitHub** (`routes/github-auth.routes.ts`,
  `userService.createOrUpdateGithubUser`): accounts are keyed by `githubId`,
  never linked by email. The `githubId` lookup runs before any email check,
  so an account linked to the id is never refused over its address (accounts
  from earlier versions may share one). The service ignores an address
  unless `emailVerified` is true, and compares addresses ignoring letter
  case. A new GitHub identity whose verified email another account already
  uses gets `GithubEmailInUseError`, which the callback turns into
  `/oauth/callback?error=email_in_use&provider=github`; it is neither
  attached to that account nor given a second one with the address. A linked
  account's stored email only changes to a verified address no other account
  uses. Details: `docs/site/docs/admin-guide/github-oauth.md`.
- **Usernames**: a name given to a new account is 3 to 39 ASCII letters,
  digits, `-` and `_` (39 is GitHub's limit), not reserved
  (`RESERVED_USERNAMES` and `RESERVED_STORAGE_NAMES`), and must not match an
  existing name ignoring case (`schemas/auth.schemas.ts`). Registration and
  check-username refuse other names; GitHub, OIDC and ingress sign-up derive a
  free one with `userService.availableUsername` (`name-2`, …). Compare names
  with `lower(username)`, which the `users_username_lower_idx` index serves
  (not unique: older accounts may differ only in case). `userService.create`
  repeats the check inside its INSERT, so an overlapping sign-up fails with
  the username unique error (`isUsernameConflict`); a new insert path into
  `users` must do the same. Never apply the rule on lookup or sign-in:
  accounts created before it keep their names and must keep working. The
  registration form checks the same rule
  (`frontend/src/app/utils/username-rules.ts`); keep the two in step.
- **Older usernames in storage and document ids**: usernames name storage
  directories, R2 keys and Yjs document ids. Both storage adapters refuse a
  username or slug that isn't one segment (`utils/storage-segment.ts`: no
  `/`, `\`, `..` or NUL); deleting a project or an account passes
  `skipUnstorableFiles` to `removeProjectData` so such an account can still be
  removed, leaving its files alone. MCP's `getProjectByKey` refuses a username
  or slug containing `:`, which would turn `username:slug:…` into another
  project's id. On disk, `sharesProjectDirectory` refuses a project slug
  another account whose username folds to the same name already has
  (case-insensitive file systems would give them one directory).
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

## Sync socket input

Details: `backend/src/routes/README_YJS.md`.

- **Document ids from a client go through `parseDocumentId`**
  (`utils/yjs-document-id.ts`), the one parser the Bun route, the Worker route
  and the Durable Object share: `owner:slug:docName`, non-empty parts, at most
  one trailing `/`. The first two parts always name the project (a
  `worldbuilding:` prefix is not stripped; clients never send it), so the
  access check, the LevelDB store and the Durable Object agree. A new route
  that takes a document id from a client uses it too. `YjsService` refuses ids
  it rejects, and its per-project helpers skip keys they cannot parse.
- **Sync and awareness messages are checked before they are applied**, on both
  runtimes (`isYjsMessageWithinLimits`, `utils/yjs-message-limits.ts`): an
  update must decode completely and its JSON values may nest at most
  `MAX_YJS_JSON_DEPTH` (256) levels. Whatever a document or awareness state
  holds is encoded again for every client, compaction and export, so a new
  path that applies Yjs content from a client checks it the same way. The
  server's `Awareness` publishes no state and has its interval stopped
  (`stopAwarenessInterval` in `yjs.service.ts`, as in the Durable Object).
- **No error may escape a Bun socket handler.** Hono's Bun adapter does not
  await `onMessage`, and Bun ends the process when a socket callback or timer
  throws or a rejection goes unhandled. Catch in every handler, listener and
  timer (each close-cleanup step runs on its own, `runCloseStep`), give
  fire-and-forget promises a `.catch`, and read client frames with helpers
  that return null rather than throw (`peekFrameTag`). The logger
  `bun-runner.ts` and `node-runner.ts` install
  (`utils/unhandled-rejection.ts`) is only a backstop.

## Wrangler version pin

`package.json` pins `wrangler` to an **exact** `4.116.0` with a local patch
(`patches/wrangler@4.116.0.patch` via `patchedDependencies`), and Renovate is
disabled for it. **Do not change it to a range or drop the patch**: newer
releases (and unpatched 4.116.0) crash `wrangler dev` mid-run in CI
(cloudflare/workers-sdk#15317). If you must bump it, regenerate the patch with
`bun patch wrangler`. Full history, the crash mechanism and when to unpin:
`docs/site/docs/admin-guide/ci-cd.md` → "Wrangler version pin".
