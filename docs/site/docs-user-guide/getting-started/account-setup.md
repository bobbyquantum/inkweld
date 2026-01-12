---
id: account-setup
title: Creating Your Account
description: Sign up for Inkweld and log in to start writing.
sidebar_position: 2
---

# Creating Your Account

When connected to an Inkweld server, you'll need to create an account to save your work and collaborate with others.

## Registration

From the login page, click **Register** to create a new account.

### Registration Form

Enter the following details:

| Field | Description |
|-------|-------------|
| **Username** | A unique identifier (3+ characters). Used in your project URLs. |
| **Password** | A strong password (8+ characters with complexity requirements). |
| **Confirm Password** | Re-enter your password to confirm. |

As you type your username, Inkweld checks availability in real-time:
- ✅ Green checkmark — username is available
- ❌ Red X — username is taken (suggestions may be shown)

Click **Register** to create your account.

## Approval Process

Some Inkweld instances require administrator approval before new accounts can access the system. This is controlled by the server administrator.

If approval is required:

1. After registering, you'll see an **"Approval Pending"** message
2. An administrator will review your registration
3. Once approved, you can log in normally

:::info
Contact your instance administrator if your account is pending approval. Administrators can manage users via the admin CLI — see the [Admin CLI documentation](/docs/admin-guide/admin-cli) for details.
:::

## Logging In

Once your account is active:

1. Go to the Inkweld login page
2. Enter your **username** and **password**
3. Click **Log In**

Your session remains active until you log out or close the browser.

## Session Security

Inkweld uses secure session-based authentication:

- Sessions use **httpOnly cookies** that can't be accessed by JavaScript
- **CSRF protection** prevents unauthorized actions
- Sessions are tied to your browser

### Logging Out

To end your session:

1. Click your username in the top navigation bar
2. Select **Log Out**

Always log out when using a shared or public computer.

---

**Next:** [The Bookshelf](./dashboard) — Explore your project library.
