---
id: real-time
title: Real-Time Collaboration
description: Write simultaneously with co-authors using Inkweld's conflict-free collaboration.
sidebar_position: 1
---

# Real-Time Collaboration

Multiple authors can edit the same document simultaneously. Changes appear instantly for everyone, and the system automatically merges edits without conflicts.

## How It Works

Inkweld uses **Conflict-free Replicated Data Types (CRDTs)** through the Yjs library. When multiple people edit a document:

- Changes merge automatically—no manual conflict resolution
- Everyone's edits are preserved
- Edits sync when reconnected after working offline
- Updates appear in milliseconds

## Presence Indicator

When collaborators are viewing the same document, a presence indicator appears in the toolbar:

- **Avatar circles** display each user's initials with a unique color
- **Tooltip** shows the username on hover
- **User count** shows how many collaborators are currently viewing

## Collaborative Cursors

Each collaborator's cursor appears in the document with their assigned color. Name labels identify who's typing where, and selection highlights show what text they have selected.

## Connection Status

The sync indicator in the toolbar shows your current state:

| Status | Meaning |
|--------|---------|
| **Connected** | Full real-time sync active |
| **Reconnecting** | Temporarily disconnected, retrying |
| **Offline** | No connection; changes saved locally |

When you reconnect after working offline, local and remote changes merge automatically.

## Troubleshooting

**Changes not appearing?**
- Check the sync indicator for connection issues
- Ask collaborators to check their connection
- Try refreshing the page

**Text looks garbled after simultaneous edits?**
- This can happen briefly when two people type at the exact same position
- Pause for a moment to let sync complete, then clean up as needed

---

**Next:** [Sharing Projects](./sharing) - Invite collaborators and manage access.
