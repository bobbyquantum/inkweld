---
title: Production Cookie Issues
description: Diagnose missing or rejected cookies when running the Bun/Hono backend behind HTTPS proxies.
---

> The current Bun/Hono backend returns JWT tokens in the login response body. Cookies only appear if you've enabled optional compatibility middleware (for example, to support older desktop builds) or you inject your own `Set-Cookie` headers at the edge. If you're still counting on cookies, use the checklist below to keep browsers happy.

## Symptoms

- Login succeeds but `curl -I` or browser devtools never show a `Set-Cookie` header.
- Cookies appear in the response but disappear immediately or never show up in the Application tab.
- Hosted environments (Render, Fly.io, custom Nginx) behave differently from local development.

## Root causes

1. Browsers drop cookies with the `Secure` flag when traffic reaches them over plain HTTP.
2. Proxies terminate TLS but do not forward `X-Forwarded-Proto`/`Forwarded` headers, so downstream middleware thinks the request was HTTP.
3. `SESSION_SECRET`, `ALLOWED_ORIGINS`, or `COOKIE_DOMAIN` are missing or inconsistent across environments.
4. You are still running the legacy session server beside the Bun backend and the two disagree about cookie names/domains.

## Fixes

### 1. Terminate TLS properly

- Always hit the public site over `https://`—even for staging.
- For Docker, terminate TLS in your ingress (Traefik, Caddy, Nginx) and forward requests to the Bun container over HTTP.
- On platforms such as Render or Fly.io, enable their "force HTTPS" feature so every browser request negotiates TLS.

### 2. Forward scheme headers

The Bun/Hono stack relies on your proxy to provide either `Forwarded` or `X-Forwarded-Proto` so custom middleware knows whether the original request was HTTPS. Confirm that:

- Your proxy forwards `X-Forwarded-Proto=https` (or the RFC 7239 `Forwarded` header).
- You are not stripping hop-by-hop headers inside custom middlewares.

### 3. Align environment variables

```bash
SESSION_SECRET=super-secure-32-char-string
ALLOWED_ORIGINS=https://docs.inkweld.org,https://inkweld.org
CLIENT_URL=https://inkweld.org
COOKIE_DOMAIN=.inkweld.org     # optional but recommended when serving from subdomains
```

- `SESSION_SECRET` must be at least 32 characters so signed values validate.
- `ALLOWED_ORIGINS` and `CLIENT_URL` must list the exact protocol + host browsers will hit.
- If you terminate TLS on `app.example.com` but serve the SPA from `docs.example.com`, choose a cookie domain that both subdomains share (e.g., `.example.com`).

### 4. Confirm compatibility mode intent

If you do not need cookies, prefer the default JWT flow: read the `token` from `/api/auth/login` and send it back as `Authorization: Bearer <token>`. Mixing cookie + bearer auth in the same deployment often causes confusing results. Remove any custom edge functions that inject `Set-Cookie` unless you have a firm requirement.

### 5. Confirm CORS settings

- Include the correct frontend host(s) in `ALLOWED_ORIGINS`.
- When you truly need cookies, set `credentials: true` both on the Bun CORS middleware _and_ in your frontend HTTP client.

## Debugging tips

Use a combination of `curl -I`, Chrome devtools, and Bun logs:

- Inspect response headers with `curl -I https://your-host/api/auth/login` and verify the casing of `Set-Cookie`.
- In Chrome, open DevTools → Network → login call → "Cookies" tab to see rejections (domain mismatch, insecure, etc.).
- Tail Bun logs to confirm the backend sees the expected `Forwarded` / `X-Forwarded-Proto` headers and that the `SESSION_SECRET` length check passes.

## Verification checklist

1. Attempt a login from the deployed frontend.
2. Inspect the response headers for a cookie that matches your custom middleware (name, domain, `Secure`, `SameSite`).
3. Confirm the browser stores the cookie and that follow-up API calls succeed without new warnings in the console.

If headers are missing entirely, double-check TLS termination, the proxy headers, and whether you actually enabled a cookie-based flow.
