---
sidebar_position: 5
title: Cloud Sync
---

# Cloud Sync

Cloud Sync is Inkweld's third storage mode, alongside Browser mode and Realtime
Sync (an Inkweld server). The user's own cloud storage holds a mirror of their
projects, so they can move between devices without an Inkweld server or an
Inkweld account. Identity comes from the provider account.

Dropbox, Google Drive and Nextcloud (WebDAV) are wired today. The design is
provider-neutral so OneDrive and S3-compatible stores can be added as adapters.

## How it fits the app

- `StorageConfigType` gains a third value, `cloud`. Everywhere the frontend
  decides between "talk to an Inkweld server" and "use browser storage", cloud
  mode takes the browser-storage path (`isLocalOrCloudMode`). Project
  activation treats cloud like server mode: projects from other devices appear
  as cards and are pulled in full only when activated.
- Each connected account gets its own storage context, prefixed
  `cloud-<provider>-<accountHash>:`, so two accounts on one browser never mix.
- Provider OAuth uses PKCE in the browser. There is no client secret anywhere in
  the frontend. Dropbox uses "App folder" access, so Inkweld can only see its
  own folder.
- Nextcloud has no usable OAuth for public clients (its OAuth2 server needs a
  client secret, and neither it nor Login Flow v2 sends CORS headers), so the
  user supplies a server address and a per-app password instead. Credentials
  are sent as HTTP basic auth over WebDAV and never expire on their own, so
  `normalizeNextcloudServerUrl` rejects anything but HTTPS except loopback
  hosts used for local development.
- **Nextcloud quirks handled by the adapter.** A `PUT` into a folder that does
  not exist answers `404` (RFC 4918 says `409`); both trigger folder creation
  and one retry. The store remembers every folder it has created or listed so
  later files in the same folder cost a single request; without that a first
  sync pays one failed `PUT` plus one `MKCOL` per ancestor for every file.
  `ETag`/`OC-ETag` on a `PUT` response is only readable when the CORS layer
  exposes it; when it is missing the store falls back to a `PROPFIND` for the
  version. Expect a first sync of a few hundred files to take minutes on a
  server with slow round trips.

## Profiles on the device

Every storage configuration is presented to the user as a **profile**: one
author identity on one backend. `ProfileManagerService`
(`services/core/profile-manager.service.ts`) is the single place that
switches, removes, resets, and describes them; the profiles dialog, the
user-menu switcher and the Profile settings tab are thin views over it.

- **Ids.** The first Browser profile keeps the legacy id `local`; further ones
  are `local-<hash(username)>`. The first profile on a server keeps
  `hash(serverUrl)`; a second author on the same server gets
  `<hash(serverUrl)>-<hash(username)>`. Cloud profiles are
  `cloud-<provider>-<hash(accountId)>`. Each id is its own storage prefix, so
  profiles never share IndexedDB databases, localStorage keys or tokens.
- **Login binding.** `StorageContextService.adoptServerLogin` runs after every
  server login. If the active server profile has no user or the same user,
  the profile is updated in place. If a different author logs in, the login
  is moved to that author's profile (found or created), the auth token is
  carried across, and the app reloads into the new storage context. The
  migration dialog avoids the fork by passing the username to
  `configureServerMode` before logging in.
- **Remove** clears the profile's credentials (auth token or cloud token),
  deletes every IndexedDB database and localStorage key under its prefix,
  then removes the configuration. Remote data is never touched. If the
  active profile goes, the most recently used remaining one becomes active;
  with none left the app returns to the welcome screen.
- **Storage scan** (`StorageContextService.describeContextData` and
  `findOrphanedData`) lists what each prefix holds and finds prefixes that
  no configuration owns any more, so leftovers can be cleaned up.
- **Connecting a cloud account** never adopts a profile silently. When the
  folder already has authors, `CloudSyncConnectService` returns
  `choose-profile` and the welcome screen offers each author (with a project
  count) or "Add a new profile". Continuing as an author creates or finds the
  local profile for that username (`cloud-<provider>-<hash>` for the first
  author, `-<hash(username)>` appended for further ones), copies the account's
  provider tokens to it, and reloads. Adding an author appends to the
  manifest's `profiles` with optimistic concurrency.
