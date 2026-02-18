---
id: project-search
title: Project Search
description: Search for text across all documents in your project at once.
sidebar_position: 6
---

import ThemedImage from '@site/src/components/ThemedImage';

# Project Search

Project Search lets you find any word or phrase across every document in your project at once — handy when you can't remember which chapter a scene is in, or when you need to track down every mention of a character name.

## Opening Project Search

| Platform | Shortcut              |
| -------- | --------------------- |
| macOS    | `⌘ + Shift + F`       |
| Windows  | `Ctrl + Shift + F`    |
| Linux    | `Ctrl + Shift + F`    |

You can also open it from the **search icon** (`manage_search`) in the sidebar toolbar, or from the collapsed sidebar when the panel is hidden.

## Searching

Type your query and results appear instantly as you type:

- **Case insensitive** — searches are not case-sensitive
- **Partial matches** — "moon" matches "moonlight" and "Moonveil"
- **Document count** — the number of matches per document is shown next to the title
- **Breadcrumb path** — the folder path to each result is shown beneath the document name

<ThemedImage
  src="/img/features/project-search-results"
  alt="Project Search dialog showing results across multiple documents"
/>

## Result Snippets

Each result shows up to three text snippets from the document, with the matching word or phrase **highlighted**. This gives you context to identify the right result without having to open each document.

## Opening a Result

Click any result to immediately open that document and jump to the first match. The document opens in a new tab (or switches to it if already open).

## Keyboard Navigation

| Key      | Action                           |
| -------- | -------------------------------- |
| `↑` `↓`  | Move selection between results   |
| `Enter`  | Open the selected document       |
| `Escape` | Close Project Search             |

## Tips

- Use Project Search to audit consistency — search for a character&#39;s old name before and after a rename to make sure nothing was missed
- The match count badge on each result helps you prioritise — a document with 12 matches is more likely to be the one you want than one with 1

:::tip Also try Find in Document
Once you&#39;ve opened the right document, use **`Ctrl/Cmd + F`** to jump between individual matches within it.
:::

---

**Related:** [Quick Open](./quick-open) · [Find in Document](../writing/editor#find-and-replace)
