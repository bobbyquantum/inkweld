---
id: legal-pages-and-custom-html
title: Legal Pages, Custom HTML and CSP (Internals)
description: How Inkweld serves legal documents, injects admin HTML into index.html and builds its Content-Security-Policy.
---

# Legal Pages, Custom HTML and CSP (Internals)

Inkweld sets only strictly-necessary cookies, so it ships **no consent banner** and never needs one by default. Admins bring their own compliance tooling through `general`-category config keys, edited on the admin Settings page. This page explains how those keys are implemented; the admin view is in [Legal Pages & Custom HTML](../admin-guide/custom-html.md).

## Legal documents

- `PRIVACY_POLICY_CONTENT` / `TERMS_OF_SERVICE_CONTENT` (Markdown) or `PRIVACY_POLICY_URL` / `TERMS_OF_SERVICE_URL` (an external page; content wins when both are set).
- They are served by the anonymous `/privacy` and `/terms` routes (`frontend/src/app/pages/legal/`), which render the Markdown through Angular's `[innerHTML]` sanitizer or redirect to an http(s) URL. The text comes from `GET /api/v1/config/legal/{privacy|terms}`.
- `/config/features` carries `hasPrivacyPolicy`, `hasTerms`, `policyVersion`, `requirePolicyAcceptance`, and the URL fields only for externally hosted documents.
- `LegalLinksComponent` links to `/privacy` and `/terms` on every page reachable before sign-in (landing page, login/register dialogs, passkey recovery, forgot/reset password, approval-pending, OAuth consent, about). It is not on `/setup`, which runs before any server is chosen.

## Requiring acceptance

With `REQUIRE_POLICY_ACCEPTANCE` on, registration needs an `acceptedPolicyVersion` equal to the current `policyVersion` (a checkbox in `RegistrationFormComponent`). `PolicyAcceptanceService` (started from `AppComponent`) shows a blocking dialog to signed-in users whose `users.policyAcceptedVersion` is stale, via `GET/POST /api/v1/users/me/policy-acceptance`. Declining signs out.

- The service resolves `SystemConfigService` lazily, only once a server user is signed in. Creating it at startup would cache features from before first-run setup picks a server (setup navigates on without reloading).
- `policyVersion` is a short SHA-256 of all four legal values (`legal.service.ts`), so **any** edit to the text or a URL makes everyone accept again. Editing a policy hosted elsewhere doesn't change the version; touch its URL (e.g. add `?v=2`) to re-prompt.
- Acceptance is a UI gate only: the API, MCP and WebSockets keep working for an account that has not accepted.
- `/privacy` and `/terms` are reserved usernames and must stay above the `:username` route. The gate never opens while one of them is the current route, and it waits for the first `NavigationEnd` (before it, `router.url` is `/`), so a policy opened in a new tab can be read.
- E2E: `policy-acceptance.spec.ts` flips the instance-wide flag, so it starts its own backend with `e2e/common/isolated-backend.ts` (online config only, `E2E_BACKEND_RUNTIME=bun`). Use the same helper for any other spec that must change a global setting that would break parallel specs.

## Custom HTML injection

`CUSTOM_HEAD_HTML` / `CUSTOM_BODY_HTML` are raw HTML injected at serve time into the `<!-- INKWELD_HEAD_EXTRA -->` / `<!-- INKWELD_BODY_EXTRA -->` markers in the built `index.html` (`injectCustomHtml()` in `backend/src/utils/spa-utils.ts`, wired into `bun-app.ts`'s external and embedded SPA handlers, 5-second cache). The values are deliberately **not sanitized** — that is the feature, and scripts placed there run on every page load. They only reach the frontend in the served document and are absent from the JSON API.

- Custom HTML must never bypass substitution: `index.html` requests always go through `respondWithInjectedIndex()`, even when a pre-compressed `.br` variant exists. Keep any new serve path consistent with this.
- **Service worker hash.** The Angular service worker rejects an app version if `index.html` doesn't match its build-time SHA-1 in `ngsw.json`, which breaks offline installs and updates. So an empty snippet leaves its marker in place (`index.html` stays byte-identical to the build), and `ngsw.json` is served through `patchNgswIndexHash()` so its `/index.html` hash follows the injected document. Both bypass the `.br` variants. Never "tidy" the markers away when nothing is configured.
- `injectCustomHtml` uses function replacements to avoid the `$&`-style `String.replace` pattern pitfall; keep it that way.

## Content-Security-Policy

The policy is built in `backend/src/utils/csp.ts`.

- The Bun server sends it with every `index.html` response (`respondWithInjectedIndex`). Inline `<script>`s in the rendered document are allowed by SHA-256 hash and external `<script src>` by origin, so custom HTML works without configuration. `CONTENT_SECURITY_POLICY_TRUSTED_SOURCES` adds origins for scripts those snippets load later, and `CONTENT_SECURITY_POLICY_MODE` is `enforce` / `report-only` / `off`.
- **The built `index.html` must contain no inline script.** That is why `angular.json` sets `inlineCritical: false` (Beasties' critical-CSS loader is an inline script). Don't turn it back on: Cloudflare Pages can't hash at serve time.
- `frontend/public/_headers` carries the same base policy for Cloudflare Pages; `csp.spec.ts` fails if the two differ.
- `script-src` has `'unsafe-eval'` only because typst.ts' wasm-bindgen glue calls `new Function(...)`. Never add `'unsafe-inline'` to `script-src`.
- The service worker caches `index.html` **with its headers** and refetches it only when its `ngsw.json` hash changes, so non-default CSP settings add an `<!-- inkweld-csp:… -->` comment (`cspSettingsComment`) to change the hash.

## Compressed WASM

`compress-wasm.js` Brotli-compresses every `.wasm` in place, so the server detects compressed WASM by its missing `\0asm` magic (`wasmContentEncoding`) rather than by file name.