- **Upgrading into an account that already has this author** compares the
  source's project slugs with the author's slugs in the manifest. Clashing
  projects get a new address on the welcome screen before anything is copied;
  `StorageContextService.renameProjectInContext` then renames the copies
  (Yjs databases, media/snapshot/activation records and the project list)
  inside the new profile only. The source profile is never modified.
- **Upgrade** (Browser to cloud) is `ProfileManagerService.upgradeInto`: after
  the normal cloud connect flow creates the new profile,
  `StorageContextService.cloneContextData` copies every localStorage key and
  IndexedDB database from the source prefix to the target prefix (a generic
  IndexedDB clone: same version, stores, indexes and keys), the author keeps
  the same username so project paths match (the welcome screen shows it
  read-only; the copied projects are owned by it, and a different username
  would leave them under another author and keep the Browser profile), the
  Browser profile is removed, and the app reloads into the new profile. A
  Browser placeholder name (`Local User`) is replaced by the account's name. Activations travel with the data, so the engine's first full pass
  pushes every project to the cloud folder. The pending upgrade is remembered
  in sessionStorage across the OAuth redirect. Upgrading to a server reuses
  the migration flow.
- **Migration history** is recorded with `StorageContextService.recordMigration`
  when projects are copied from one profile to another (e.g. Browser to a
  server): both configurations get a `MigrationRecord` with the other side's
  id and name, the username used on the destination, the project count and a
  timestamp. The profiles list renders it as a one-line history.
- The server a hosted build ships with is re-created on every load, so it is
  shown as **built in** and cannot be removed.

## Remote layout

Everything lives inside the provider app folder:

```
/manifest.json
/projects/<username>/<slug>/project.json        title, description, dates (last writer wins)
/projects/<username>/<slug>/elements.yjs        full Yjs state of the elements doc
/projects/<username>/<slug>/documents/<id>.yjs  prose documents (ITEM elements)
/projects/<username>/<slug>/worldbuilding/<id>.yjs
/projects/<username>/<slug>/snapshots/<docId>/<snapshotId>.json  version history entries
/projects/<username>/<slug>/media.json          media index: mime type, filename, size
/projects/<username>/<slug>/media/<mediaId>     raw blob bytes
```

Yjs files contain `Y.encodeStateAsUpdate(doc)`. Merging is `Y.applyUpdate`, so
two devices that edited the same document before either synced converge
without a conflict dialog. Canvas, timeline and relationship-chart data live
inside the elements doc, so those three files cover a whole project.

### The manifest

`manifest.json` is the one file every device reads first and writes last. It
carries the author profiles that sync through this account (`profiles`, with
the legacy single `profile` still pointing at the first one), the project list
with covers, and deletion tombstones. One account can hold several authors;
each owns the projects under its username, and a device only follows the
projects of the author it is signed in as. Entries merge by key with
last-writer-wins on `updatedAt`; a tombstone beats any edit made before the
deletion. Writes use the provider's version tag for optimistic concurrency and
re-merge on conflict.

## Sync algorithm

`CloudProjectMirrorService` handles one project. For each Yjs file it keeps a
local record (`CloudSyncStateService`, prefixed IndexedDB) of the remote
version tag last seen and the local state vector last pushed.

1. If the remote version tag moved, download and `Y.applyUpdate` into the
   local doc (the live doc when an editor has it open, otherwise a headless
   IndexedDB load).
2. If the local state vector differs from what the remote now holds, upload
   the full state.
3. Media is content-addressed by id, so it is a set difference each way.
4. Snapshots (version history) are immutable and keyed by UUID, so they are a
   set difference each way too. Deleting a snapshot is not propagated yet.
5. `project.json` is last writer wins by `updatedDate`.

`CloudSyncEngineService` decides when to run: app start, project open, a few
seconds after the last local edit, window focus, coming back online, a
one-minute timer while visible, and "Sync now" in the user menu. A full pass
also adopts projects created elsewhere (as deactivated cards, downloading only
the cover) and applies deletions both ways.

## Nextcloud adapter

`NextcloudRemoteStore` (`services/cloud-sync/nextcloud/`) maps the store
contract onto plain WebDAV against `remote.php/dav/files/<loginName>/Inkweld/`:

