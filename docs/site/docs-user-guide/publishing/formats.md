---
id: formats
title: Export Formats
description: Export your writing as EPUB, PDF, HTML, a multi-page website, or Markdown.
sidebar_position: 1
---

# Export Formats

Inkweld can export your writing in five formats: EPUB, PDF, HTML, Website, and Markdown.

## Available Formats

| Format       | Best For                               |
| ------------ | -------------------------------------- |
| **EPUB**     | E-readers, digital distribution        |
| **PDF**      | Print, manuscripts, archival           |
| **HTML**     | Web publishing, previewing             |
| **Website**  | Hosting a book as a multi-page website |
| **Markdown** | Backup, version control, migration     |

### EPUB

The industry-standard e-book format. Compatible with most e-readers (Kindle via conversion, Kobo, Apple Books, Google Play Books). Includes table of contents, cover, and metadata.

### PDF

Print-ready document typeset with Typst, running in your browser. Suitable for printing or digital reading.

### HTML

Single-file web output (shown in the format picker as **HTML (Single Page)**). Viewable in any browser. Includes embedded styling.

### Website

In the format picker this appears as **Website (Multi-Page HTML)**. It is a multi-page static website packaged as a ZIP, with one page per chapter and links between them. Unzip it and upload it to any web host.

### Markdown

Plain text with formatting. Maximum portability and version-control friendly.

## Creating an Export

Exports are created through publish plans:

1. Open your project
2. Open the **Publishing** tab and click **New Plan** (or **Create Your First Plan** if you have none yet)
3. Select a **Format** in the Metadata section
4. Add content items (documents, TOC)
5. Fill in metadata (title, author)
6. Click **Generate**

When generation finishes, a dialog offers to download the file and, if you are connected to a server, to share it. See [Publish Plans](./publish-plans#sharing-a-published-file).

## What's Included

Each export includes:

- **Cover image** — Your project cover (if enabled; EPUB, PDF and Website — single-file HTML shows it on its Title Page when the plan includes **Frontmatter > Title Page**; Markdown has no cover)
- **Table of contents** — Generated from your content items (if the plan has a Table of contents item and it is not hidden)
- **Document content** — The documents you added to the plan
- **Metadata** — Title, author, language, description

### Tables

Tables export to every format. Merged cells are the one thing that does not
survive everywhere:

- **EPUB** keeps merges across columns and rows
- **PDF** keeps merges across columns
- **Markdown** cannot merge cells, so the text stays in the first cell and the columns it spanned are left empty
- **HTML and Website** do not write the merge out, so a merged cell takes up a single column

Column alignment is kept in EPUB, HTML, Website and Markdown; PDF ignores cell alignment. Merges across rows are only kept in EPUB.

## Client-Side Generation

Exports are generated entirely in your browser:

- When you are connected to a server, the finished file is also uploaded there (private until you share it)
- Works offline (if content is cached)
- Fast processing
- Privacy preserved

## Stored Exports

After generation, the file is stored in your Media Library under the "Published" category. You can re-download it later without regenerating.
