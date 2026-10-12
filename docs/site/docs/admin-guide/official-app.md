---
title: Sign-in from the Official App
description: Let people use your server from inkweld.app with one switch.
sidebar_position: 7
---

# Sign-in from the Official App

The official app at [inkweld.app](https://inkweld.app), in the browser or
installed as a web app, can connect to any Inkweld server. Your server
only trusts the addresses in `ALLOWED_ORIGINS`, though, so by default the
official app can't sign in to it. Your users have to open your server's own
address instead.

**Admin → Settings → Allow Sign-in from the Inkweld App** changes that with one
switch. It is off by default.

## What it changes

While it is on, the server:

- accepts requests from `https://inkweld.app` (CORS and CSRF checks), as if it
  were listed in `ALLOWED_ORIGINS`
- accepts passkey sign-ins and registrations made on `https://inkweld.app`
- serves `/.well-known/webauthn` listing `https://inkweld.app`. Browsers only
  let a page use passkeys for its own domain. This file tells them that
  inkweld.app may also use your server's passkeys (WebAuthn "related origins").

Turning it off removes all three within a few seconds. You don't need to
restart the server.

You can also set it with the `ALLOW_INKWELD_APP_CLIENT=true` environment
variable. A value saved on the Settings page takes precedence over the
environment variable.

## Before you turn it on

:::warning[Keep your server up to date]
The official app always runs the latest Inkweld release. When a release
changes the sync protocol, an older server may stop working with it until you
upgrade. If you can't upgrade promptly, leave this off and have your users
open your server's own address.
:::

- **You're trusting code you don't host.** With the switch on, the app's code
  comes from inkweld.app rather than from your server. Your users' sessions
  and documents still live only on your server.
- **Passkeys need a supporting browser.** Passkeys work from inkweld.app only
  in browsers that support WebAuthn related origins, such as Chrome and Safari. In other browsers, people need
  [password login](./passkeys) to sign in from the official app.
- **Your server has to answer for its passkey domain.** Browsers fetch
  `https://<WEBAUTHN_RP_ID>/.well-known/webauthn`. That works when the same
  Inkweld server serves both the app and the API at that domain, which is how
  the Docker image and native installs run. If your frontend is hosted
  elsewhere (for example on Cloudflare Pages in front of a Workers API), that
  host has to serve the same file instead.

## How people connect

On the setup screen at inkweld.app (or in the installed web app), people choose
**Realtime Sync** and enter your server's address. Then they sign in as usual.
Their projects are the same ones they see at your server's own address, and on
any other device signed in to the same account.
