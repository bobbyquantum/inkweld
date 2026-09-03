---
title: Appearance
description: Customise the login and home screen backgrounds, and control whether users can personalise their own.
sidebar_position: 7
---

# Appearance

**Admin → Appearance** controls the full-screen background images Inkweld paints
behind the login page and the home screen, and whether users may choose their
own.

---

## Two surfaces

Backgrounds are configured per surface, because the two have different
audiences:

| Surface | Pages | Who can change it |
| --- | --- | --- |
| **Login** | Welcome/sign-in, first-run setup, approval-pending, password and passkey recovery | Admins only |
| **Home** | Home screen, create-project, user profiles | Admins, and users if you allow it |

Nobody is signed in when the login pages render, so a user preference can never
apply there — the login background is always the one you set.

If you leave the login background unset it **falls back to the home
background**, so uploading a single image brands both. The page tells you when
that is happening.

---

## Setting a background

Each surface resolves its image in this order:

1. **An uploaded image** — click *Upload image*. The file is resized to fit
   within 2560×1440, re-encoded to WebP and stripped of metadata, which usually
   turns a multi-megabyte photo into a few hundred kilobytes. Accepted formats
   are PNG, JPEG, WebP, GIF and AVIF, up to 12 MB. SVG is rejected.
2. **An external image URL** — used only when no image has been uploaded. Must
   be an absolute `http(s)` URL.
3. **The bundled default** — what ships with Inkweld.

*Remove image* deletes the upload and drops back to the URL, then to the
default.

:::note Uploaded backgrounds are public
The login page has to load its background before anyone can sign in, so the
image is served without authentication. Anyone who knows the URL can fetch it.
Don't use an image you would not put on a public page.
:::

:::caution External URLs are loaded by the visitor
An external URL is fetched by each visitor's browser, not by the server, so the
host you point at sees their IP address and user agent. Uploading the image
keeps everything on your own origin.
:::

### Where uploaded images live

On a filesystem deployment: `DATA_PATH/branding/background-login.webp` and
`background-home.webp`. On Cloudflare, the R2 keys `branding/background-login`
and `branding/background-home`.

Each upload gets a new version token, which is appended to the public image URL.
The bytes behind a given URL therefore never change, so they are served with a
one-year immutable cache — a new upload reaches everyone immediately without
anyone holding a stale image.

---

## Readability

A busy photograph makes text hard to read, so two treatments sit between the
image and the page content:

- **Scrim opacity** — a flat overlay in the theme's colour. Leave it empty to
  keep the per-theme defaults (0.5 in dark mode, 0.7 in light). Accepts 0 to
  0.95. This applies to the login and home surfaces.
- **Background blur** — 0 to 40 pixels, applied to the image behind the scrim
  and across every background surface. 0 turns the effect off entirely rather
  than applying a zero-radius blur, so there is no rendering cost when it is
  unused.

---

## Letting users choose their own

Two switches, at the bottom of the page:

**Let users choose their own background** (default: on) adds a background picker
to each user's account settings, offering the bundled image plus a handful of
built-in presets. The presets are CSS gradients rather than image files, so they
cost no storage, need no network request and work offline.

**Let users upload their own image** (default: off) additionally lets each user
upload one image of their own. It is processed exactly like a branding upload
and stored under `DATA_PATH/backgrounds/<username>`, so this one does consume
storage — roughly a few hundred kilobytes per user who uses it. Unlike avatars,
a personal background is served only to its owner, and it is deleted with the
account.

Turning the first switch off also disables uploads, and existing personal
choices stop applying — users see the admin background again. Nothing is
deleted, so turning it back on restores their choice.

Users only ever affect the signed-in pages. There is no way for a user to change
what a visitor sees.

---

## Local and offline mode

In local mode there is no server to hold a configuration, so Inkweld uses the
bundled image and the built-in presets, with the choice kept in the browser. The
same applies when the server is unreachable: the last resolved background is
re-applied from local storage on startup, so a branded login page does not flash
the default image while the configuration loads.

---

## Environment variables

Everything except the uploaded images can also be set through the environment.
The admin UI writes to the database, which takes precedence over these.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOGIN_BACKGROUND_URL` | — | External image URL for the login surface |
| `HOME_BACKGROUND_URL` | — | External image URL for the home surface |
| `BACKGROUND_OVERLAY_OPACITY` | per-theme | Scrim opacity, 0–0.95 |
| `BACKGROUND_BLUR` | `0` | Blur radius in pixels, 0–40 |
| `USER_BACKGROUND_ENABLED` | `true` | Allow users to choose a preset |
| `USER_BACKGROUND_UPLOAD_ENABLED` | `false` | Allow users to upload an image |
