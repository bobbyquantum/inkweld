---
title: Legal Links & Custom HTML
description: Link your privacy policy and terms, and inject your own HTML (analytics, consent managers, verification tags) into every page.
sidebar_position: 8
---

# Legal Links & Custom HTML

Inkweld sets only strictly-necessary cookies, so out of the box it needs no
cookie consent banner and ships without one. If your instance needs more — a
privacy policy, terms of service, analytics, a consent manager — you add it
yourself from **Admin → Settings**.

---

## Privacy policy and terms of service

The **Privacy Policy & Terms** card takes two URLs:

| Setting                  | Shown as                                                        |
| ------------------------ | --------------------------------------------------------------- |
| **Privacy policy URL**   | A _Privacy Policy_ link in the login and registration dialogs   |
| **Terms of service URL** | A _Terms of Service_ link in the login and registration dialogs |

Leave a field empty to hide its link. These links work on every deployment
type, including Cloudflare.

---

## Custom HTML injection

The **Custom HTML Injection** card has two slots:

| Slot          | Where it goes          | Typical use                                                          |
| ------------- | ---------------------- | -------------------------------------------------------------------- |
| **Head HTML** | Inside `<head>`        | Meta tags, site-verification tags, analytics, consent-manager loader |
| **Body HTML** | At the end of `<body>` | Tracking pixels, chat widgets, consent-manager fallback              |

The HTML is inserted into the page when the server sends it, so it is present
from the very first load — before the app starts. Edits take effect within a
few seconds; reload the page to see them.

:::danger[Custom HTML is not sanitized]
Whatever you enter is injected verbatim and runs in every user's browser on
every page load, including on the login page. That is the point of the
feature, but it means:

- Only paste code from sources you trust.
- Anyone with admin rights can run script as any user who opens the app. Only
  give admin rights to people you would trust with that.

:::

If the settings can't be read when a page is requested, the page is served
without the custom HTML rather than failing, so a mistake here can't take the
app down.

:::caution[Only when Inkweld serves the frontend]
Injection happens in the Inkweld server as it serves the app's `index.html`.
It works for Docker and native Bun deployments that serve the bundled
frontend. On Cloudflare, the frontend is served by Cloudflare Pages, which
never passes through the Inkweld server, so the custom HTML slots have no
effect there. The same applies if you set `SERVE_FRONTEND=false` and serve the
frontend from your own web server.
:::

### If you add tracking

Once you add analytics or other third-party scripts, Inkweld's "strictly
necessary cookies only" posture no longer covers your instance. Depending on
where you and your users are, you may need a consent manager (load it through
the head slot) and a privacy policy that describes the tracking (link it
above).

---

## Environment variables

All four settings can also be set through the environment. Values saved in the
admin UI are stored in the database and take precedence.

| Variable               | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `PRIVACY_POLICY_URL`   | Privacy policy link in the login/registration dialogs   |
| `TERMS_OF_SERVICE_URL` | Terms of service link in the login/registration dialogs |
| `CUSTOM_HEAD_HTML`     | Raw HTML injected into `<head>`                         |
| `CUSTOM_BODY_HTML`     | Raw HTML injected at the end of `<body>`                |
