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

| Table                | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `userPasskeys`       | Registered credential IDs, public keys, counters, device metadata  |
| `webauthnChallenges` | Single-use challenges (5-minute expiry). Cleaned up automatically. |

Migration: `backend/drizzle/0023_add-passkeys.sql`
