---
sidebar_position: 5
title: Cloud Sync
---

# Cloud Sync

Cloud Sync is Inkweld's third storage mode, alongside Browser mode and Realtime
Sync (an Inkweld server). The user's own cloud storage holds a mirror of their
projects, so they can move between devices without an Inkweld server or an
Inkweld account. Identity comes from the provider account.

Dropbox and Nextcloud (WebDAV) are wired today. The design is provider-neutral
so Google Drive, OneDrive and S3-compatible stores can be added as adapters.

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
  the same username so project paths match, and the app reloads into the new
  profile. Activations travel with the data, so the engine's first full pass
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

## Configuration

Provider app keys are public OAuth client identifiers and ship in the browser
bundle via the environment file:

```ts
cloudSync: {
  dropbox: { appKey: '...' },
},
```

An empty key hides the provider from the setup page. Nextcloud needs no key
and is always offered (`KEYLESS_CLOUD_PROVIDERS`), so Cloud Sync appears even
in a build with no OAuth keys. The Cloudflare deploy
workflow reads `DROPBOX_APP_KEY` from a repository variable. Self-hosters
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
3. Add the OAuth pieces to `CloudSyncConnectService` (`buildAuthorizeUrl`,
   `exchangeCode`, `describeAccount`, token refresh) and list the provider in
   `IMPLEMENTED_CLOUD_PROVIDERS`. A provider that authenticates some other way
   gets its own `connect<Provider>` entry point that ends in
   `adoptOrRequestProfile`, as Nextcloud does, and goes in
   `KEYLESS_CLOUD_PROVIDERS`.
4. Add a `cloudSync.<provider>.appKey` field to the environment files (OAuth
   providers only).
5. Add a card to `PROVIDER_OPTIONS` in the setup page.
