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
2. Click the **Snapshots** chip (with the history icon) in the status bar at the bottom of the editor
3. In the **Document Snapshots** dialog, click **New Snapshot**
4. Give your snapshot a name (e.g., "Before rewrite") and an optional description. If you leave the name blank, the current date and time are used
5. Click **New Snapshot** again to save it

Your snapshot appears in the list immediately.

:::tip[When to Snapshot]
Good times to create a snapshot:

- Before a major rewrite or restructure
- When you reach a milestone (finished a chapter, completed a character arc)
- Before experimenting with a different direction
  :::

## Restoring a Snapshot

1. Open the snapshots dialog via the **Snapshots** chip in the status bar
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

:::note
The three-dot menu also has a **Preview HTML** item. It is not available yet: choosing it only shows a "Preview feature coming soon" message. To see an older version, restore it (after taking a snapshot of your current text, as above).
:::

## Auto-Snapshots

Inkweld can automatically create snapshots of your edited documents, providing a safety net without any manual action.

### How Auto-Snapshots Work

Auto-snapshots are triggered in two situations:

- **Closing a tab** — when you close a tab for a document or worldbuilding element you edited, an auto-snapshot is created for it.
- **Leaving the project** — when you navigate away from the project, auto-snapshots are created for any remaining edited documents and elements that haven't been snapshotted yet.

Additional details:

- Auto-snapshots are named **"Auto-save — name — date"** so you can tell them apart from manual snapshots
- A maximum of **10 auto-snapshots** are kept per document — older ones are pruned automatically
- To prevent excessive snapshots, each document is auto-snapshotted at most **once every 5 minutes**

### Enabling or Disabling Auto-Snapshots

Auto-snapshots are **enabled by default**. To toggle them:

1. Open **Settings** (click your avatar → Settings)
2. Go to the **Project** tab
3. Tick or untick **Auto-save snapshots on tab close and project exit**

### Auto-Snapshots vs. Manual Snapshots

| Feature    | Manual Snapshots          | Auto-Snapshots                             |
| ---------- | ------------------------- | ------------------------------------------ |
| Created by | You, on demand            | Automatically on tab close or project exit |
| Naming     | Custom name & description | Auto-generated name with timestamp         |
| Pruning    | Never auto-deleted        | Oldest pruned beyond 10 per document       |
| Best for   | Intentional milestones    | Safety net against accidental loss         |

Both types are stored the same way and can be restored identically.

## Snapshots in Local Mode

Snapshots work fully in local mode (offline, no server). They are stored in your browser's IndexedDB alongside your project data. When connected to a server, snapshots sync automatically.

## Worldbuilding Snapshots

Snapshots are not limited to documents — you can also snapshot **worldbuilding elements** (characters, locations, items, etc.). The workflow is the same: open the element, click the **Snapshots** chip in its status bar, and create or restore snapshots. Worldbuilding elements are auto-snapshotted too.
