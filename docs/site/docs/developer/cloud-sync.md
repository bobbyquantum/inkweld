---
sidebar_position: 5
title: Cloud Sync
---

# Cloud Sync

Cloud Sync is Inkweld's third storage mode, alongside Browser mode and Realtime
Sync (an Inkweld server). The user's own cloud storage holds a mirror of their
projects, so they can move between devices without an Inkweld server or an
Inkweld account. Identity comes from the provider account.

Only Dropbox is wired today. The design is provider-neutral so Google Drive,
OneDrive, Nextcloud and S3-compatible stores can be added as adapters.

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
carries the profile (a second device adopts it without setup questions), the
project list with covers, and deletion tombstones. Entries merge by key with
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

## Configuration

Provider app keys are public OAuth client identifiers and ship in the browser
bundle via the environment file:

```ts
cloudSync: {
  dropbox: { appKey: '...' },
},
```

An empty key hides the provider from the setup page. The Cloudflare deploy
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
   `IMPLEMENTED_CLOUD_PROVIDERS`.
4. Add a `cloudSync.<provider>.appKey` field to the environment files.
