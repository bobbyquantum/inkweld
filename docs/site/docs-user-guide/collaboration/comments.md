---
id: comments
title: Comments
description: Add, reply to, resolve and delete comments on passages of a document.
sidebar_position: 2
---

# Comments

Comments attach a note to a passage of text without changing the text itself. Use them to leave feedback for a co-author, flag something to fix later, or ask a question about a scene.

## Adding a Comment

1. Select the text you want to comment on.
2. Press `Ctrl + Alt + M` (`Cmd + Option + M` on macOS), or click the **Comment** button in the menu that appears next to the selection.
3. Type your comment and click **Comment**.

The passage is highlighted. Click the highlight at any time to open the comment.

## The Comment Popover

Clicking a highlight opens a popover showing the thread: who started it, when, and every reply. From the popover you can:

- **Reply** — type in the reply box and press the send button.
- **Resolve** — mark the discussion as finished. The highlight fades but stays in place, so the context is not lost.
- **Unresolve** — reopen a resolved thread.
- **Delete** — remove the thread and its highlight.
- **Close** — dismiss the popover. The comment is not changed.

## The Comments Panel

Click the **Comments** button in the editor toolbar to open a panel beside the document. It lists every thread in the document, lined up with the passage it belongs to, and scrolls with the text.

- Click a thread to expand it and read the replies.
- Resolved threads are marked with a tick.
- An expanded thread has **Resolve** (or **Unresolve**) and **Delete thread** buttons.
- Hovering over a thread highlights its passage in the document.

## Who Can Do What

On a server project:

| Action              | Who                                             |
| ------------------- | ----------------------------------------------- |
| Read comments       | Anyone with access to the project               |
| Add, reply, resolve | The owner and collaborators with write access   |
| Delete a thread     | The person who started it, or the project owner |

Comments are stored on the server and appear for every collaborator. New threads and replies show up in the project's [activity feed](./activity-and-stats#project-activity-tab).

In **Browser** and **Cloud Sync** modes, which have no Inkweld server, comments are stored inside the document itself, and a resolved comment cannot be reopened.

Comments are never included in published output (EPUB, PDF, HTML or Markdown).

:::note
Deleting your account also deletes every comment you wrote, including comments on other people's projects.
:::

## Comments and Editing

The highlight is tied to the text, not to a position: it moves as you write above it and stretches or shrinks as you edit inside it. If you delete the whole passage, the comment disappears with it. Undo (`Ctrl/Cmd + Z`) brings the passage and its comment back.
