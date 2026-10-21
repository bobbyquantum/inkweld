---
id: local-first-design
title: Local-First Design
description: Understanding how Inkweld stores and syncs your data using a local-first architecture.
sidebar_position: 8
---

# Local-First Design

Inkweld uses a **local-first architecture**—your data is stored in your browser first, then synced to the server when connected. This means you can work without an internet connection and never lose your work.

## How It Works

### Everything Starts Local

When you work in Inkweld, all data is saved to your browser's **IndexedDB** immediately:

- **Project elements** (folders, documents, worldbuilding entries)
- **Document content** (the text you write)
- **Worldbuilding schemas** (custom templates you create)
- **Relationships and tags**
- **Publish plans**
- **Media files** (images, covers)

This happens automatically—you don't need to "save" manually.

### Syncing (When Connected)

How far your work travels depends on your [mode](../getting-started/client-mode):

- **Browser** — nothing leaves this browser. There is nothing to sync.
- **Cloud Sync** — Inkweld mirrors your projects into your own Dropbox, Google Drive or Nextcloud a few seconds after you stop typing, and whenever you open the app. Use **Sync now** in the user menu to push and pull immediately.
- **Inkweld Server** — Inkweld syncs your changes to an Inkweld server over a live WebSocket connection. This adds backup on the server, access from several devices and real-time collaboration with other users.

In every mode, **local storage happens first**, so even if the connection drops, your work is safe.

## Connection States

While you work in a project, Inkweld shows the connection state in a slim bar at the bottom of the project tree. The bar only appears when something needs your attention: it stays hidden while everything is synced, and with a Browser profile. When the sidebar is collapsed, the same state shows as a single icon.

| Icon             | Status                    | Meaning                                                                                      |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Cloud with check | **Connected**             | Synced with the server (no bar is shown in the expanded sidebar)                             |
| Cloud with slash | **Offline**               | Working locally; changes are saved to your browser and will sync when the connection returns |
| Warning          | **Connection Failed**     | Cannot reach the server (hover for the last error)                                           |
| Folder           | **Saved in this browser** | Browser profiles only: there is no server, so nothing is waiting to sync                     |

:::note[No "Reconnecting" State]
When the connection is interrupted, Inkweld shows **Offline** rather than a separate reconnecting state. The retry button spins while it tries again, and the app keeps working normally with local data.
:::

Each open document also has a small sync dot in the editor's status bar, so you can check a single document.

### Media Sync

Images and other media files sync separately from your text. On a server, open **Project Settings** and look in the **Sync** section for **Media Library Sync**:

| Item               | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| **Server**         | How many media files (and how much space) are on the server |
| **Local Cache**    | How many are stored on this device                          |
| **Needs Download** | Files on the server that this device doesn't have yet       |
| **Needs Upload**   | Files on this device the server doesn't have yet            |
| **Last Checked**   | When Inkweld last compared the two                          |

While files download, a progress bar and a percentage appear. When both "Needs" counts are zero, all media is synced. If your server limits how much each account can store, uploads of new media can pause while you are over the limit; the files stay safe on your device.

### Retrying Connection

If you are Offline and want to force a reconnection attempt:

1. Click the **Retry sync** button (the circular arrow) in the bar at the bottom of the project tree
2. A **Reconnecting…** message appears briefly
3. You then see either **Reconnected successfully**, or a message that the server couldn't be reached and you are still working offline with changes saved locally

This is useful after regaining internet access or if you want to verify you're connected. In Cloud Sync mode the same button runs a sync with your cloud storage.

## What Syncs When

### Opening a Project

When you open a project:

1. **Local data loads first** from IndexedDB (instant)
2. **WebSocket connects** to the server (with a Server profile)
3. **Two-way sync** merges any changes from other devices

This means you see your content immediately, even if the server is slow or unavailable.

### While Working

As you work, changes sync continuously:

- **Edits** sync as you type (debounced for efficiency)
- **Structure changes** (creating folders, moving elements) sync immediately
- **Metadata** (project title, element names) syncs as you change it

### Offline Edits

If you make changes while offline:

1. Changes save to IndexedDB immediately
2. When you reconnect, changes sync automatically
3. **Conflict resolution** uses CRDT (Conflict-free Replicated Data Types)

### Sync All on the Bookshelf

With a Server profile, the Bookshelf header has a **Sync All** button. It syncs every project you have downloaded to this device (an "activated" project) with the server, in one go. While it runs, the button shows a percentage; click it to cancel.

Sync All is quick even for large projects because Inkweld first asks the server which documents have changed since last time. A document is skipped only when it hasn't changed on the server **and** you haven't edited it on this device since the last sync. Anything that changed on either side is synced, and when Inkweld can't tell, it syncs the document to be safe. So a Sync All can only ever do extra work, never skip an edit.

