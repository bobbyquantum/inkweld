---
title: Admin Guide
description: Server administration and configuration for Inkweld
sidebar_position: 1
---

# Admin Guide

This guide covers server administration for Inkweld, including user management, system settings, and AI feature configuration.

## Accessing the Admin Panel

The admin panel is available at `/admin` and is only accessible to users with administrator privileges.

To access the admin panel:

1. Log in with an admin account
2. Click the user menu (avatar) in the top-right corner
3. Select **Admin** from the dropdown menu

Settings changed in the admin panel are stored in the database and take
precedence over the matching environment variables, which in turn take
precedence over the built-in defaults. See
[Configuration](/docs/configuration) for the environment-variable equivalents.

:::note[The one exception]
**AI Kill Switch** works the other way round: if `AI_KILL_SWITCH` is set in the
environment, the toggle is locked and the environment value wins. See
[AI Kill Switch](./ai-kill-switch.md).
:::

## Admin Sections

### Users

Manage user accounts:

- Approve or reject pending registrations (when user approval is required).
  **Rejecting does not delete the account:** it stays unapproved, the person is
  signed out and cannot sign in. Use **Delete** to remove it. If the person
  gave an email address and email is enabled, they are sent a notice.
  A rejected account leaves the **Pending** tab and is listed under **All
  Users** with a **Rejected** status, where you can still **Approve** or
  **Delete** it. When the person tries to sign in they are told their
  registration was not approved, instead of being shown the "awaiting
  approval" page
- Search all users by username or email
- Enable or disable accounts, and grant or remove admin status
- Delete accounts, including every project the user owns (users can also
  delete their own account from Settings → Account or `/delete-account`). The
  last enabled administrator cannot be deleted
- Open **Projects & storage** to see each of a user's projects and how much
  document and media storage it uses, and to set the user's sync capacity
  allowance (see [Sync Capacity](./sync-capacity.md))

### Settings

System-wide switches, using the labels shown in the admin page:

- **AI Kill Switch** — master control that disables every AI feature. See
  [AI Kill Switch](./ai-kill-switch.md).
- **Require User Approval** — new registrations wait for an admin before they
  can sign in
- **Passkey Authentication**, **Password Login** and **Email-based Account
  Recovery** — which sign-in and recovery methods are offered. Some changes ask
  you to type a confirmation phrase, and you cannot turn off both passkeys and
  password login. See [Passkeys](./passkeys.md).
- **MCP Access** — whether external tools can connect to projects over the
  Model Context Protocol. The AI kill switch overrides it.
- **Require Email Address** — registration asks for an email address (needed for
  password resets and notifications)
- **Password Policy** — minimum length and required character classes
- **Site URL** — the public URL used in email links and notifications
- **Sync capacity limits** — per-user storage allowance. See
  [Sync Capacity](./sync-capacity.md).
- **Privacy Policy & Terms** — publish your legal documents at `/privacy` and
  `/terms` (as Markdown, or as a redirect to a URL), and optionally require
  users to accept them
- **Custom HTML Injection** and **Content Security Policy** — raw HTML injected
  into every page, for analytics or a consent manager, and the policy that
  governs the scripts it may load

The last two are covered in [Legal Pages & Custom HTML](./custom-html.md).

### Appearance

Customise the full-screen backgrounds behind the login page and home screen, and
choose whether users may personalise their own. See
[Appearance](./appearance.md).

### Announcements

Write announcements (typed as _Announcement_, _Update_ or _Maintenance_, with
low, normal or high priority) that signed-in users see on their **Messages**
page. Tick **Show to unauthenticated users** to also show one on the home page
to visitors who are not logged in. An optional expiry date retires an
announcement automatically. Announcements start as drafts; publish one to show
it, or unpublish it to turn it back into a draft.

### Email

Turn on **Enable Email** and fill in the SMTP server it sends through:

- **SMTP Host**, **Port** and **Encryption** (STARTTLS on 587, TLS/SSL on 465,
  or none on 25)
- **Username** and **Password** (leave the password blank to keep the saved one)
- **Sender Identity**: **From Address** and **From Name**

Click **Save SMTP Settings**, then **Send Test Email** to send a message to the
email address on your own admin account (the account needs one). The same
settings can come from the `EMAIL_*` environment variables.

Inkweld sends these emails, and only when email is enabled:

| Email                                                     | When                                               |
| --------------------------------------------------------- | -------------------------------------------------- |
| Welcome                                                   | A new account can sign in straight away            |
| Account awaiting approval                                 | Registration while **Require User Approval** is on |
| Account approved                                          | An admin approves a pending user                   |
| Registration update (rejected)                            | An admin rejects a pending user                    |
| Password reset request, and password changed confirmation | Password login with email recovery on              |
| Add a new passkey                                         | Passkey recovery link (valid 15 minutes)           |

### GitHub

Let users sign in with their GitHub account. The page walks through creating a
GitHub OAuth app and pasting its credentials. See
[GitHub OAuth](./github-oauth.md).

### System Health

Totals for users, projects and pending approvals, plus server uptime, version
and runtime.

### AI Providers, AI Images, AI Text and Image Audits

These sections are hidden while the AI kill switch is on.

- **AI Providers** — API keys (and endpoints) shared by every AI feature
- **AI Images** — image generation providers and profiles. See
  [AI Image Generation](./ai-image-generation.md).
- **AI Text** — the models and prompts used for AI linting and for turning
  worldbuilding data into image prompts

- **Image Audits** — a log of every AI image generation: who made it, the
  profile and prompt used, credits consumed, and whether it succeeded or was
  moderated. Search by prompt text or filter by status. See
  [AI Image Generation](./ai-image-generation.md#image-audits).

## Crawlers

The server answers `/robots.txt` itself: ordinary search engines are allowed,
and well-known AI training crawlers (GPTBot, CCBot, ClaudeBot, Google-Extended
and others) are disallowed. The hosted web app ships an equivalent file.
Legitimate AI assistants are expected to connect through the authenticated MCP
endpoint, not by crawling.

## Admin API

Every setting above is stored as a key in the database and can be read and
changed by an admin over the API under `/api/v1/admin/config`
(`GET /keys`, `GET /`, `GET /{key}`, `PUT /{key}`, `DELETE /{key}`). Deleting a
key reverts it to the environment value or default. Secret values such as API
keys are returned masked. See the [API reference](/docs/developer/api) for
details.

## Quick Links

- [AI Kill Switch](./ai-kill-switch) - Control AI feature availability
- [Docker Deployment](/docs/installation/docker) - Deploy Inkweld with Docker
- [Configuration](/docs/configuration) - Environment variables and customization
