---
id: client-mode
title: Choosing Your Mode
sidebar_label: Choosing Your Mode
description: Choose between Browser, Cloud Sync and Realtime Sync when starting Inkweld.
sidebar_position: 1
---

import ThemedImage from '@site/src/components/ThemedImage';

# Choosing Your Mode

When you first open Inkweld, you'll see the mode selection screen. This lets you choose how you want to use the application.

:::tip Pre-Configured Instances
Some Inkweld instances are pre-configured to automatically start in server mode. If your instance has a fixed server URL configured in its build, you'll skip this screen and go directly to the login page.
:::

<ThemedImage
  src="/img/generated/setup-mode-selection"
  alt="Mode selection screen showing offline and server options"
/>

## Three Ways to Use Inkweld

|                                         |      Browser      |                Cloud Sync                |          Realtime Sync          |
| --------------------------------------- | :---------------: | :--------------------------------------: | :-----------------------------: |
| Where your writing lives                | This browser only | Your own Dropbox (more providers coming) |        An Inkweld server        |
| Account needed                          |       None        |       Your cloud provider account        | Inkweld account on that server  |
| Works offline                           |        ✅         |       ✅ (syncs when back online)        |   ✅ (syncs when back online)   |
| Use on several devices                  |        ⬜         |                    ✅                    |               ✅                |
| Real-time co-editing, presence, cursors |        ⬜         |                    ⬜                    |               ✅                |
| Share projects with collaborators       |        ⬜         |                    ⬜                    |               ✅                |
| Version history & snapshots             |     ✅ local      |                ✅ synced                 |            ✅ synced            |
| Media library & covers                  |        ✅         |                    ✅                    |               ✅                |
| Publishing (PDF, EPUB, HTML…)           |        ✅         |                    ✅                    |               ✅                |
| AI features, MCP API keys               |        ⬜         |                    ⬜                    | ✅ (if the server enables them) |
| Backup                                  |  Export archive   |    Continuous mirror + export archive    |     Server + export archive     |
| Move to another mode later              |        ✅         |                    ✅                    |               ✅                |
| Cost to run                             |       Free        |        Free (your storage quota)         |  Self-host, or a hosted server  |

### Browser

**Your projects live only in this browser.**

- All your data is stored **in your browser** using IndexedDB
- No account, no server, nothing to sign up for
- Projects can be **exported** as archive files for backup or sharing
- You can later move to Cloud Sync or connect to a server

Ideal for trying Inkweld, complete privacy, or writing on a single machine.

### Cloud Sync

**Keep writing across your devices using your own cloud storage.**

- Inkweld saves into its own folder in your cloud account (Dropbox today; it can only see that folder)
- Your projects still live in the browser and work offline; changes sync a few seconds after you stop typing and whenever you open the app
- Open Inkweld on another device, connect the same account, and your projects appear. Edits made on two devices before they sync are merged automatically
- There is no Inkweld server and no Inkweld account involved

Ideal for a single writer with a laptop and a phone, or anyone who wants an off-device copy without running a server.

### Realtime Sync

**Connect to an Inkweld server for collaboration.**

- Your data syncs to a server for backup and access from multiple devices
- **Real-time collaboration** with other users, with presence and shared cursors
- User accounts with authentication
- Admin features for managing users and settings

Ideal for writing teams, and for anyone who wants sync that keeps running while their browser is closed.

## Setting Up Cloud Sync

Choose **Cloud Sync**, pick your provider, and sign in on the provider's own page. Inkweld never sees your password; the provider hands back permission to use a single app folder.

- **First device:** Inkweld finds an empty folder and asks for a display name and username, prefilled from your account.
- **Another device:** Inkweld finds your existing folder and picks up the profile and project list automatically. Projects show as cards; open one to pull it onto that device.

The user menu shows the sync status and has a **Sync now** action.

:::info Permissions
Inkweld asks only for access to its own folder (for Dropbox, `Apps/Inkweld`). It cannot see or change anything else in your account. You can revoke access at any time from your provider's connected-apps settings.
:::

## Setting Up Browser Mode

If you choose **Browser**, you'll create a local profile:

<ThemedImage
  src="/img/generated/setup-offline"
  alt="Offline mode profile setup form"
/>

| Field            | Description                               |
| ---------------- | ----------------------------------------- |
| **Username**     | A short identifier (used in project URLs) |
| **Display Name** | Your name as shown in the app             |

Click **Start in Browser** to begin. Your profile is saved locally and you'll be taken to your bookshelf.

:::info Data Storage
In Browser mode, your projects are stored in your browser's IndexedDB. Clearing browser data will remove your projects, so use the **Export** feature to create backups.
:::

## Connecting to a Server

If you choose **Realtime Sync**, you'll enter your server's URL:

<ThemedImage
  src="/img/generated/setup-server"
  alt="Server connection form"
/>

Enter the full URL of your Inkweld server (e.g., `http://localhost:8333` for local development or `https://inkweld.example.com` for a hosted server).

Click **Connect to Server** to test the connection. If successful, you'll be redirected to the login or registration page.

:::tip Hosted Deployments
If you're accessing a hosted Inkweld deployment (like one on Cloudflare Workers), the server connection is configured automatically — you won't see this setup screen.
:::

## Switching Modes Later

### From Browser or Cloud Sync to a Server

If you start without a server and later want to sync to one:

1. Go to **Settings** (user menu → Settings)
2. Look for the **Connection** section
3. Enter your server URL and connect

Your local projects can then be synced to the server.

### Resetting Your Configuration

To start fresh and see the mode selection again:

1. Navigate to `/reset` in your browser
2. Choose what to reset (configuration, projects, or everything)
3. After reset, you'll see the setup screen again

---

**Next:** [Account Setup](./account-setup) — Create your account on a server, or skip to [The Bookshelf](./dashboard) if using Browser or Cloud Sync mode.
