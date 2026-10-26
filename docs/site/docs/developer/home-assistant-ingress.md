---
id: home-assistant-ingress
title: Home Assistant Ingress (Internals)
description: How Inkweld runs behind Home Assistant ingress, trusts its headers and signs users in.
---

# Home Assistant Ingress (Internals)

Inkweld can run as a Home Assistant app (repository `bobbyquantum/addon-inkweld`, a thin layer over the published image). Installation is covered in [Home Assistant](../installation/home-assistant.md). Home Assistant serves the UI at `/api/hassio_ingress/<token>/…`, strips the prefix, and sends it as `X-Ingress-Path` along with the signed-in Home Assistant user (`X-Remote-User-Id`, `-Name`, `-Display-Name`).

## Trust is by TCP peer, never by header

`backend/src/utils/ingress.ts` honours those headers only with `INGRESS_ENABLED=true` and when the socket address is `INGRESS_TRUSTED_PROXY` (no default; the Home Assistant app sets the Supervisor's `172.30.32.2`). Don't switch it to `getClientIp()` / `X-Forwarded-For`: a client connecting to the port directly controls those.

## Serving the app under a prefix

- The served `index.html` gets `<base href="<prefix>/">` and an `inkweld-ingress` meta tag (`injectIngressBase`, applied inside `renderIndex` so the `ngsw.json` hash patch sees the same document).
- **The frontend must work under a path prefix.** Use relative asset URLs (`assets/…`, not `/assets/…`) and `appUrl()` / `appOrigin()` from `frontend/src/app/utils/app-base.ts` for full-page navigations, new windows and server URLs. Stylesheet URLs to `public/` files stay relative and are listed in `externalDependencies` in `angular.json` so the build leaves them alone.

## Signing in

- `POST /api/v1/auth/ingress` (`ingress-auth.service.ts`) links the Home Assistant user id to `users.homeAssistantUserId`, creating an approved account on first visit, applies `INGRESS_ADMINS`, and returns a normal session JWT. The frontend calls it from `UserService` when it would otherwise be anonymous or its token has expired, and `SetupService` points the app at `appOrigin()` instead of showing setup.
- **A session is only valid for the Home Assistant user making the request.** `ingressSessionMatches` (checked in `getUserFromSession`, `GET /users/me` and the Yjs WebSocket handshake) rejects a token whose account isn't linked to the request's `X-Remote-User-Id`, so a browser shared by two Home Assistant users never keeps the first one's session. The client answers that 401 by signing in again and switching to the Home Assistant user's own server profile (`switchToIngressProfile`); it drops only the token, never the profile's user binding.
- Sign-out, the account/server switcher and the server-info bubble are hidden under ingress: Home Assistant decides who is signed in. The sign-out marker (`inkweld.ingressSignedOut`, sessionStorage) still covers sign-outs the app makes itself (declining a policy, deleting the account).
- CSRF's origin check is skipped for ingress requests: Home Assistant's origin isn't predictable, and its `ingress_session` cookie is `SameSite=Strict`.
