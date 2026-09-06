---
id: user-settings
title: User Settings
description: Configure your personal preferences for connection, project tree, and editor behavior.
sidebar_position: 1
---

# User Settings

User settings control your Inkweld experience across all projects. Open the settings dialog from the user menu in the top navigation.

## Account

The **Account** tab holds your display name, email address and sign-in methods, plus the public profile controls below.

### Public profile

Every user has a profile page at `/<username>` showing their avatar, display name, a short **bio**, a [writing activity grid](../collaboration/activity-and-stats.md#profile-activity-grid) and a list of their projects. You decide who gets to see it.

**Who can see your profile** has three levels:

| Level | Who can open your profile page |
| --- | --- |
| **Public** | Anyone with the link, including visitors who are not signed in |
| **Members only** | Only people signed in to the same Inkweld server |
| **Private** (default) | Only you, plus server administrators for moderation. Everyone else sees "This profile is private" |

Below that, **What is shown on your profile** lets you set a separate level for each section:

- **Writing activity** — the day-by-day grid, streaks and yearly totals
- **Projects** — titles and descriptions of the projects you own (private by default, since project names can give away unpublished work)

A section can be *more* private than your profile but never more public: if your profile is members-only, a "Public" section is still only visible to members. The pickers only offer levels that make sense for your current profile level, and narrowing your profile pulls any wider section down with it.

Administrators can open any profile, including private ones, for moderation purposes. Your own profile always shows you everything, along with a badge indicating its current visibility. Use **Edit profile** on the page, or **View my profile** in the Account tab, to hop between the two.

:::note
Profile visibility is a server-side setting and is not shown in local-only mode, where there is no one else to share with.
:::

## Connection Settings

Manage how Inkweld connects to a server or works offline.

### Server Mode

When connected to a server:
- View your current server URL
- Enter a new server URL to switch servers
- Switch to offline mode (disconnects from server)

### Offline Mode

When working offline:
- Migrate projects to a server when you're ready to connect
- Create an account or log in during migration
- Projects sync automatically after migration

## Project Tree Settings

Control behavior when organizing your project structure.

### Confirm Element Moves

When enabled, Inkweld asks for confirmation before moving documents or folders in the project tree. This prevents accidental reorganization.

## Editor Settings

Customize your writing environment.

### Zen Mode Fullscreen

When enabled, Zen mode expands to fill your entire screen for distraction-free writing. When disabled, Zen mode stays within the app window.

### Use Tabs on Desktop

When enabled, open documents appear in tabs at the top of the editor area. When disabled, only the current document is shown.

---

**Next:** [Project Settings](./project-settings) - Configure project-level options.