| Operation | WebDAV                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `list`    | `PROPFIND` `Depth: 1`, walked folder by folder when recursive                                                                         |
| `stat`    | `PROPFIND` `Depth: 0`                                                                                                                 |
| `get`     | `GET`; version is the `ETag`                                                                                                          |
| `put`     | `PUT`, with `If-Match` when `ifVersion` is given (412 = conflict); on 409 the parent folders are `MKCOL`ed and the write retried once |
| `delete`  | `DELETE`; 404 is success                                                                                                              |

Nextcloud disables `Depth: infinity` by default, which is why recursive
listing walks. The layout is shallow (five levels at most) so this costs a
handful of requests per project.

`connectNextcloud` in `CloudSyncConnectService` verifies the credentials with a
`PROPFIND` on the user's files root before storing anything. A `TypeError` from
`fetch` there is reported as "unreachable" and the setup page points at the
Nextcloud guide, because from a web origin that is almost always the server
not sending CORS headers. Nextcloud's WebDAV does not emit them out of the
box; the user guide walks admins through the WebAppPassword app or a
reverse-proxy rule. The account id is `<serverUrl>#<loginName>`, so the same
login on two servers gets two storage contexts.

## Google Drive adapter

`GoogleDriveRemoteStore` (`services/cloud-sync/google-drive/`) asks only for
the `drive.appdata` scope, so
everything lives in Drive's hidden `appDataFolder`: the user cannot browse or
edit the files (they are Yjs state, not readable documents anyway), and
Inkweld cannot see the rest of their Drive. A user removes the data with
"Delete hidden app data" under Drive settings → Manage apps; to take a copy
elsewhere they export a project archive.

Drive addresses files by id, and a folder hierarchy would mean creating and
resolving folders on every write, so the layout is **flat**: each file sits
directly in `appDataFolder` and its name is its full store path
(`/projects/alice/novel/elements.yjs`). The store keeps an in-memory index of
path to file:

- The first call builds it from one paged `files.list` (`spaces=appDataFolder`),
  taking a Changes API start token first so nothing written during the
  listing is missed.
- After that, `changes.list` from the saved token brings it up to date, so an
  unchanged account costs one request. `list` and `delete` always poll;
  `stat`, `get` and `put` reuse an index polled in the last
  `INDEX_FRESHNESS_MS` (5 s), so a sync pass polls about once. An expired
  token (410) rebuilds from a listing.
- `get` returns the version from the index, read before the bytes, so the
  version can lag the content (the next pass downloads again) but never lead
  it (which would hide a change). A 404 re-polls once and follows the path's
  current file.

| Concern         | How the adapter handles it                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version tag     | `headRevisionId`, which only moves on content changes; `version` as fallback                                                                                                                                                                                                                                                                                                                                                                          |
| Duplicate names | Drive allows them, so two devices creating one path at once leave two files. Everyone reads and writes the oldest (`createdTime`, then id); a successful write deletes the rest. The device that wrote a removed copy still has the data and re-pushes it when it sees the version move. Writes to one path are serialized on each device, and a path missing from the index is re-polled before creating, so a device never duplicates its own files |
| `ifVersion`     | Drive v3 has no conditional update. The live version is fetched just before the write and compared; a write landing in between is not detected, which the manifest merge tolerates                                                                                                                                                                                                                                                                    |
| Uploads         | Multipart (create) or media (update) up to 5 MB; larger bodies use a resumable session sent in one `PUT`                                                                                                                                                                                                                                                                                                                                              |
| Folder delete   | Every file whose name has the folder prefix, four at a time                                                                                                                                                                                                                                                                                                                                                                                           |
| Errors          | 401 → `RemoteReauthRequiredError` (the token is marked expired, so sync pauses and the next request renews it; never a disconnect); 429 or 403 `rateLimitExceeded`/`userRateLimitExceeded` → `RemoteRateLimitError` (Retry-After, else 10 s); 404 → `RemoteFileNotFoundError`                                                                                                                                                                         |

Specs run against `FakeGoogleDrive` (`services/cloud-sync/testing/`), an
in-memory imitation of the endpoints the store calls.

### Sign-in without a refresh token

Google issues refresh tokens to a "Web application" client only in exchange
for its client secret, even with PKCE, and Cloud Sync has no server to keep a
secret. So Google uses the browser token flow (`response_type=token`,
`google-auth.ts`): the redirect carries a one-hour access token in the URL
fragment and nothing else. `CloudSyncConnectService.completeGoogleAuthorization`
takes it from the callback page, identifies the account with
`about.get` (`user.permissionId` is the account id, the email is kept as
`loginHint`), and joins the usual profile flow.

