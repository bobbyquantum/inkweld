---
id: account-deletion
title: Account Deletion (Internals)
description: How a user or an admin deletes a server account and everything it owns.
---

# Account Deletion (Internals)

Anyone who can sign up must be able to delete their own server account, both in the app and from a public web page.

## API

- `DELETE /api/v1/users/me` with `{ confirmUsername }` (case-insensitive). It refuses with 409 when the caller is the last enabled administrator; the admin "Delete user" route does the same.
- `accountDeletionService.deleteAccount()` (`backend/src/services/account-deletion.service.ts`) is shared with the admin "Delete user" route.

## What deletion does, in order

1. `userService.reserveForDeletion()` — one conditional UPDATE that drops the admin flag only while another active admin remains, so two admins deleting themselves at once cannot both succeed. **Do not reserve by disabling the account**: the Durable Object refuses a disabled owner's token, which breaks the wipe on Workers.
2. Each owned project is torn down exactly like `DELETE /projects/:u/:s` (`removeProjectData`: Yjs documents, storage directory, Durable Object; then row + tombstone) **before** the user row is deleted. The row cascade alone would leave project content on disk or in R2.
3. The avatar, banner and background are dropped.

On failure the admin flag is restored so the request can be retried.

The Durable Object's `POST /api/destroy` accepts the owner **or an active site admin** (`isActiveSiteAdmin` in `utils/project-access.ts`). Without that, an admin deletion on Workers would leave the object named `username:slug`, and a re-registered username would inherit its documents.

## Frontend

- `DeleteAccountComponent` (`components/delete-account/`) appears in Settings → Account (hidden in local mode) and on the public `/delete-account` page (`pages/delete-account/`, a direct web link for deletion; also a reserved username).
- After success, `UserService.deleteAccount()` signs out and wipes the server profile's local data with `clearContextData`. Prose documents and worldbuilding data are included, since they are stored under the profile prefix; other profiles on the device keep their own copies. Then the app does a full load of `/delete-account?deleted=1` so queued IndexedDB deletes can complete.
- `/delete-account` is exempt from the policy-acceptance gate, so someone who won't accept new terms can still delete their account.

## Tests

`frontend/e2e/online/account-deletion.spec.ts` also runs under the wrangler config. The self-service test re-registers the same username and re-creates the slug to prove that media, LevelDB, Durable Object and local IndexedDB data (prose and worldbuilding) do not survive; the admin-deletion test does the same for server documents only.
