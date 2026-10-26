---
id: passkeys
title: Passkeys (Internals)
description: How Inkweld implements WebAuthn passkeys, passwordless sign-in and magic-link recovery.
---

# Passkeys (Internals)

Inkweld's passkeys use the W3C WebAuthn API for passwordless,
discoverable-credential (usernameless) sign-in. This page is for contributors;
server configuration is covered in the admin guide's [Passkeys](../admin-guide/passkeys.md) page.

## Architecture

- Library: `@simplewebauthn/server` (backend) + `@simplewebauthn/browser` (frontend), both v13.3.0.
- Registration and authentication are **POST** endpoints (not GET).
- Challenges are single-use, expire after 5 minutes, and are stored in the `webauthnChallenges` table.
- Credentials are stored in the `userPasskeys` table; timestamps are in **seconds** (not milliseconds).
- Sign-in returns a JWT identical to the one the password flow returns.

## Key files

| Area                                                             | File                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Credential storage schema                                        | `backend/src/db/schema/user-passkeys.ts`                     |
| Challenge storage schema                                         | `backend/src/db/schema/webauthn-challenges.ts`               |
| Magic-link token storage (hashed)                                | `backend/src/db/schema/passkey-recovery-tokens.ts`           |
| WebAuthn ceremonies                                              | `backend/src/services/passkey.service.ts`                    |
| Magic-link request and redeem ceremonies                         | `backend/src/services/passkey-recovery.service.ts`           |
| Routes (all start/finish endpoints are POST)                     | `backend/src/routes/passkey.routes.ts`                       |
| Recovery routes                                                  | `backend/src/routes/passkey-recovery.routes.ts`              |
| Angular service wrapping the API                                 | `frontend/src/app/services/auth/passkey.service.ts`          |
| Magic-link recovery wrapper                                      | `frontend/src/app/services/auth/passkey-recovery.service.ts` |
| Account settings UI (list/add/rename/delete)                     | `frontend/src/app/components/passkeys-settings/`             |
| Passkey login button and "Lost your passkey?" link               | `frontend/src/app/dialogs/login-dialog/`                     |
| Recovery request page (`/recover-passkey`)                       | `frontend/src/app/pages/recover-passkey/`                    |
| Magic-link redemption page (`/recover-passkey/redeem?token=...`) | `frontend/src/app/pages/recover-passkey-redeem/`             |
| E2E with a CDP virtual authenticator                             | `frontend/e2e/online/passkey.spec.ts`                        |
| E2E for `PASSWORD_LOGIN_ENABLED`                                 | `frontend/e2e/online/passwordless.spec.ts`                   |
| E2E for the recovery request page                                | `frontend/e2e/online/passkey-recovery.spec.ts`               |

## Data flow

1. Register: `POST /register/start` → browser prompt → `POST /register/finish` → row in `userPasskeys`.
2. Sign in: `POST /login/start` → browser prompt → `POST /login/finish` → JWT in the response body.
3. Management: `GET /` (list), `PATCH /:id` (rename), `DELETE /:id`.
4. Recovery (passwordless mode, email enabled): `POST /api/v1/passkey-recovery/request` (anonymous, email) → an email with a `/recover-passkey/redeem?token=<raw>` link → `POST /start` + `POST /finish` enrol a **new** passkey. No session is issued and existing passkeys are untouched.

## Environment variables

- `WEBAUTHN_RP_ID` — domain only, no protocol or port (e.g. `inkweld.yourcompany.com`). Defaults to `localhost` in development. **It cannot be changed after users register passkeys.**
- `WEBAUTHN_RP_NAME` — display name shown in browser prompts. Defaults to `Inkweld`.
- `ALLOWED_ORIGINS` — also used as `expectedOrigin` in WebAuthn verification; it must include every origin users open the app from.
- `PASSKEYS_ENABLED` — master switch for the feature (default `true`).
- `PASSWORD_LOGIN_ENABLED` — allow username/password sign-in (default `false`, passwordless-first per NIST SP 800-63B Rev. 4). When `false`, `/login`, `/forgot-password` and `/reset-password` return 403/404, and the registration form omits password fields and enrols a passkey straight away.
- `EMAIL_RECOVERY_ENABLED` — allow email-based account recovery (default `false`). In passwordless mode it powers the magic-link flow that enrols a new passkey from a verified email, keeping existing passkeys. In password mode it powers the classic forgot-password flow. Requires the SMTP / `EMAIL_*` settings.

## Things that are easy to get wrong

- **Timestamps are seconds.** The frontend `formatDate()` multiplies by 1000 before constructing a `Date`. Do not "fix" this.
- **RP ID in development**: the frontend (`:4200`) and backend (`:8333`) share the `localhost` hostname, so the WebAuthn RP ID check passes; ports are ignored for it.
- `rpFromContext(c)` reads `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` from config and falls back to `config.allowedOrigins` for the origins list. **Ceremonies must use `rpFromRequest(c)`**, which also accepts the hosted app's origin when `ALLOW_INKWELD_APP_CLIENT` is on (see below); with `rpFromContext(c)` a ceremony from inkweld.app fails origin verification.
- The login dialog's `onPasskeyLogin()` calls `userService.setCurrentUser(user)` after a successful passkey sign-in to sync the user cache.
- The Angular API client returns `Observable<HttpEvent<T>>`. In unit tests, use an `obs()` helper returning `Observable<any>` to avoid TypeScript errors with mock return values.
- E2E tests use Chromium's CDP `WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator` with `ctap2/internal/resident-key/UV/auto-presence`.
- The online e2e backend opts into `PASSWORD_LOGIN_ENABLED=true` and `EMAIL_RECOVERY_ENABLED=true` (in `playwright.online.config.ts`) because the existing fixtures register and sign in users through the password API. Production images use the passwordless default.
- Magic-link recovery tokens are hashed at rest (single-use, 15-minute TTL). There is no test endpoint that returns the plaintext token, so redemption from a real browser is covered by unit and backend integration tests rather than Playwright.

## Signing in from the hosted app

`ALLOW_INKWELD_APP_CLIENT` (admin Settings, default off) lets the hosted app at `https://inkweld.app` sign in to a self-hosted server. `getInkweldAppClientOrigins()` (`backend/src/services/inkweld-app-client.service.ts`, 5-second cache) adds that origin to CORS/CSRF in `bun-app.ts`, `worker-app.ts` and `node-app.ts`, to the WebAuthn expected origins, and to `GET /.well-known/webauthn` (WebAuthn related origins; 404 while the setting is off). Any new origin check must include these origins too.

## Moving Browser projects to a server

The profile manager's "Move projects to a server" signs in to a server that is not the active profile's. It reads that server's `/config/features` with `SetupService.fetchServerFeatures()` and passes them to `RegistrationFormComponent`'s `serverFeatures` input, because `SystemConfigService` describes the Browser profile at that point. It offers passkey sign-in/registration and password fields only as that server allows.

The sign-in switches to the target profile first (the API client and token store follow the active profile); any failure, cancel or dialog close switches back and removes the profiles the flow created. It calls `PasskeyService.login({ reloadOnProfileChange: false })` so a sign-in that moves to its author's own profile doesn't reload mid-flow. E2E: `e2e/online/move-to-passkey-server.spec.ts` (an isolated backend with `PASSWORD_LOGIN_ENABLED=false`).
