---
id: library
title: Media Library
description: View and manage all images and files in your project.
sidebar_position: 1
---

# Media Library

The Media Library shows all images and files associated with your project. Access it from the sidebar **Media** button when inside a project.

## What's in the Library

The library displays media from several sources:

| Category | Description |
|----------|-------------|
| **Cover** | Your project's cover image |
| **Generated** | AI-generated images (if enabled) |
| **Inline Images** | Images pasted or dropped into documents |
| **Published** | Exported files (EPUB, PDF, HTML, Markdown) |
| **Other** | Any other stored media |

The header shows total item count and storage size.

## How Media Gets Here

Images are added to the library automatically when you:

- **Paste or drop images** into the editor — saved automatically
- **Set a project cover** in project settings
- **Generate images with AI** (if configured)
- **Export your project** as EPUB, PDF, HTML, or Markdown

There's no manual upload button in the media tab itself. Images are added through these workflows.

## Filtering

Use the category buttons to filter what's displayed:

- **All** — Everything
- **Generated** — AI-generated images
- **Cover** — Project cover image
- **Inline Images** — Images embedded in documents
- **Published** — Export files
- **Other** — Uncategorized items

## Managing Media

### View

Click an image thumbnail to open the full-size image viewer.

### Download

Click the download icon on any item to save it to your device.

### Delete

Click the delete icon and confirm to remove an item.

:::warning
Deleting an inline image removes it from the library. Documents referencing it will show broken image placeholders.
:::

Cover images cannot be deleted from this view — remove or replace them through project settings.

## AI Image Generation

If your instance has AI image generation enabled, a **Generate Image** button appears in the header. See [AI Image Generation](./ai-generation) for details.

When generation is in progress, active jobs appear at the top showing status (queued, generating, saving). Completed images are added to the library automatically.

## Local-First Storage

Like all Inkweld data, media uses a **local-first architecture**:

- Images are stored in your browser's IndexedDB immediately
- When connected to a server, images sync automatically
- You can work offline—images are available without network access
- Changes sync bi-directionally when you reconnect

This means your images are always accessible, even without an internet connection.

---

**Next:** [Cover Images](./covers) — Add a cover image to your project.
