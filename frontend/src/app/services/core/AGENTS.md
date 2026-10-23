# Core services: agent notes

Notes for `StorageContextService`, `AppModePolicyService` and
`BackgroundService`. The rules in the root and `frontend/AGENTS.md` still apply.

## Local document storage is profile-scoped

Prose documents and worldbuilding docs are cached in IndexedDB (y-indexeddb)
under `storageContext.prefixDocumentId(docId)` — e.g. `local:alice:novel:<id>`,
`srv:<configId>:alice:novel:<id>` or `local:worldbuilding:alice:novel:<id>` —
just like the elements doc. **Only the local database name carries the prefix;
the WebSocket document id stays the bare `username:slug:elementId`** (for
worldbuilding too — the `worldbuilding:` marker is local-only). Every path
that opens a document database must use the prefixed name: the editor and
`WorldbuildingService` connections, headless reads (`getLocalStateDigest`,
`getDocumentContent`, `getYDoc`), headless sync (`syncDocumentToServer` /
`syncWorldbuildingToServer`, which take a `sourceConfigId` for migrations and
are called with bare ids), `LiveDocumentRegistryService.hasLocalContent`,
`ProjectStateService.isDocumentUnavailable`, import, Cloud Sync's
`YDocAccessService` (which takes bare ids and prefixes them), the project
reset/purge paths, and the project rename/migration services. Because of this,
`StorageContextService.clearContextData()` (profile disconnect, account
deletion) removes a profile's documents and worldbuilding data without
touching another profile's copy of the same `username:slug`, and
`renameProjectInContext()` moves both.

## Project rename has one local path

`StorageContextService.renameProjectInContext()` (called through
`ProjectRenameMigrationService` for the active profile, and by
`ProfileManagerService.upgradeInto` for a copied profile). It merges each
old-slug Yjs database — `<prefix>u:s:*` and `<prefix>worldbuilding:u:s:*` —
into its new name with `cloneDatabase` and deletes the original, then rekeys
media/snapshots/activations/saved tabs (`documentCache`)/project cache, the
project list and the project tree's saved state (`projectTreeStateKey`).
`cloneDatabase` never overwrites an existing target: y-indexeddb `updates`
records are appended under fresh keys, other records only fill free keys.
Don't add a second copy step in front of it. The server side of a rename is
described in `backend/AGENTS.md`.

## APP_MODE (which profiles may be added)

`APP_MODE` (`ONLINE` | `LOCAL` | `BOTH`, backend env, sent as `appMode` in
`/config/features`) is the admin's policy for adding profiles. The frontend
reads it in one place, `AppModePolicyService`, and every path that creates a
profile asks it: setup, the profile manager (add server, add Browser, upgrade,
add cloud storage), the user menu's upgrade button.

- **The home server decides, not the active profile**:
  `resolveHomeServerUrl()` is the ingress origin, the build's `apiUrl`, or the
  page's own origin (no apiUrl: Docker/binary).
  Another server added as a profile has no say.
- `ONLINE` forbids Browser **and** Cloud Sync (both store in the browser);
  `LOCAL` forbids adding servers.
- **Fetching is lazy** (`ready()`): Browser/Cloud Sync profiles must not
  contact a server (the local e2e fixtures fail on any `/api/` request), so
  only setup, the profile manager's upgrade/add-server views, and the user
  menu/profile manager *while a server profile is active* call it.
- The last reported mode is cached per home server
  (`inkweld-app-mode-policy`). An unreachable server keeps the cached mode;
  never fall back to `SystemConfigService`'s "server unavailable" defaults
  here (they say `LOCAL`). With nothing cached, nothing is restricted.
- Existing profiles always keep working: switching to them, and reconnecting a
  cloud profile (`?mode=cloud&provider=` is allowed on an `ONLINE` site when
  the device already has a profile for that provider; the callback then only
  restores credentials for an account already linked here).
- `environment.autoConfigure` is a first-run convenience only and must not
  restrict anything by itself. Ingress / hosted auto-configuration bypasses
  the policy (it isn't a user adding a profile).

## App backgrounds (login / home)

The full-screen background behind the login page and home screen is
admin-configurable and optionally user-personalisable, driven by CSS custom
properties. Admin-facing docs: `docs/site/docs/admin-guide/appearance.md`.

**Do not reference `/home_background.png` in a component stylesheet.** Use the
mixins in `frontend/src/themes/_app-background.scss`:

```scss
@use '../../../themes/app-background' as appBackground;

.my-hero-surface {
  @include appBackground.surface($attachment: fixed); // omit for centred views

  &::before {
    // …the existing full-bleed scrim…
    @include appBackground.scrim-blur();
  }
}
```

- `BackgroundService` resolves the background and writes `--app-bg-image` /
  `--app-bg-color` / `--app-bg-filter` / `--app-bg-scrim-override` onto
  `document.documentElement`. The defaults in `theme.scss` are what renders
  before it runs, in LOCAL mode, and when the server is unreachable.
- Precedence: **user preference → admin surface config → bundled default**.
- Two surfaces: `login` (pre-auth) and `app`/`home` (post-auth). Both live on the
  same `.content-container` element in `home.component.html`, so the component's
  constructor `effect()` calls `setSurface()` as authentication resolves. A user
  preference only ever affects the post-auth surface — nobody is signed in when
  the login page renders.
- An unset login background **inherits the home one** (resolved server-side in
  `appearance.service.ts`), so one upload brands both.
- **Two spellings of the blur, deliberately.** `--app-bg-filter` is a standalone
  `backdrop-filter` value (`none` when off, which also avoids creating a
  compositing layer). `--app-bg-blur-fn` is appended to scrims that already have
  their own filter list via `var(--app-bg-blur-fn, )`, because a CSS filter list
  cannot contain the keyword `none`. The service *removes* the second property
  rather than blanking it.
- The scrim opacity arrives as `--app-bg-scrim-override` on the root and is read
  through a `var()` fallback chain in `home.component.scss`. It has to work that
  way round: a `:host` declaration out-specifies anything set on `:root`, but
  custom-property *values* still inherit into it.
- Uploaded images use a "single-slot" storage API (`saveSlotImage` /
  `getSlotImage` on the backend `StorageService`), namespaced `branding` (admin,
  two slots) and `backgrounds` (one per user). On the filesystem the extension
  records the stored content type and reads probe for it, because `sharp` is
  unavailable on Workers and the upload is then stored untranscoded.
- `GET /api/v1/appearance/config` and `/appearance/background/{surface}` are
  **unauthenticated by necessity** — the login page resolves its background
  before anyone can sign in — which also makes branding images world-readable.
  `/appearance/user-background` is authenticated and self-only; there is no
  `/:username/` form of it.
- Background presets are CSS gradients, not image files. The visuals live in
  `frontend/src/app/config/background-presets.ts`; the ids are mirrored in
  `BACKGROUND_PRESET_IDS` in `backend/src/services/appearance.service.ts` for
  server-side validation. **Keep the two lists in step.**
- Values reaching a CSS `url()` token are validated on both sides
  (`isSafeExternalImageUrl` in the backend, `isSafeUrlToken` in the service) so a
  stored value cannot break out of the token. The localStorage first-paint cache
  is re-validated on read for the same reason.
