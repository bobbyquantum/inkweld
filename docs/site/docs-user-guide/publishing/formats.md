---
id: formats
title: Export Formats
description: Export your writing as EPUB, PDF, HTML, an HTML website, or Markdown.
sidebar_position: 1
---

# Export Formats

Inkweld can export your writing in five formats: EPUB, PDF, HTML, HTML Site, and Markdown.

## Available Formats

| Format        | Best For                               |
| ------------- | -------------------------------------- |
| **EPUB**      | E-readers, digital distribution        |
| **PDF**       | Print, manuscripts, archival           |
| **HTML**      | Web publishing, previewing             |
| **HTML Site** | Hosting a book as a multi-page website |
| **Markdown**  | Backup, version control, migration     |

### EPUB

The industry-standard e-book format. Compatible with most e-readers (Kindle via conversion, Kobo, Apple Books, Google Play Books). Includes table of contents, cover, and metadata.

### PDF

Print-ready document typeset with Typst, running in your browser. Suitable for printing or digital reading.

### HTML

Single-file web output. Viewable in any browser. Includes embedded styling.

### HTML Site

A multi-page static website packaged as a ZIP, with one page per chapter and links between them. Unzip it and upload it to any web host.

### Markdown

Plain text with formatting. Maximum portability and version-control friendly.

## Creating an Export

Exports are created through publish plans:

1. Open your project
2. Open the **Publishing** tab and click **New Plan** (or **Create Your First Plan** if you have none yet)
3. Select a format
4. Add content items (documents, TOC)
5. Fill in metadata (title, author)
6. Click **Generate**

The file downloads to your browser.

## What's Included

Each export includes:

- **Cover image** — Your project cover (if enabled; EPUB, PDF, HTML and HTML Site only — Markdown has no cover)
- **Table of contents** — Generated from your content items
- **Document content** — The documents you added to the plan
- **Metadata** — Title, author, language, description

### Tables

Tables export to every format. Merged cells are the one thing that does not
survive everywhere: PDF keeps them, while Markdown, HTML, and EPUB flatten a
merge into the cell plus empty columns so the grid keeps its shape. Column
alignment is preserved in every format.

## Client-Side Generation

Exports are generated entirely in your browser:

- No file upload to servers
- Works offline (if content is cached)
- Fast processing
- Privacy preserved

## Stored Exports

After generation, the file is stored in your Media Library under the "Published" category. You can re-download it later without regenerating.
