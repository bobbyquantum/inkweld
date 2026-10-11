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

When other collaborators have the project open, a presence indicator appears at the right of the tab bar:

- **Avatar circles** show each person's profile picture, or a generated icon if they have not uploaded one
- **Status badges** on each avatar show what they are doing: a pencil (✎) while they are **editing**, and an ellipsis (…) when they are **idle**. Hover over an avatar to see their username and status
- **Overflow chip** (**+2**, for example) groups extra people when there are more avatars than fit; hover it to see their names
- **Label** such as "3 users online" counts everyone currently in the project

The indicator is hidden when you are the only one there.

### Presence on other tabs

Canvas and timeline tabs have their own small row of avatars in their toolbar. It shows only the people who are looking at that same canvas or timeline right now, using the same pencil and ellipsis badges, so you can tell before you start drawing or rearranging events that someone else is already there.

## Collaborative Cursors

Each collaborator's cursor appears in the document with their assigned color. Name labels identify who's typing where, and selection highlights show what text they have selected.

## Connection Status

The sync indicator shows the state of your connection to the server. When the sidebar is expanded, or on a phone, it appears as a slim strip at the bottom that shows up only when something needs your attention (you are offline, reconnecting or cannot connect). When the sidebar is collapsed, a cloud icon is always shown instead. Hover over either for details.

| Status                | Icon        | Meaning                                                                                                       |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| **Connected**         | Cloud, tick | Full real-time sync active; hover to see "Project is synced with server"                                      |
| **Offline Mode**      | Cloud, off  | No connection (or still connecting). Changes are saved locally and Inkweld keeps retrying                     |
| **Connection Failed** | Error       | The server could not be reached; the tooltip includes the last error                                          |
| **Local Mode**        | Folder      | You are working in Browser mode, so there is no server to connect to; this is normal (the strip stays hidden) |

While Inkweld is connecting, the status reads **Offline Mode** and the **Retry sync** button spins (its tooltip reads "Connecting to server..."). Brief drops of a few seconds, such as when you switch browser tabs, are not shown, so the indicator does not flicker. Press the sync button to retry right away. When you reconnect, local and remote changes merge automatically.

If your server limits storage and your account is over its allowance, a short warning appears next to the status. Editing and syncing keep working; only new uploads are paused. See [User Settings](../settings/user-settings).

## Troubleshooting

**Changes not appearing?**

- Check the sync indicator for connection issues
- Ask collaborators to check their connection
- Try refreshing the page

**Text looks garbled after simultaneous edits?**

- This can happen briefly when two people type at the exact same position
- Pause for a moment to let sync complete, then clean up as needed
