---
id: user-settings
title: User Settings
description: Configure your account, appearance, connected apps, project tree and editor preferences.
sidebar_position: 1
---

# User Settings

User settings control your Inkweld experience across all projects. Click your avatar in the top navigation and choose **Settings**. It has six sections: **Account**, **General**, **Appearance**, **Authorized Apps**, **Project Tree** and **Project**.

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

### Sync capacity

In server mode, the Account tab has a **Sync capacity** section showing how much server storage your projects use: documents, media, covers and published files for the projects you own. Projects other people share with you count against their owner, not you.

- If your server limits storage, a meter shows what you have **used** out of your allowance. It turns to a warning as you approach the limit.
- If the server does not set a limit, it simply shows how much you use.
- When the allowance is reached the meter says **Storage full**. New uploads (images, covers, published files) and new projects are paused; media you add stays on your device and uploads once there is room. **Editing, syncing, reading, exporting and deleting all keep working.**
- To make room, delete unused media or projects, or ask your server administrator for more capacity.

The same meter appears in the bookshelf's top bar when your server enforces a limit, and a **Storage full** warning shows beside the connection status inside a project.

### Sign-in methods

Under **Authentication** the Account tab lists how you can sign in — passkeys, password and GitHub, depending on what your server allows. Passkeys can be added, renamed and removed here. See [Creating Your Account](../getting-started/account-setup#managing-passkeys).

### Delete account

In server mode, the bottom of the Account tab has a **Delete account…** button. Deleting your account is permanent and removes:

- every project you own, with its documents, worldbuilding, media and published files
- your profile, avatar, banner and background
- your passkeys, sign-in sessions, authorized apps and your access to projects shared with you
- comments you wrote, including on other people's projects

You are asked to type your username to confirm. **Export any projects you want to keep first.** The button is not shown in Browser or Cloud Sync mode, where no server account exists. If you can no longer sign in, the public `/delete-account` page on your server lets you sign in and delete from there, and your server administrator can also delete the account for you.

## General

### Guided Tours

**Offer guided tours on new screens** controls whether Inkweld offers a short tour the first time you open a screen. When it is off, no tour is offered automatically — you can still start one whenever you like.

A tour is a short, step-by-step walk-through that highlights parts of the screen. There are tours for the bookshelf, the project workspace and the canvas. When one is offered, a card asks whether to **Take the tour**, **Not now**, or **Don't show tutorials**; the last switches this setting off for all tours, including ones added later.

To replay a tour, open your avatar menu and choose **Take a tour** (on the bookshelf and, on larger screens, inside a project). The canvas tour is replayed from the help button in the canvas sidebar.

### Writing

**Convert Markdown as I type** is off by default. When it is on, typing `# `, `> `, `- ` or `1. ` at the start of a line turns it into a heading, quote or list, and **bold** or _italic_ is formatted as you close it. It also turns straight quotes into curly ones. If a conversion isn't what you wanted, press **Backspace** straight away to undo it. The setting applies to documents you open after changing it.

It is off by default because prose often starts a line with `#` or `-`.

## Appearance

### Density

Choose how tightly the app's chrome is packed — the sidebar, tabs, toolbars and status bars:

- **Comfortable** — roomier rows and taller bars
- **Compact** (the default) — tighter chrome, so more of your project fits on screen

Your writing is never resized.

### Background

If your server administrator allows it, you can pick the background shown behind the home screen and other signed-in pages. Choose **Site default** to use the server's background, or one of the built-in presets (Inkweld, Midnight, Dusk, Forest, Parchment, Slate, or Plain). If uploads are also allowed, **Upload image** lets you use a picture of your own (PNG, JPEG, WebP, GIF or AVIF, up to 12 MB). Your personal background is only ever shown to you.

The login page always uses the server's background — nobody is signed in when it renders. When your administrator has not enabled personal backgrounds, this section is hidden.

:::tip
Light or dark mode is chosen from the **Theme** control in the avatar menu, not in this dialog. It has three buttons: **Light**, **Dark** and **Follow System**, which switches with your device's own light/dark setting.
:::

## Authorized Apps

Lists the third-party applications — such as AI assistants connected over MCP — that you have granted access to your projects. For each one you can review and change which projects it may reach, grant access to another project, revoke a single project, or disconnect the app entirely. See [MCP Clients](../ai-mcp/mcp-clients.md).

## Project Tree

### Confirm Element Moves

When enabled, Inkweld asks for confirmation before moving documents or folders in the project tree. This prevents accidental reorganization.

### Show Breadcrumbs

When enabled, the folder path of the open document or element is shown above the editor.

### Clicking a Folder Opens It

The setting reads "Clicking a folder opens its corkboard as well as expanding it". It is off by default: clicking a folder in the project tree only expands or collapses it, and you open its [corkboard and outline](../organizing/scenes-corkboard-outline#opening-a-folder) by double-clicking or with **Open Folder**. When enabled, a click also opens the folder in a tab. Clicking an expanded folder then opens it without collapsing it; use the arrow beside it to collapse.

## Project

### Enable Fullscreen in Zen Mode

When enabled, Zen mode expands to fill your entire screen for distraction-free writing. When disabled, Zen mode stays within the app window.

### Use Tabs (Desktop Only)

When enabled, open documents appear in tabs at the top of the editor area. When disabled, only the current document is shown.

### Auto-save Snapshots

When enabled (the default), Inkweld saves a snapshot of each document you edited when you close its tab or leave the project. See [Auto-Snapshots](../writing/snapshots.md#auto-snapshots).

## Server Connections

Switching servers, adding a new connection and moving a browser-only project to a server are done from the **account menu** rather than this dialog: use the switch-profile button beside your name, then **Add profile…** or **Manage profiles…**. See [Profiles: Switching, Adding and Upgrading](../getting-started/client-mode.md#profiles-switching-adding-and-upgrading).
