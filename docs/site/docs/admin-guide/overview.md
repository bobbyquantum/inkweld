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
precedence over the matching environment variables. See
[Configuration](/docs/configuration) for the environment-variable equivalents.

## Admin Sections

### Users

Manage user accounts:

- Approve or reject pending registrations (when user approval is required)
- Search all users by username or email
- Enable or disable accounts, and grant or remove admin status
- Delete accounts
- Open **Projects & storage** to see each of a user's projects and how much
  document and media storage it uses

### Settings

System-wide switches:

- **AI Kill Switch** — master control that disables every AI feature. See
  [AI Kill Switch](./ai-kill-switch.md).
- **Require approval** — new registrations wait for an admin before they can
  sign in
- **Passkeys**, **password login** and **email recovery** — which sign-in and
  recovery methods are offered. See [Passkeys](./passkeys.md).
- **MCP access** — whether external tools can connect to projects over the
  Model Context Protocol, and whether the legacy API-key section is shown in
  project settings for tools that don't support OAuth
- **Require email** at registration
- **Password policy** — minimum length and required character classes
- **Site URL** — the public URL used in email links
- **Privacy policy & terms** and **custom HTML** — see
  [Legal Links & Custom HTML](./custom-html.md)

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

Enable transactional email (welcome emails, password resets, passkey recovery
links) and configure the SMTP server it is sent through.

### GitHub

Let users sign in with their GitHub account. The page walks through creating a
GitHub OAuth app and pasting its credentials. See
[GitHub OAuth](./github-oauth.md).

### System Health

Totals for users, projects and pending approvals, plus server uptime, version
and runtime.

### AI Providers, AI Images and AI Text

These sections are hidden while the AI kill switch is on.

- **AI Providers** — API keys shared by every AI feature
- **AI Images** — image generation providers and profiles. See
  [AI Image Generation](./ai-image-generation.md).
- **AI Text** — the models and prompts used for AI linting and for turning
  worldbuilding data into image prompts

### Image Audits

A log of every AI image generation request: who made it, the profile and
prompt used, credits consumed, and whether it succeeded or was moderated. Search
by prompt text or filter by status.

## Quick Links

- [AI Kill Switch](./ai-kill-switch) - Control AI feature availability
- [Docker Deployment](/docs/installation/docker) - Deploy Inkweld with Docker
- [Configuration](/docs/configuration) - Environment variables and customization
