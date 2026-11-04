---
title: GitHub OAuth
description: Configure GitHub sign-in for your Inkweld instance
sidebar_position: 5
---

# GitHub OAuth

Allow users to sign in to your Inkweld instance using their GitHub account. This is optional, and works alongside the other sign-in methods you have enabled (passkeys, and password login if you turned it on).

## Overview

When GitHub OAuth is enabled:

- A **Sign in with GitHub** button appears on the login and registration pages
- Users can authenticate without creating a separate password
- New GitHub users are automatically created in Inkweld (subject to admin approval settings)
- Returning GitHub users are matched by their GitHub ID
- An existing Inkweld account is never linked to GitHub automatically, even when the email addresses match

## Prerequisites

- A running Inkweld instance accessible via a public URL (or localhost for development)
- A GitHub account to create the OAuth application

## Setup

### Option A: Admin Panel (Recommended)

1. Log in as an admin and go to **Admin → GitHub**
2. Follow the built-in setup guide, which walks through:
   - Creating a GitHub OAuth App
   - Entering your credentials
   - Enabling the feature

### Option B: Environment Variables

Set the following environment variables before starting the server:

```bash
GITHUB_ENABLED=true
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
# Optional — auto-detected if not set:
GITHUB_CALLBACK_URL=https://your-instance.com/api/v1/auth/github
```

These can be placed in your `.env` file or set via Docker/Cloudflare Workers configuration.

:::tip
Settings configured in the Admin Panel take priority over environment variables. You can use env vars for initial setup and then manage them from the admin panel.
:::

## Creating a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in the form:

| Field                          | Value                                                  |
| ------------------------------ | ------------------------------------------------------ |
| **Application name**           | Your Inkweld instance name (e.g., "My Inkweld")        |
| **Homepage URL**               | Your Inkweld URL (e.g., `https://inkweld.example.com`) |
| **Authorization callback URL** | `https://inkweld.example.com/api/v1/auth/github`       |

4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** and copy the secret immediately — it won't be shown again

:::warning
Keep your Client Secret secure. Never commit it to version control.
:::

## How It Works

The OAuth flow:

1. User clicks **Sign in with GitHub** on the login page
2. User is redirected to GitHub to authorize your Inkweld instance
3. GitHub redirects back with an authorization code
4. Inkweld exchanges the code for a GitHub access token
5. Inkweld fetches the user's GitHub profile (username, verified email, display name)
6. If the user exists (matched by GitHub ID), they are logged in
7. If the user is new, an Inkweld account is created automatically, unless another Inkweld account already uses their verified email address (see [Account Linking](#account-linking)). The account takes the GitHub username, unless another account already has that name (ignoring letter case), it is reserved or it is shorter than 3 characters; then it gets a free variant such as `octocat-2` (or `tj-2` for the GitHub username `tj`)
8. Inkweld redirects the browser to the app with a one-time code (valid for 60 seconds), which the app exchanges for a session token, so the token never appears in a URL

### User Approval

If **Require User Approval** is enabled in Settings, new GitHub users will need admin approval before they can access the app. They will be redirected to the approval-pending page after their first sign-in.

### Account Linking

- Users are matched by their **GitHub numeric ID**, not their username or email address
- If a GitHub user changes their username, they will still be linked to the same Inkweld account
- GitHub users can later set a password in Account Settings to also use password-based login
- An existing Inkweld account is never linked to GitHub automatically. When a new GitHub user's verified email address is already used by another Inkweld account, sign-in stops and no second account with that address is created. Addresses that differ only in letter case count as the same address. The app tells the person that the address is already in use: if that account is theirs, they sign in to it the way they usually do, and if they don't recognize it, they contact you (see [Troubleshooting](#troubleshooting)).
- Accounts that were already linked to a GitHub account keep signing in with GitHub as before
- Only an email address GitHub has verified is stored. When a linked user's verified address on GitHub changes, Inkweld stores the new one, unless another Inkweld account already uses it.
- There is no setting for connecting GitHub to an existing account

## Scopes

Inkweld requests the following GitHub OAuth scopes:

| Scope        | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| `read:user`  | Read the user's public profile (username, display name, avatar) |
| `user:email` | Read the user's email address                                   |

No write access to repositories or other GitHub resources is requested.

## Troubleshooting

### "GitHub OAuth is not enabled"

The feature is disabled. Enable it in **Admin → GitHub** or set `GITHUB_ENABLED=true`.

### "GitHub OAuth is not properly configured"

The Client ID or Client Secret is missing. Check your credentials in **Admin → GitHub**.

### Redirect URI mismatch

The callback URL configured in GitHub must exactly match the URL Inkweld sends. Unless you set `GITHUB_CALLBACK_URL` (or the **Callback URL** field in **Admin → GitHub**), Inkweld builds it from the request's `X-Forwarded-Proto` and `Host` headers, so behind a reverse proxy make sure those headers are forwarded or set the callback URL explicitly. Check that:

- The protocol matches (`https` vs `http`)
- The domain and port match
- The path is `/api/v1/auth/github`

### User stuck on approval-pending

If user approval is required, an admin needs to approve the user in **Admin → Users**.

### "This email address is already used by another Inkweld account"

The email address GitHub has verified for this user is already used by an Inkweld account that isn't linked to their GitHub account (see [Account Linking](#account-linking)). To find that account, search for the address in **Admin → Users**. The list includes pending, rejected and disabled accounts, which keep their address too.

- **The account is theirs.** They sign in to it the way they usually do: with a passkey or password, through single sign-on, or with the GitHub account it is linked to. If they can't, they can get back in by email: with **Forgot password?** on the sign-in page when password sign-in is on, or through account recovery when **Email-based Account Recovery** is on (see [Passkeys](./passkeys.md#enabling-passwordless-mode)).
- **They don't recognize the account.** It may still belong to someone else who typed this address by mistake, so check first: look at its projects and when it was last used, and contact its owner if you can. Only delete an account that is unused or abandoned. Delete it in **Admin → Users** (this also deletes its projects); their next GitHub sign-in then creates a new account. Don't send them through email recovery for an account they don't recognize: recovery adds a way to sign in to it and keeps the ones it already has.

## Docker Configuration

```yaml
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    environment:
      GITHUB_ENABLED: 'true'
      GITHUB_CLIENT_ID: 'your_client_id'
      GITHUB_CLIENT_SECRET: 'your_client_secret'
      # Only needed if behind a reverse proxy with a different URL:
      # GITHUB_CALLBACK_URL: "https://inkweld.example.com/api/v1/auth/github"
```

## Cloudflare Workers

Set secrets via Wrangler:

```bash
wrangler secret put GITHUB_CLIENT_SECRET --env production
```

Add variables to `wrangler.toml`:

```toml
[env.production.vars]
GITHUB_ENABLED = "true"
GITHUB_CLIENT_ID = "your_client_id"
```
