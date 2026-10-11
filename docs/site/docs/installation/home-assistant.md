---
id: home-assistant
title: Home Assistant App
description: Run Inkweld as a Home Assistant app, with sign-in handled by Home Assistant.
sidebar_position: 6
---

# Home Assistant App

Inkweld can run as an app (add-on) inside [Home Assistant](https://www.home-assistant.io/). Home Assistant shows the Inkweld UI in its sidebar through **ingress**, and signs people in, so there is no separate Inkweld login to manage.

The app is a thin layer over the published Inkweld Docker image and lives in its own repository: [`bobbyquantum/addon-inkweld`](https://github.com/bobbyquantum/addon-inkweld). Follow the instructions there to add the repository to Home Assistant and install the app; this page only explains how Inkweld behaves once it is running.

## How sign-in works

- Home Assistant authenticates the person, then proxies requests to Inkweld and adds the signed-in user's id and name as headers.
- The first time an HA user opens Inkweld, an account is created for them automatically. It is approved immediately and has no password or passkey. The account is linked to the **Home Assistant user id**, so it keeps working if the HA username changes.
- Every HA user gets their own Inkweld account. Two people using the same browser each see their own account: a session is only valid for the HA user making the request, and Inkweld signs the other user in when they switch.
- Sign-out, the account and server switcher, and the server-info bubble are hidden, because Home Assistant decides who is signed in.

## Choosing administrators

Set **`INGRESS_ADMINS`** to a comma-separated list of Home Assistant usernames that should be Inkweld administrators, for example `alice,bob`. It is applied on every sign-in, in both directions: listed users are promoted and unlisted users lose admin rights. The last active administrator is never demoted. Only Home Assistant admins can edit the app's options, which is why the list is trusted.

If the list is empty, the first account created on the instance becomes the administrator.

## What the app configures

The app sets these environment variables for you (see [Configuration](../configuration.md#home-assistant-ingress)):

| Variable                | Value set by the app | Purpose                                               |
| ----------------------- | -------------------- | ----------------------------------------------------- |
| `INGRESS_ENABLED`       | `true`               | Turns on ingress handling                             |
| `INGRESS_TRUSTED_PROXY` | `172.30.32.2`        | The Home Assistant Supervisor's ingress proxy address |
| `INGRESS_ADMINS`        | from the app options | HA usernames that are Inkweld admins                  |

## Security model

Inkweld trusts the Home Assistant headers **only** when the TCP connection comes from `INGRESS_TRUSTED_PROXY`. It never decides based on `X-Forwarded-For` or on the headers themselves, because a client connecting directly can send any header it likes. Requests from anywhere else are treated as ordinary requests, so the app's optional direct port can stay open alongside ingress: people using it simply sign in the normal way (see [Passkeys](../admin-guide/passkeys.md)) and cannot pose as an HA user.

Because the UI is served under a path prefix (`/api/hassio_ingress/<token>/`), Inkweld injects a matching `<base href>` into the page it serves. This needs no configuration.

## Related

- [Configuration: Home Assistant Ingress](../configuration.md#home-assistant-ingress)
- [Docker deployment](./docker.md), the image the app is built on
