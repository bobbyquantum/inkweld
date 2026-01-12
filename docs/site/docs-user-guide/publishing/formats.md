---
id: formats
title: Export Formats
description: Export your writing in EPUB, PDF, HTML, and Markdown formats.
sidebar_position: 1
---

# Export Formats

Inkweld can export your writing in four formats: EPUB, PDF, HTML, and Markdown.

## Available Formats

| Format | Best For |
|--------|----------|
| **EPUB** | E-readers, digital distribution |
| **PDF** | Print, manuscripts, archival |
| **HTML** | Web publishing, previewing |
| **Markdown** | Backup, version control, migration |

### EPUB

The industry-standard e-book format. Compatible with most e-readers (Kindle via conversion, Kobo, Apple Books, Google Play Books). Includes table of contents, cover, and metadata.

### PDF

Basic print-ready document. Uses jsPDF for client-side generation. Suitable for printing or digital reading.

### HTML

Single-file web output. Viewable in any browser. Includes embedded styling.

### Markdown

Plain text with formatting. Maximum portability and version-control friendly.

## Creating an Export

Exports are created through publish plans:

1. Open your project
2. Click **Create Publish Plan** on the project home
3. Select a format
4. Add content items (documents, TOC)
5. Fill in metadata (title, author)
6. Click **Generate**

The file downloads to your browser.

## What's Included

Each export includes:

- **Cover image** — Your project cover (if enabled)
- **Table of contents** — Generated from your content items
- **Document content** — The documents you added to the plan
- **Metadata** — Title, author, language, description

## Client-Side Generation

Exports are generated entirely in your browser:

- No file upload to servers
- Works offline (if content is cached)
- Fast processing
- Privacy preserved

## Stored Exports

After generation, the file is stored in your Media Library under the "Published" category. You can re-download it later without regenerating.

---

**Next:** [Publish Plans](./publish-plans) — Save export configurations for reuse.
