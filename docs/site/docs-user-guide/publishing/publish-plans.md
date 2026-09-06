---
id: publish-plans
title: Publish Plans
description: Save export configurations for consistent, repeatable publishing.
sidebar_position: 2
---

# Publish Plans

A publish plan saves your export configuration so you can generate consistent output every time.

## What a Plan Contains

- **Format** — EPUB, PDF, HTML, or Markdown
- **Metadata** — Title, author, language, description
- **Content items** — Which documents to include, in what order
- **Options** — Include TOC, include cover

## Creating a Plan

1. Open your project
2. Click **Create Publish Plan** in the Publish Plans section
3. A new plan opens with default settings

## Configuring a Plan

### Metadata Section

| Field           | Purpose                            |
| --------------- | ---------------------------------- |
| **Plan Name**   | Internal name (e.g., "Final EPUB") |
| **Format**      | Output format                      |
| **Book Title**  | Title in the exported file         |
| **Author**      | Author name                        |
| **Language**    | Content language code (e.g., "en") |
| **Description** | Back cover blurb or summary        |

### Contents Section

Add documents to your publication:

1. Drag documents from the project tree into the list, or use the **Add** menu to pick documents, add everything at once, or insert a table of contents, frontmatter, backmatter, or separators
2. Items appear in the content list in publication order
3. Drag items (or use the arrow buttons) to reorder
4. Click the trash icon to remove

#### Statistics

The Contents section shows what you are about to publish:

- **Summary chips** above the list give the number of documents and worldbuilding entries, total word count, an estimated page count (275 words per page), and an estimated reading time
- **Per-item word counts** appear on each document row
- **Not synced** marks documents that have not been downloaded to this device yet; they are fetched automatically when you publish
- Use the **Recount words** button if you have edited documents since opening the plan

The same item, word, and page totals appear at the bottom of the plan's sidebar, next to a **Generate** button, so you can publish from any section.

### Options Section

- **Include Table of Contents** — Generate a TOC page
- **Include Cover Page** — Add your project cover to the export

## Generating Output

1. Add at least one content item
2. Click **Generate [Format]**
3. Wait for processing (happens in your browser)
4. The completion dialog shows file info
5. Click **Download** to save the file

The generated file is also saved to your Media Library under "Published."

## Preview

The **Preview** section renders the plan in your browser without saving a file:

- The toolbar shows whether the preview is current or the plan has changed since it was rendered, plus the rendered word count (and page count for PDF)
- For HTML and EPUB formats, switch between phone, tablet, and desktop widths
- Click **Refresh** to re-render after making changes

## Managing Plans

Plans are listed in the **Publishing** tab. Each card shows the plan's format, item count, and when it was last published; click a card to open and edit it, or expand its history to see previous exports.

Changes to a plan are saved automatically as you edit.

**Multiple Plans**: Create different plans for different purposes:

- "Manuscript PDF" for editors
- "Beta EPUB" for early readers
- "Archive Markdown" for backup

---

**Next:** [Customizing Output](./customization) — Metadata and options.
