---
title: Passkeys (WebAuthn)
description: Configure and manage passwordless passkey authentication for your Inkweld instance.
sidebar_position: 6
---

# Passkeys (WebAuthn)

Inkweld supports **passkeys** — the W3C WebAuthn standard — allowing users to sign in with their device's screen lock, fingerprint reader, or face recognition instead of a password. Passkeys are phishing-resistant and work across all modern browsers and operating systems.

---

## How Passkeys Work in Inkweld

- **Discoverable credentials (usernameless):** Users don't need to type a username. The browser presents any passkey registered for your site and the user confirms with biometrics or a PIN.
- **Device-synced or single-device:** Passkeys backed by a password manager (e.g., iCloud Keychain, Google Password Manager, 1Password) sync across devices. Hardware-key passkeys are tied to one device.
- **Alongside existing auth:** Passkeys are additive. Users who registered with a password or GitHub OAuth can also add one or more passkeys; passkey-only accounts are supported.

---

## Server Configuration

Passkeys require two environment variables to be set correctly in production. Without them, the WebAuthn ceremony will fail with origin or RP ID mismatches.

### WEBAUTHN_RP_ID

**Required for production** | String (domain name only, no protocol or port)

The [Relying Party ID](https://www.w3.org/TR/webauthn-2/#rp-id) — the effective domain of your deployment. Must be a registrable suffix of the origin from which users access Inkweld.

```bash
# Single domain deployment
WEBAUTHN_RP_ID=inkweld.yourcompany.com

# Apex domain
WEBAUTHN_RP_ID=yourcompany.com

# Local development (default)
WEBAUTHN_RP_ID=localhost
```

:::danger RP ID cannot change after users register passkeys

If you change `WEBAUTHN_RP_ID` after users have registered passkeys, **all existing passkeys will stop working**. They cannot be migrated to a new RP ID. Users will need to delete their old passkeys (if they can still log in via password) and re-register.

:::

:::tip Local development

`WEBAUTHN_RP_ID` defaults to `localhost` when not set. This is correct for local dev where both the frontend and backend run on `localhost` (different ports are fine — the RP ID is the hostname only).

:::

### WEBAUTHN_RP_NAME

**Optional** | String | Default: `"Inkweld"`

A human-readable name for your site shown in the browser's passkey registration prompt.

```bash
WEBAUTHN_RP_NAME="Acme Writing Platform"
```

---

## ALLOWED_ORIGINS and Passkeys

The `ALLOWED_ORIGINS` variable (required for CORS) also controls which origins are accepted during WebAuthn ceremonies. Ensure it includes every origin from which users will access the app:

```bash
ALLOWED_ORIGINS=https://inkweld.yourcompany.com
```

If users access Inkweld from multiple origins (e.g., a custom domain and a `*.pages.dev` preview), all origins must be listed:

```bash
ALLOWED_ORIGINS=https://inkweld.yourcompany.com,https://inkweld.pages.dev
```

---

## Example Production Configuration

```bash
SESSION_SECRET=<32+ char random secret>
ALLOWED_ORIGINS=https://inkweld.yourcompany.com
WEBAUTHN_RP_ID=inkweld.yourcompany.com
WEBAUTHN_RP_NAME="Acme Writing Platform"
```

---

## User Guide: Managing Passkeys

Users can manage their passkeys from **Account Settings → Passkeys** (navigate to `/settings`).

### Registering a passkey

1. Go to **Account Settings** (`/settings`).
2. Scroll to the **Passkeys** section.
3. Click **Add passkey**.
4. Follow your browser or device prompt (fingerprint, face, PIN, or security key).
5. The passkey appears in the list immediately.

### Signing in with a passkey

1. Click **Log in** on any page.
2. In the login dialog, click **Sign in with a passkey** (the fingerprint button).
3. Your browser shows a prompt — select a passkey and confirm with biometrics or PIN.
4. You are logged in without entering a username or password.

### Renaming a passkey

1. In **Account Settings → Passkeys**, click the **edit** (pencil) icon next to a passkey.
2. Enter a new name (e.g., "Work MacBook", "iPhone") and click **Save**.

### Deleting a passkey

1. In **Account Settings → Passkeys**, click the **delete** (trash) icon next to a passkey.
2. Confirm the deletion.

:::warning Keep a fallback sign-in method

If you delete all your passkeys and have no password set, you may be unable to sign in. Keep at least one passkey or ensure you have a password or GitHub OAuth linked.

:::

---

## Browser Support

Passkeys are supported in all modern browsers:

| Browser       | Minimum Version |
| ------------- | --------------- |
| Chrome / Edge | 108+            |
| Safari        | 16+             |
| Firefox       | 122+            |

Older browsers will not show the passkey button in the login dialog.

---

## Database Schema

Passkeys are stored in two tables:

| Table                   | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `userPasskeys`          | Registered credential IDs, public keys, counters, device metadata                              |
| `webauthnChallenges`    | Single-use challenges (5-minute expiry). Cleaned up automatically.                             |
| `passkeyRecoveryTokens` | Hashed magic-link tokens used by the passwordless recovery flow. Single-use, 60-minute expiry. |

Migrations:

- `backend/drizzle/0023_add-passkeys.sql`
- `backend/drizzle/0024_add-passkey-recovery-tokens.sql`

---

## Passwordless Mode

Inkweld can be configured for **passwordless-only** authentication — disabling username/password sign-in entirely so passkeys are the only way to access an account. This is the default for new deployments (per [NIST SP 800-63B Rev. 4](https://pages.nist.gov/800-63-4/) recommendations on phishing-resistant authenticators).

### Enabling passwordless mode

Two server-side settings control the auth surface:

| Setting                  | Default | Effect when `false`                                                                                        |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `PASSWORD_LOGIN_ENABLED` | `false` | `/login`, `/forgot-password`, `/reset-password` return 403/404; registration form omits the password field |
| `EMAIL_RECOVERY_ENABLED` | `false` | The "Lost your passkey?" link is hidden; the magic-link recovery endpoint returns 404                      |

Both can be set via environment variables on first boot, or changed at runtime by an admin via **Admin → Settings**.

```bash
# Passwordless-first deployment with email-based recovery
PASSWORD_LOGIN_ENABLED=false
EMAIL_RECOVERY_ENABLED=true
```

:::warning Existing password users without a passkey

When you flip `PASSWORD_LOGIN_ENABLED` from `true` to `false`, any user who had an account but never registered a passkey **will be locked out** until they go through the email recovery flow (which requires `EMAIL_RECOVERY_ENABLED=true` and a working SMTP setup) to enrol one. The admin UI requires you to type "disable password login" to confirm this change.

Existing password hashes are preserved while disabled, so flipping the flag back on restores access for all those users.

:::

:::tip Lockout safety guard

The admin settings UI will refuse to disable password login while passkeys are also disabled — that combination would lock everyone out. Re-enable passkeys first.

:::

### Magic-link passkey recovery

When `PASSWORD_LOGIN_ENABLED=false` and `EMAIL_RECOVERY_ENABLED=true`, users who lose access to their device can recover their account via email:

1. User clicks **Lost your passkey?** in the login dialog (or visits `/recover-passkey` directly).
2. They enter the email address registered on their account.
3. Inkweld emails them a one-time recovery link valid for **60 minutes**.
4. The link opens `/recover-passkey/redeem?token=...` and prompts them to enrol a **new** passkey on the current device.
5. On success, the new passkey is added to their account. **Existing passkeys are NOT removed** — recovery is purely additive, so a recovered phone doesn't invalidate the user's other devices.
6. The user is then redirected to the login screen to sign in with the new passkey. No session is granted by the recovery flow itself.

Recovery tokens are stored hashed (SHA-256) so a database leak does not expose the magic-link URLs. Each token is single-use.

For the recovery email to deliver, you must also configure SMTP — see the email configuration section.