`GoogleDriveAuthService` keeps the token alive:

1. From ten minutes before expiry, a hidden iframe asks again with
   `prompt=none` and `login_hint`. This works when the browser sends Google's
   cookies to the iframe (Chrome does; Safari and Firefox usually don't). A
   failure is not retried for five minutes.
2. If that fails, the next click anywhere in the app opens a popup with the
   same request. For a user still signed in to Google it closes itself within
   a second or so. It opens on one click only; after that "Sync now" (or the
   retry on the sync strip) opens it.
3. If the token expires first, the store throws `RemoteReauthRequiredError`
   and the engine goes to `paused`: credentials are kept, edits wait locally,
   and the next renewal resumes sync. Unlike `RemoteAuthError` this never
   disconnects the profile. A 401 from Drive (a token revoked early, or a
   skewed clock) is handled the same way: the store marks the token expired
   and pauses.

A renewed token is stored only after `about.get` confirms it belongs to the
connected account (`permissionId`). `login_hint` is only a hint, and in the
popup the user could pick another account, whose app data folder sync would
otherwise read and overwrite.

Renewals redirect to the same registered callback URL, marked by a `state`
starting `renew.`. `main.ts` checks for that before bootstrapping
(`relayGoogleAuthResponse`): it posts the fragment on the
`inkweld-google-auth` BroadcastChannel, removes the token from the address
bar, closes a popup, and does not start the app inside the iframe or popup.
The CSP's `frame-src` allows `https://accounts.google.com` for the iframe.

**Separate Google Cloud projects per deployment.** The app data folder belongs
to the Cloud project, so preview and production must use different projects
(not two clients in one project), just as Dropbox uses two apps. A shared
folder is unsafe: an older build treats a newer manifest version as unreadable
and rebuilds it, dropping other authors and tombstones. The preview project
also covers `localhost`. PR previews live on per-PR `pages.dev` hosts that
Google cannot allow-list (no wildcard origins), so their builds leave the
client id empty.

## Configuration

Provider app keys are public OAuth client identifiers and ship in the browser
bundle via the environment file:

```ts
cloudSync: {
  dropbox: { appKey: '...' },
  'google-drive': { appKey: '<client id>.apps.googleusercontent.com' },
},
```

An empty key hides the provider from the setup page. Nextcloud needs no key
and is always offered (`KEYLESS_CLOUD_PROVIDERS`), so Cloud Sync appears even
in a build with no OAuth keys. The Cloudflare deploy
workflow reads `DROPBOX_APP_KEY` and `GOOGLE_DRIVE_CLIENT_ID` from the GitHub
environment's variables. The Google client is a "Web application" client
whose authorized JavaScript origins and redirect URIs list the frontend
origin; its client secret is never used. Self-hosters
register their own provider app (Google and Microsoft bind allowed origins to
the client, so the hosted Inkweld app cannot serve other domains) and can
override the key at runtime; the override is stored in `localStorage` under
`inkweld-cloud-sync-app-keys`.

The OAuth redirect URI is `/cloud-sync/callback/<provider>` on the frontend
origin and must be registered with the provider exactly.

## Adding a provider

1. Add the id to `CloudProvider` in `storage-context.service.ts`.
2. Implement `RemoteStore` (`list`, `stat`, `get`, `put`, `delete`) for the
   provider's API, mapping its errors to `RemoteFileNotFoundError`,
   `RemoteAuthError` and `RemoteConflictError`.
3. Add the OAuth pieces to `CloudSyncConnectService` (the authorize URL in
   `beginAuthorization`, `exchangeCode`, `describeAccount`, token refresh) and
   list the provider in
   `IMPLEMENTED_CLOUD_PROVIDERS`. A provider that authenticates some other way
   gets its own `connect<Provider>` entry point that ends in
   `adoptOrRequestProfile`, as Nextcloud does, and goes in
   `KEYLESS_CLOUD_PROVIDERS`.
4. Add a `cloudSync.<provider>.appKey` field to the environment files (OAuth
   providers only).
5. Add a card to `PROVIDER_OPTIONS` in the setup page.