The button is greyed out, with a tooltip explaining why, when you are offline, a sync is already running, or no project has been downloaded to this device yet.

### Leaving a Project with Unsynced Changes

If you leave a project while some changes haven't reached the server yet, Inkweld asks **Unsynced Changes** and offers **Stay** or **Leave**. Choose **Stay** to give it a moment to finish syncing. If you choose **Leave**, your changes remain in your browser and sync the next time you open the project while connected.

## Conflict Resolution

Inkweld uses **Yjs**, a CRDT library, to handle concurrent edits. This means:

- Multiple people can edit the same document simultaneously
- Offline edits merge cleanly when reconnecting
- No manual conflict resolution required

### How Merging Works

CRDTs track the _intention_ of each edit, not just the result. When merging:

- Insertions are preserved from both sources
- Deletions are respected
- The final document contains all intended changes

For example, if you add a paragraph offline while a collaborator adds a different paragraph online, both paragraphs appear in the merged document.

### Edge Cases

In rare scenarios with simultaneous edits to the _exact same text_:

- Characters may interleave
- Review the content after reconnecting
- Use [document snapshots](./documents#document-snapshots) to restore earlier versions if needed

## Browser Storage

### Where Data Lives

Inkweld stores data in your browser using:

| Storage Type     | Purpose                                      |
| ---------------- | -------------------------------------------- |
| **IndexedDB**    | Documents, elements, media files, sync state |
| **LocalStorage** | App configuration, user preferences          |

### Storage Limits

Modern browsers allocate generous storage limits:

| Browser | Typical Limit                     |
| ------- | --------------------------------- |
| Chrome  | Up to 60% of available disk space |
| Firefox | Up to 50% of available disk space |
| Safari  | ~1GB (may prompt for more)        |

For most writing projects, you'll never approach these limits.

Each profile on a device keeps its own copy of its projects, so removing or switching one profile doesn't touch the others.

### Clearing Storage

If you clear your browser's site data, **you will lose unsynced changes**, and with a Browser profile that means your projects. Before clearing:

1. Make sure nothing is waiting to sync (no Offline bar, and **Connected** on a Server profile)
2. Or [export your project](./import-export) as a backup

### If the App Gets Stuck

If Inkweld won't load or keeps misbehaving after a reload, you can wipe its local data and start fresh from the **Clear All Data** page at `/reset` on your Inkweld address (for example `https://your-inkweld-address/reset`). Click **Proceed and Clear Data** to confirm.

:::danger[This deletes local data]
It signs you out and removes everything Inkweld stored in this browser: cached covers and images, all offline project data, your session and your settings. Any unsynced changes are **permanently lost**. With a Browser profile that means all of your projects, so [export them](./import-export) first if you can. Projects already synced to a server or cloud storage can be downloaded again afterwards.
:::

## Choosing How Your Data Is Stored

The [three modes](../getting-started/client-mode) all use the local-first design described above. They differ in where else your work is copied:

### Browser

- **No server connection** at all
- All data stored only in your browser
- Use **Export** to back up projects

### Cloud Sync

- Your projects live in your browser and are mirrored to your own Dropbox, Google Drive or Nextcloud
- Works offline, syncs when connected
- Use it across devices without running a server

### Inkweld Server

- **Local-first** with sync to an Inkweld server
- Data exists in both browser and server
- Works offline, syncs when connected
- Enables collaboration and multi-device access

### Moving Up Later

You can move to the next step at any time from the user menu (your avatar, top right of the project tabs or the Bookshelf): a Browser profile shows **Connect to sync**, and a Cloud Sync profile shows **Move to a server**. See [Choosing Your Mode](../getting-started/client-mode) for the details.

:::tip
Even with an Inkweld Server, you're using the local-first architecture. The server is an additional sync target, not the primary storage location.
:::

## Best Practices

### Regular Backups

While Inkweld's local-first design protects against connection issues, you should still:

- **Export projects** periodically as backups
- Keep important projects synced to a server
- Use [publish plans](../publishing/publish-plans) to generate shareable files

### Before Traveling

If you'll be working without internet:

1. Open your project while connected (ensures full sync)
2. Check that no **Offline** or **Connection Failed** bar is showing at the bottom of the project tree
3. You're ready to work offline

### Checking Sync Status

Look at the bar at the bottom of the project tree (or the icon, if the sidebar is collapsed). If you see:

- **Nothing** (or **Connected**): All changes are synced
- **Offline**: Working locally (changes will sync when reconnected)
- **Connection Failed**: Check your internet connection or whether the server is up
- **Saved in this browser**: Your projects live only in this browser, so keep your own [backups](./import-export)
