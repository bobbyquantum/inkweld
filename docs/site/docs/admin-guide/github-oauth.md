---
title: GitHub OAuth
description: Configure GitHub sign-in for your Inkweld instance
sidebar_position: 5
---

# GitHub OAuth

Allow users to sign in to your Inkweld instance using their GitHub account. This is optional — password-based authentication always works alongside OAuth.

## Overview

When GitHub OAuth is enabled:

- A **Sign in with GitHub** button appears on the login and registration pages
- Users can authenticate without creating a separate password
- New GitHub users are automatically created in Inkweld (subject to admin approval settings)
- Returning GitHub users are matched by their GitHub ID

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
5. Inkweld fetches the user's GitHub profile (username, email, display name)
6. If the user exists (matched by GitHub ID), they are logged in
7. If the user is new, an Inkweld account is created automatically
8. The user receives a JWT session token and is redirected to the home page

### User Approval

If **Require User Approval** is enabled in Settings, new GitHub users will need admin approval before they can access the app. They will be redirected to the approval-pending page after their first sign-in.

### Account Linking

- Users are matched by their **GitHub numeric ID**, not their username
- If a GitHub user changes their username, they will still be linked to the same Inkweld account
- GitHub users can later set a password in Account Settings to also use password-based login

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

The callback URL configured in GitHub must exactly match your Inkweld instance URL. Check that:

- The protocol matches (`https` vs `http`)
- The domain and port match
- The path is `/api/v1/auth/github`

### User stuck on approval-pending

If user approval is required, an admin needs to approve the user in **Admin → Users**.

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
