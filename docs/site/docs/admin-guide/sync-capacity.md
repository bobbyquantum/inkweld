---
title: Sync Capacity
description: Limit how much server storage each account can use, grant individual users more, and understand what is and is not blocked.
sidebar_position: 9
---

# Sync Capacity

Sync capacity is a per-user limit on how much server storage an account's
projects can use. It stops one account from quietly filling a shared server,
without ever putting anyone's writing at risk.

Limits are **off by default**. Upgrading an existing server does not start
refusing uploads; you opt in when you're ready.

---

## Turning it on

**Admin → Settings → Sync capacity limits**:

| Setting                        | What it does                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------- |
| **Sync capacity limits**       | Master switch. While off, usage is measured and shown but nothing is refused. |
| **Default allowance per user** | The allowance for every account without its own. Default 100 MB.              |

Both can also be set with environment variables (an admin-saved value takes
precedence):

```bash
SYNC_QUOTA_ENABLED=true
SYNC_QUOTA_DEFAULT_BYTES=524288000   # 500 MB
```

---

## What counts

An account's usage is the total server storage of **every project it owns**:

- the project's documents and worldbuilding (Yjs data), and
- its media library, cover image and published files.

Projects shared with someone count against the **owner**, not the
collaborator. So a collaborator uploading an image into your project uses your
allowance.

Avatars, profile banners and backgrounds are not counted.

---

## What is blocked, and what never is

When an account is at its allowance, these are refused:

| Write                                         | Where it comes from                                      |
| --------------------------------------------- | -------------------------------------------------------- |
| New media (images, audio, video, PDF, …)      | Media library, editor images, media sync                 |
| Replacing a project cover with a larger image | Project settings, MCP `apply_image`                      |
| Publishing a file to the server               | Publish → share                                          |
| Creating a new project                        | Home → New project, import, offline creations syncing up |

These are **never** blocked, at any usage level:

- typing, editing and real-time collaboration in existing documents,
- syncing changes made offline,
- reading, exporting or deleting anything.

Stranding someone's work is worse than letting them go temporarily over a
limit, so the editing path is deliberately left open. An account can be over
its allowance (for example after you lower it) and still work normally; it
just can't add new files or projects until it is back under.

Replacing a file is charged only for the growth: re-uploading the same image,
or swapping a cover for one of the same size, costs nothing extra.

---

## What users see

- **Home header** — a compact meter showing used / allowance (only while
  limits are on). It turns amber at 80% and red when full.
- **Settings → Account → Sync capacity** — the same meter, with an explanation
  and what to do when full. With limits off it shows plain usage instead.
- **Project sync strap** — a "Storage full" warning while the account is over,
  visible even offline (which is when uploads get queued).
- **Refusals** explain themselves: creating a project or publishing says the
  capacity is full rather than showing a generic error. Media that could not be
  uploaded stays on the user's device, nothing is lost, and uploads resume once
  space is freed.

Users free space by deleting media from a project's **Media** tab (which
also removes the server copy), deleting published files, or deleting projects.

---

## Giving one user more (or less)

**Admin → Users → (user) → Storage** shows the user's per-project usage against
their allowance. Untick **Use instance default** to set an allowance in MB just
for that user, or tick it again to go back to the default. An allowance of `0`
is valid and blocks all new uploads for that account.

The same change is available over the API:

```http
PATCH /api/v1/admin/users/{userId}/quota
Content-Type: application/json

{ "syncQuotaBytes": 1073741824 }   // 1 GiB; null = use the instance default
```

---

## How usage is measured

Each account keeps a fast running counter, updated on every accepted upload and
every deletion. Document (Yjs) growth never reaches that counter, so it is only
trusted while it is fresh: for 10 minutes after the server last measured the
account's real usage it may accept a write, and for 1 minute it may refuse one.
Otherwise the server measures real usage from storage first. This means a
counter that has drifted high can never wrongly block someone with room to
spare, a counter that has drifted low can't wave uploads through for long, and
a burst of uploads (or a client retrying a refused one) costs one measurement
rather than one each.

Opening the account settings meter or an admin storage view also recomputes
and saves the true figure.

On Cloudflare Workers, document size is read from each project's Durable
Object, and media from R2.

---

## API reference

| Endpoint                                            | Who          | Purpose                                                     |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| `GET /api/v1/users/me/storage`                      | Signed in    | Own usage, allowance, `enabled`, per-project breakdown      |
| `GET /api/v1/admin/users/{userId}/projects`         | Admin        | A user's projects with sizes, allowance and `quotaEnforced` |
| `PATCH /api/v1/admin/users/{userId}/quota`          | Admin        | Set or clear a user's allowance                             |
| `DELETE /api/v1/media/{username}/{slug}/{filename}` | Write access | Delete a media file and free its space                      |

A refused write returns **403** with a body that identifies it as a capacity
problem rather than an access-control one:

```json
{
  "error": "Quota Exceeded",
  "code": "QUOTA_EXCEEDED",
  "usedBytes": 104857600,
  "quotaBytes": 104857600,
  "requiredBytes": 2048,
  "reason": "media_upload"
}
```

`reason` is one of `media_upload`, `published_file` or `project_create`.
