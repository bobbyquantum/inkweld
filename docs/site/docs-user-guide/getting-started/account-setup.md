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

On the welcome page click **Register**. If you are looking at the login dialog instead, click **Don't have an account? Register here**. Either way you get the **Register for Inkweld** dialog.

### Choose a username

Your username is a unique identifier (3+ characters) that appears in your project URLs. As you type, Inkweld checks availability:

- ✅ Green checkmark — username is available
- ❌ Red X — username is taken (suggestions may be shown)

Two more fields follow:

- **Display Name** (optional) — the name shown to other people instead of your username.
- **Email Address** — your administrator decides whether it is required. When it is, the hint says it is needed for password resets and notifications; otherwise it is optional. Email is also what lets you recover a lost passkey (see below), so it is worth adding.

If password login is enabled on your instance, you'll also set a password and confirm it. The hint under the password field lists what your server requires.

If your server has a Privacy Policy or Terms of Service, the form may also show an **I have read and agree to the…** checkbox that you must tick before you can register. See [Privacy Policy and Terms](#privacy-policy-and-terms).

If your server offers GitHub or another sign-in provider, you will see an **Or register with:** row of buttons below the form.

### Set up your passkey

After clicking **Register**, your browser prompts you to create a passkey. Confirm with Face ID, Touch ID, Windows Hello, your device PIN, or by tapping a security key. That's it — there is no password to remember.

Passkeys stored in a password manager (iCloud Keychain, Google Password Manager, 1Password, and similar) sync to your other devices. Passkeys on a hardware key stay on that key.

## Approval Process

Some Inkweld instances require administrator approval before new accounts can access the system.

If approval is required:

1. After registering, you'll see a **Registration Successful!** page with the heading **Awaiting Administrator Approval**
2. An administrator will review your registration request
3. Once approved, you can log in normally. Click **Return to Login** to go back to the welcome page

:::info
Contact your instance administrator if your account is pending approval. Administrators manage users from the [Admin Panel](/docs/admin-guide/overview).
:::

## Logging In

1. Go to the Inkweld login page
2. Click **Sign in with passkey**
3. Your browser lists the passkeys registered for this site — pick one and confirm

You don't need to type a username; the passkey identifies you. If your instance has password login enabled, enter your username and password instead and click **Login**.

### Lost your passkey?

If the device holding your only passkey is lost, click **Lost your passkey?** on the login page. When the administrator has enabled email recovery, Inkweld emails you a one-time link that lets you register a new passkey. Otherwise, contact your administrator.

## Managing Passkeys

Add a passkey for each device you write on, and keep at least one working sign-in method at all times.

1. Click your avatar in the top bar and choose **Settings**
2. Go to the **Account** tab and find the **Passkeys** section
3. Click **Add passkey** and follow the device prompt

From the same list you can **rename** a passkey (for example "Work laptop" or "Phone") or **delete** one you no longer use.

:::warning
Deleting your last passkey on an account with no password locks you out unless email recovery is available. Add the new device before removing the old one.
:::

## Privacy Policy and Terms

Administrators can publish a **Privacy Policy** and **Terms of Service** for their server. When they have, you will see:

- **Privacy Policy** and **Terms of Service** links on the welcome page, the login and register dialogs, the account-recovery and approval pages, and the About page. Each opens in a new tab. A link only appears for a document your server has actually published.
- The **I have read and agree to the…** checkbox when you register, if the administrator requires acceptance.
- A **Please review our policies** dialog (titled **Our policies have changed** when the text was updated since you last agreed) if you are already signed in. It blocks the app until you click **I agree**. Use the links in the dialog to read the documents first. Clicking **Sign out** declines; you can sign back in later and accept then.

If you would rather not accept, you can still delete your account from the public `/delete-account` page.

## Session Security

- Passkeys are bound to your instance's domain, so they cannot be phished by look-alike sites

### Logging Out

1. Click your avatar in the top navigation bar
2. Select **Log out**

Always log out when using a shared or public computer.

:::info[Using Inkweld through Home Assistant]
If you open Inkweld from the Home Assistant sidebar, Home Assistant signs you in automatically as your Home Assistant user, creating your Inkweld account the first time. There is no sign-in page, and no **Log out** or account-switching button in the app, because Home Assistant decides who is signed in.
:::
