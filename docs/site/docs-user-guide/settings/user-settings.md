---
id: user-settings
title: User Settings
description: Configure your account, appearance, connected apps, project tree and editor preferences.
sidebar_position: 1
---

# User Settings

User settings control your Inkweld experience across all projects. Open the settings dialog from the account menu in the top navigation. It has six sections: **Account**, **General**, **Appearance**, **Authorized Apps**, **Project Tree** and **Project**.

## Account

The **Account** tab holds your display name, email address and sign-in methods, plus the public profile controls below.

### Public profile

Every user has a profile page at `/<username>` showing their avatar, display name, a short **bio**, a [writing activity grid](../collaboration/activity-and-stats.md#profile-activity-grid) and a list of their projects. You decide who gets to see it.

**Who can see your profile** has three levels:

| Level                 | Who can open your profile page                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Public**            | Anyone with the link, including visitors who are not signed in                                    |
| **Members only**      | Only people signed in to the same Inkweld server                                                  |
| **Private** (default) | Only you, plus server administrators for moderation. Everyone else sees "This profile is private" |

Below that, **What is shown on your profile** lets you set a separate level for each section:

- **Writing activity** — the day-by-day grid, streaks and yearly totals
- **Projects** — titles and descriptions of the projects you own (private by default, since project names can give away unpublished work)

A section can be _more_ private than your profile but never more public: if your profile is members-only, a "Public" section is still only visible to members. The pickers only offer levels that make sense for your current profile level, and narrowing your profile pulls any wider section down with it.

Administrators can open any profile, including private ones, for moderation purposes. Your own profile always shows you everything, along with a badge indicating its current visibility. Use **Edit profile** on the page, or **View my profile** in the Account tab, to hop between the two.

:::note
Profile visibility is a server-side setting and is not shown in local-only mode, where there is no one else to share with.
:::

### Sign-in methods

Under **Authentication** the Account tab lists how you can sign in — passkeys, password and GitHub, depending on what your server allows. Passkeys can be added, renamed and removed here.

## General

### Guided Tours

**Offer guided tours on new screens** controls whether Inkweld offers a short tour the first time you open a screen. When it is off, no tour is offered automatically — you can still start one from the account menu.

## Appearance

### Density

Choose how tightly the app's chrome is packed — the sidebar, tabs, toolbars and status bars:

- **Comfortable** — roomier rows and taller bars
- **Compact** — tighter chrome, so more of your project fits on screen

Your writing is never resized.

### Background

If your server administrator allows it, you can pick the background shown behind the home screen and other signed-in pages. Choose **Site default** to use the server's background, or one of the built-in presets (Inkweld, Midnight, Dusk, Forest, Parchment, Slate, or Plain). If uploads are also allowed, **Upload image** lets you use a picture of your own (PNG, JPEG, WebP, GIF or AVIF, up to 12 MB). Your personal background is only ever shown to you.

The login page always uses the server's background — nobody is signed in when it renders. When your administrator has not enabled personal backgrounds, this section is hidden.

:::tip
Light or dark mode is chosen from the **Theme** control in the account menu, not in this dialog.
:::

## Authorized Apps

Lists the third-party applications — such as AI assistants connected over MCP — that you have granted access to your projects. For each one you can review and change which projects it may reach, grant access to another project, revoke a single project, or disconnect the app entirely. See [MCP Clients](../ai-mcp/mcp-clients.md).

## Project Tree

### Confirm Element Moves

When enabled, Inkweld asks for confirmation before moving documents or folders in the project tree. This prevents accidental reorganization.

### Show Breadcrumbs

When enabled, the folder path of the open document or element is shown above the editor.

## Project

### Enable Fullscreen in Zen Mode

When enabled, Zen mode expands to fill your entire screen for distraction-free writing. When disabled, Zen mode stays within the app window.

### Use Tabs (Desktop Only)

When enabled, open documents appear in tabs at the top of the editor area. When disabled, only the current document is shown.

### Auto-save Snapshots

When enabled (the default), Inkweld saves a snapshot of each document you edited when you close its tab or leave the project. See [Auto-Snapshots](../writing/snapshots.md#auto-snapshots).

## Server Connections

Switching servers, adding a new connection and moving a browser-only project to a server are done from the **account menu** rather than this dialog: use **Switch profile**, **Add profile…** or **Manage profiles…**. See [Profiles: Switching, Adding and Upgrading](../getting-started/client-mode.md#profiles-switching-adding-and-upgrading).

---

**Next:** [Project Settings](./project-settings) - Configure project-level options.
