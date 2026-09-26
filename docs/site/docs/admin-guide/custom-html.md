---
title: Legal Pages & Custom HTML
description: Publish your privacy policy and terms, optionally require users to accept them, and inject your own HTML (analytics, consent managers, verification tags) into every page.
sidebar_position: 8
---

# Legal Pages & Custom HTML

Inkweld sets only strictly-necessary cookies, so out of the box it needs no
cookie consent banner and ships without one. If your instance needs more — a
privacy policy, terms of service, analytics, a consent manager — you add it
yourself from **Admin → Settings**.

---

## Privacy policy and terms of service

The **Privacy Policy & Terms** card publishes two documents. For each one,
either:

- **paste the text** (Markdown) — Inkweld hosts it at `/privacy` or `/terms`, or
- **give a URL** — `/privacy` or `/terms` redirects there.

If both are set, the text wins and the URL is ignored. Leave both empty to hide
that document.

Once a document is set, it is linked from the landing page, the sign-in and
registration dialogs, and the other pages people see before signing in
(password and passkey recovery, approval-pending, the About page). These pages
are served by the app itself, so they work on every deployment type, including
Cloudflare.

### Requiring acceptance

Turn on **Require acceptance** to make agreement mandatory:

- New users must tick "I agree" before they can register.
- Signed-in users are shown a dialog asking them to accept whenever the
  documents change. Anyone who declines is signed out.

It has no effect until at least one document is set.

"Change" means **any** edit to either document's text or URL — fixing a typo
asks everyone to accept again. If your policy is hosted elsewhere, editing it
there does not change anything Inkweld can see; change its URL (for example,
add `?v=2`) to ask users to accept the new version.

:::note
Acceptance is enforced by the web app only. The API, MCP connections and
real-time sync keep working for an account that has not yet accepted.
:::

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
the head slot) and a privacy policy that describes the tracking (publish it
above).

---

## Environment variables

All of these settings can also be set through the environment. Values saved in
the admin UI are stored in the database and take precedence.

| Variable                    | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `PRIVACY_POLICY_CONTENT`    | Privacy policy text (Markdown) served at `/privacy`            |
| `PRIVACY_POLICY_URL`        | Where `/privacy` redirects when no text is set                 |
| `TERMS_OF_SERVICE_CONTENT`  | Terms of service text (Markdown) served at `/terms`            |
| `TERMS_OF_SERVICE_URL`      | Where `/terms` redirects when no text is set                   |
| `REQUIRE_POLICY_ACCEPTANCE` | Require users to accept the documents, and again when they change |
| `CUSTOM_HEAD_HTML`          | Raw HTML injected into `<head>`                                |
| `CUSTOM_BODY_HTML`          | Raw HTML injected at the end of `<body>`                       |
