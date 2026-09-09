---
id: nextcloud-sync
title: Cloud Sync with Nextcloud
sidebar_label: Nextcloud Sync
description: Point Inkweld at your own Nextcloud server and keep your projects mirrored there.
sidebar_position: 2
---

# Cloud Sync with Nextcloud

Cloud Sync can mirror your projects to a folder in your own Nextcloud instead of
Dropbox. Inkweld talks to Nextcloud over WebDAV directly from your browser, so
there is still no Inkweld server and no Inkweld account. Everything lands in an
`Inkweld` folder in your Nextcloud files.

Two things need to be true before it works:

1. **Your Nextcloud has to allow Inkweld's web address to talk to it.** Browsers
   block a page on one site from calling a server on another unless that server
   says it is fine (this is called CORS). Nextcloud does not do that by default,
   so a one-time change on the server is needed. If you use a Nextcloud you do
   not administer, ask its admin to do the step below.
2. **You need an app password.** Never type your real Nextcloud password into
   Inkweld. An app password is a separate credential you can revoke on its own.

## Step 1: Allow Inkweld on the server (admin, once per server)

The simplest route is the community **WebAppPassword** app, which exists for
exactly this purpose: it lets an admin whitelist web origins that may use
WebDAV.

1. In Nextcloud, open **Apps** and install
   [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword).
2. Go to **Administration settings → WebAppPassword**.
3. Under **WebDAV/CalDAV origins**, add the address of the Inkweld you use, for
   example `https://preview.inkweld.org`. If you self-host Inkweld, add your own
   address. For local development add `http://localhost:4200`.
4. Save.

The same setting can live in `config/config.php` instead of the UI:

```php
'webapppassword.origins' => ['https://preview.inkweld.org'],
```

Origins must include the scheme and host. Paths are ignored, and a one-level
wildcard such as `https://*.example.com` is allowed.

:::tip Reverse proxy alternative
If you would rather not install an app, the same headers can be added by the
reverse proxy in front of Nextcloud for the `/remote.php/dav/` path:
`Access-Control-Allow-Origin` set to Inkweld's origin,
`Access-Control-Allow-Credentials: true`,
`Access-Control-Allow-Methods: GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS`,
`Access-Control-Allow-Headers: Authorization, Content-Type, Depth, If-Match, X-Requested-With`,
`Access-Control-Expose-Headers: ETag, OC-ETag, Last-Modified`, and an immediate
`204` reply to `OPTIONS` preflight requests. The app is less error-prone.
:::

:::note Desktop and Android
The Android app opens the same web page in Chrome, so it needs the server step
too. A future desktop build may be able to skip it.
:::

## Step 2: Create an app password (each user)

1. In Nextcloud, open your avatar → **Personal settings → Security**.
2. Scroll to **Devices & sessions**. Enter a name such as `Inkweld` and press
   **Create new app password**.
3. Copy the password shown. Nextcloud only shows it once.

You can revoke it from the same page at any time, which disconnects Inkweld
without affecting anything else.

## Step 3: Connect in Inkweld

1. On the welcome screen choose **Cloud Sync**, then **Nextcloud**.
2. Enter the address you use to open Nextcloud (for example
   `https://cloud.example.com`), your Nextcloud username, and the app password.
3. Press **Connect to Nextcloud**.

Inkweld checks the details, then:

- **First device:** the `Inkweld` folder is empty, so Inkweld asks for a display
  name and username.
- **Another device:** the folder already has your profile and project list.
  Projects appear as cards; open one to pull it onto that device.

The app password is stored only in that browser. The user menu shows sync
status and has a **Sync now** action.

## If connecting fails

**"Could not reach …"** almost always means the server has not allowed
Inkweld's origin yet (Step 1), or the address is wrong. Open the browser
developer console: a CORS error confirms the first case.

**"Nextcloud rejected the username or app password"** means the login name or
password is wrong, or the app password was revoked. Create a fresh one. If you
normally sign in with an email address, your Nextcloud username may differ;
it is shown under **Personal settings → Personal info**.

**Two-factor authentication** is not a problem. App passwords bypass it by
design, which is another reason to use one instead of your real password.

## What Inkweld can see

Unlike Dropbox's app folder, a Nextcloud app password grants the same file
access as your account. Inkweld only ever reads and writes inside the `Inkweld`
folder, but the credential itself is not restricted to it. Keep the app
password dedicated to Inkweld so it can be revoked on its own.
