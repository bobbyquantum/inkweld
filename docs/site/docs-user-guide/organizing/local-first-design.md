---
id: local-first-design
title: Local-First Design
description: Understanding how Inkweld stores and syncs your data using a local-first architecture.
sidebar_position: 5
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

### Server Sync (When Connected)

If you're using **server mode**, Inkweld also syncs your changes to the server in real-time using WebSocket connections. This enables:

- Backup of your data on the server
- Access from multiple devices
- Real-time collaboration with other users

The key benefit: **local storage happens first**, so even if the server connection drops, your work is safe.

## Connection States

The sync indicator in the project sidebar shows your current connection status:

| Icon | Status | Meaning |
|------|--------|---------|
| ✓ Cloud | **Connected** | Synced with server |
| Cloud with slash | **Offline Mode** | Working locally (changes saved to browser) |
| ⚠️ Error | **Connection Failed** | Cannot reach server |

:::note No "Reconnecting" State
When the connection is interrupted, Inkweld simply shows "Offline Mode" rather than a separate reconnecting state. The app continues working normally with local data while attempting to reconnect in the background.
:::

### Retrying Connection

If you're in offline mode and want to force a reconnection attempt:

1. Click the **sync icon** in the project sidebar
2. Inkweld will attempt to reconnect to the server

This is useful after regaining internet access or if you want to verify you're connected.

## What Syncs When

### Opening a Project

When you open a project:

1. **Local data loads first** from IndexedDB (instant)
2. **WebSocket connects** to the server (if in server mode)
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

## Conflict Resolution

Inkweld uses **Yjs**, a CRDT library, to handle concurrent edits. This means:

- Multiple people can edit the same document simultaneously
- Offline edits merge cleanly when reconnecting
- No manual conflict resolution required

### How Merging Works

CRDTs track the *intention* of each edit, not just the result. When merging:

- Insertions are preserved from both sources
- Deletions are respected
- The final document contains all intended changes

For example, if you add a paragraph offline while a collaborator adds a different paragraph online, both paragraphs appear in the merged document.

### Edge Cases

In rare scenarios with simultaneous edits to the *exact same text*:

- Characters may interleave
- Review the content after reconnecting
- Use [document snapshots](./documents#document-snapshots) to restore earlier versions if needed

## Browser Storage

### Where Data Lives

Inkweld stores data in your browser using:

| Storage Type | Purpose |
|--------------|---------|
| **IndexedDB** | Documents, elements, media files, sync state |
| **LocalStorage** | App configuration, user preferences |

### Storage Limits

Modern browsers allocate generous storage limits:

| Browser | Typical Limit |
|---------|--------------|
| Chrome | Up to 60% of available disk space |
| Firefox | Up to 50% of available disk space |
| Safari | ~1GB (may prompt for more) |

For most writing projects, you'll never approach these limits.

### Clearing Storage

If you clear your browser's site data, **you will lose unsynced changes**. Before clearing:

1. Ensure you see "Connected" in the sync indicator
2. Or export your project as a backup

## Offline Mode vs Server Mode

These are the two operating modes chosen during [initial setup](../getting-started/client-mode):

### Offline Mode

- **No server connection** at all
- All data stored only in your browser
- Use **Export** to back up projects
- Can switch to server mode later (in Settings)

### Server Mode

- **Local-first** with server sync
- Data exists in both browser and server
- Works offline, syncs when connected
- Enables collaboration and multi-device access

:::tip
Even in server mode, you're using the local-first architecture. The server is an additional sync target, not the primary storage location.
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
2. Check the sync indicator shows "Connected"
3. You're ready to work offline

### Checking Sync Status

Look for the sync indicator in the project sidebar. If you see:

- **Connected**: All changes are synced
- **Offline Mode**: Working locally (changes will sync when reconnected)
- **Connection Failed**: Check your internet connection

---

**Next:** [Project Structure](./project-structure) — Organize your project with folders and elements.
