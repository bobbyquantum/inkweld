---
id: ai-review
title: AI Review
description: Get AI grammar, spelling and style suggestions for a document and accept or reject them one by one.
sidebar_position: 5
---

# AI Review

**Auto-Review** asks an AI model to read your document and suggest fixes for grammar, spelling and style. Each suggestion is highlighted in your text, and you decide whether to apply it. Nothing changes until you click **Accept**.

## When It Is Available

Auto-Review is optional and is **only shown when your server administrator has turned AI on**. If you do not see the **Auto-Review** button at the right-hand end of the editor toolbar, your server does not offer it. In that case ask your administrator. For them to enable it:

- The **AI Kill Switch** must be off
- **AI Text Generation** must be enabled
- A text provider must be configured with an API key on the AI Providers page

Auto-Review is not available without a server, so it does not appear in local-only mode.

:::caution[Your text is sent to an AI provider]
When you run a review, the text of the document is sent to the AI provider your administrator has configured (for example OpenAI, OpenRouter, Anthropic or a compatible service). Do not run a review on writing you are not comfortable sharing with that provider. Ask your administrator which provider is used and how it handles data.
:::

## Running a Review

1. Open the document you want checked
2. Click the **Auto-Review** button (the spell-check icon) at the right-hand end of the toolbar. The Auto-Review panel opens on the right
3. Click **Start Review**
4. Wait while the panel shows **Reviewing document…**

You need write access to the project to run a review. With read-only access the panel shows "You need write access to run a review."

The review reads the copy of the document held on the server, so let your latest edits finish syncing first (the sync dot in the status bar should show **Document synced**).

If the review finds nothing, the panel says **No suggestions**, with a **Run Again** button.

## Working Through Suggestions

Suggested problems are underlined in the document and listed in the panel beside the text they refer to. Each one is marked as an **Error**, **Warning** or **Suggestion**, with a category such as grammar or spelling.

Click a suggestion, or click the highlighted text in the document, to open it. You will see an explanation and, usually, the original wording next to the proposed replacement.

| Button     | What it does                                                                        |
| ---------- | ----------------------------------------------------------------------------------- |
| **Accept** | Replaces the text with the suggestion                                               |
| **Reject** | Leaves your text as it is and tells Auto-Review not to suggest the same thing again |
| **Undo**   | Appears once a suggestion is resolved, to take back an Accept or Reject             |

Resolved suggestions stay in the panel, labelled **Accepted** or **Rejected**, so you can see what you have done.

## Panel Buttons

At the top of the panel, once a review has run:

- **Re-review**: Clears the current marks and runs a fresh review
- **Dismiss review**: Removes all the review highlights and returns the panel to its starting state
- **Close**: Hides the panel. Highlights and suggestions stay in the document until you dismiss them

## Rejected Suggestions Are Remembered

When you reject a suggestion, Inkweld remembers it for that document and tells the AI not to repeat it on later reviews. Before you start a review the panel shows how many rejected suggestions are **on record**. Click **Reset** to forget them all and let those suggestions appear again.

## Tips

- Treat suggestions as a second pair of eyes, not a rule book. Fiction often breaks grammar deliberately, in dialogue especially. Reject freely
- Take a [snapshot](./snapshots) before accepting many suggestions in a row, so you can go back
- Reviews can be slow on long documents. Review a chapter at a time
