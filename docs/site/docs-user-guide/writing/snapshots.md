---
id: snapshots
title: Snapshots & Version History
description: Save and restore document snapshots to protect your writing.
sidebar_position: 4
---

# Snapshots & Version History

Snapshots let you save point-in-time copies of your documents and worldbuilding elements. If you make changes you want to undo, or just want a safety net before a big rewrite, snapshots have you covered.

## What Is a Snapshot?

A snapshot captures the full content of a document or worldbuilding element at a specific moment. Unlike undo/redo (which only goes back within a single session), snapshots persist across sessions and can be restored at any time.

Each snapshot stores:

- **Document content** (all text and formatting)
- **Word count** at the time of capture
- **Name and description** you provide
- **Timestamp** of when it was created

## Creating a Snapshot

1. Open a document or worldbuilding element
2. Click the **history icon** (🕘) in the toolbar
3. Click **New Snapshot**
4. Give your snapshot a name (e.g., "Before rewrite") and an optional description
5. Click **Create**

Your snapshot appears in the list immediately.

:::tip When to Snapshot
Good times to create a snapshot:
- Before a major rewrite or restructure
- When you reach a milestone (finished a chapter, completed a character arc)
- Before experimenting with a different direction
:::

## Restoring a Snapshot

1. Open the snapshots dialog via the **history icon** in the toolbar
2. Find the snapshot you want to restore
3. Click the **three-dot menu** (⋮) on the snapshot
4. Select **Restore**
5. Confirm the restore in the dialog

:::caution
Restoring a snapshot replaces the current content of your document. Consider creating a new snapshot of the current state before restoring an older one, so you don't lose your latest work.
:::

## Deleting a Snapshot

1. Open the snapshots dialog
2. Click the **three-dot menu** (⋮) on the snapshot
3. Select **Delete**
4. Confirm the deletion

Deleted snapshots cannot be recovered.

## Auto-Snapshots

Inkweld can automatically create snapshots of your edited documents, providing a safety net without any manual action.

### How Auto-Snapshots Work

Auto-snapshots are triggered in two situations:

- **Closing a document tab** — when you close a tab for a document you edited, an auto-snapshot is created for that document.
- **Leaving the project** — when you navigate away from the project, auto-snapshots are created for any remaining edited documents that haven't been snapshotted yet.

Additional details:

- Auto-snapshots are named **"Auto-save — document name — date"** so you can tell them apart from manual snapshots
- A maximum of **10 auto-snapshots** are kept per document — older ones are pruned automatically
- To prevent excessive snapshots, each document is auto-snapshotted at most **once every 5 minutes**

### Enabling or Disabling Auto-Snapshots

Auto-snapshots are **enabled by default**. To toggle them:

1. Open **Settings** (click your avatar → Settings)
2. Go to the **Project** tab
3. Check or uncheck **Auto-save snapshots**

### Auto-Snapshots vs. Manual Snapshots

| Feature | Manual Snapshots | Auto-Snapshots |
|---------|-----------------|----------------|
| Created by | You, on demand | Automatically on tab close or project exit |
| Naming | Custom name & description | Auto-generated name with timestamp |
| Pruning | Never auto-deleted | Oldest pruned beyond 10 per document |
| Best for | Intentional milestones | Safety net against accidental loss |

Both types are stored the same way and can be restored identically.

## Snapshots in Local Mode

Snapshots work fully in local mode (offline, no server). They are stored in your browser's IndexedDB alongside your project data. When connected to a server, snapshots sync automatically.

## Worldbuilding Snapshots

Snapshots are not limited to documents — you can also snapshot **worldbuilding elements** (characters, locations, items, etc.). The workflow is the same: open the element, click the history icon, and create or restore snapshots.
