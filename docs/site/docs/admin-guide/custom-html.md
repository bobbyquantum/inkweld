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

Inkweld can't write your policy for you: it depends on who you let register,
where you host, and which optional features (email, AI providers, GitHub
sign-in) you turn on. The [Inkweld app's privacy policy](/privacy) covers only
the app, and says that data stored on a server is that server's operator's
responsibility, so your users rely on yours. A server stores account details
(username, email, passkeys or a password hash), project content and media,
activity and writing-session history, comments, AI image-generation prompts,
and the IP address and user agent of connected MCP clients.

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

### Content Security Policy

Inkweld sends a Content-Security-Policy with the app page. It stops the browser
running any script that isn't part of Inkweld, so a bug that let someone
inject markup into a page can't be used to run code in other users' browsers.

Your custom HTML is allowed automatically:

- **Inline `<script>` blocks** are allowed by their exact content (a SHA-256
  hash). Edit the script and the policy follows.
- **`<script src="https://…">`** tags are allowed by the script's origin.

Two things need extra steps:

- **Scripts loaded at runtime.** Tag managers, chat widgets and many analytics
  snippets load further scripts, styles or frames from their own domains. Add
  those origins to **Trusted sources**, one per line, for example
  `https://www.googletagmanager.com`. A source can be an origin, a
  `*.example.com` wildcard, or a URL path prefix; anything else (including
  keywords such as `'unsafe-inline'`) is ignored.
- **Inline event handlers** (`onclick="…"`, `onload="…"`) and `javascript:`
  links never run. Put the code in a `<script>` block instead.

To try out new custom HTML safely, set **Policy** to **Report only**: nothing
is blocked, and anything the policy would have blocked is logged in the
browser's developer console as a Content-Security-Policy warning. Once the
console is clean, switch back to **Enforce**. **Off** sends no policy at all;
use it only while diagnosing a problem.

Images, media and network connections are allowed from any `https:` origin,
because projects embed remote images and the app connects to other Inkweld
servers and to Dropbox or Nextcloud, so trackers that only load an image or
call an API need no trusted source.

The app works offline by caching its page, so a policy change reaches people
who already have it open the way an app update does: they see the usual
"Update Available" prompt.

:::note[Cloudflare deployments]
On Cloudflare the policy comes from the frontend's `_headers` file instead
and can't be changed from the admin settings — as with custom HTML, the
Inkweld server never sees those requests.
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

| Variable                                  | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `PRIVACY_POLICY_CONTENT`                  | Privacy policy text (Markdown) served at `/privacy`               |
| `PRIVACY_POLICY_URL`                      | Where `/privacy` redirects when no text is set                    |
| `TERMS_OF_SERVICE_CONTENT`                | Terms of service text (Markdown) served at `/terms`               |
| `TERMS_OF_SERVICE_URL`                    | Where `/terms` redirects when no text is set                      |
| `REQUIRE_POLICY_ACCEPTANCE`               | Require users to accept the documents, and again when they change |
| `CUSTOM_HEAD_HTML`                        | Raw HTML injected into `<head>`                                   |
| `CUSTOM_BODY_HTML`                        | Raw HTML injected at the end of `<body>`                          |
| `CONTENT_SECURITY_POLICY_MODE`            | `enforce` (default), `report-only` or `off`                       |
| `CONTENT_SECURITY_POLICY_TRUSTED_SOURCES` | Extra script, style, font and frame origins, space-separated      |
