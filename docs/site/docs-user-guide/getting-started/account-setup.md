---
id: account-setup
title: Creating Your Account
description: Sign up for Inkweld with a passkey or password and log in to start writing.
sidebar_position: 2
---

# Creating Your Account

When connected to an Inkweld server, you need an account to save your work and collaborate with others. Inkweld is **passwordless by default**: you sign in with a passkey — your device's fingerprint reader, face recognition, screen-lock PIN, or a hardware security key — instead of a password.

:::info[Your instance may differ]
Administrators can enable password login, GitHub sign-in, or both alongside passkeys. If you see a password field on the login page, your instance has it turned on.
:::

## Registration

From the login page, click **Register**.

### Choose a username

Your username is a unique identifier (3+ characters) that appears in your project URLs. As you type, Inkweld checks availability:

- ✅ Green checkmark — username is available
- ❌ Red X — username is taken (suggestions may be shown)

If password login is enabled on your instance, you'll also set a password (8+ characters) and confirm it.

### Set up your passkey

After clicking **Register**, your browser prompts you to create a passkey. Confirm with Face ID, Touch ID, Windows Hello, your device PIN, or by tapping a security key. That's it — there is no password to remember.

Passkeys stored in a password manager (iCloud Keychain, Google Password Manager, 1Password, and similar) sync to your other devices. Passkeys on a hardware key stay on that key.

## Approval Process

Some Inkweld instances require administrator approval before new accounts can access the system.

If approval is required:

1. After registering, you'll see an **"Approval Pending"** message
2. An administrator will review your registration
3. Once approved, you can log in normally

:::info
Contact your instance administrator if your account is pending approval. Administrators manage users from the [Admin Panel](/docs/admin-guide/overview).
:::

## Logging In

1. Go to the Inkweld login page
2. Click **Sign in with passkey**
3. Your browser lists the passkeys registered for this site — pick one and confirm

You don't need to type a username; the passkey identifies you. If your instance has password login enabled, enter your username and password instead and click **Log In**.

### Lost your passkey?

If the device holding your only passkey is lost, click **Lost your passkey?** on the login page. When the administrator has enabled email recovery, Inkweld emails you a one-time link that lets you register a new passkey. Otherwise, contact your administrator.

## Managing Passkeys

Add a passkey for each device you write on, and keep at least one working sign-in method at all times.

1. Open **User Settings** from your avatar in the top bar
2. Go to the **Account** tab and find the **Passkeys** section
3. Click **Add passkey** and follow the device prompt

From the same list you can **rename** a passkey (for example "Work laptop" or "Phone") or **delete** one you no longer use.

:::warning
Deleting your last passkey on an account with no password locks you out unless email recovery is available. Add the new device before removing the old one.
:::

## Session Security

Inkweld uses secure session-based authentication:

- Sessions use **httpOnly cookies** that can't be accessed by JavaScript
- **CSRF protection** prevents unauthorized actions
- Passkeys are bound to your instance's domain, so they cannot be phished by look-alike sites

### Logging Out

1. Click your username in the top navigation bar
2. Select **Log Out**

Always log out when using a shared or public computer.

---

**Next:** [The Bookshelf](./dashboard) — Explore your project library.
