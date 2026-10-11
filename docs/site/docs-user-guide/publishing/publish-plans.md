---
id: publish-plans
title: Publish Plans
description: Save export configurations for consistent, repeatable publishing.
sidebar_position: 2
---

import ThemedImage from '@site/src/components/ThemedImage';

# Publish Plans

A publish plan saves your export configuration so you can generate consistent output every time.

## What a Plan Contains

- **Format** — EPUB, PDF, HTML, Website, or Markdown
- **Metadata** — Title, author, language, description
- **Content items** — Which folders and documents to include, in what order, plus any table of contents, frontmatter, backmatter and separators
- **Style** — Book options (table of contents, cover, chapter headings, typographic quotes) and the visual style. See [Customizing Output](./customization)

## Creating a Plan

1. Open your project
2. Open the **Publishing** tab and click **New Plan** (or **Create Your First Plan** if you have no plans yet)
3. A new plan opens with default settings

## Configuring a Plan

A plan has five sections, listed in its sidebar: **Metadata**, **Contents**, **Style**, **Preview** and **Publish**. The **Plan name** sits above them.

### Metadata Section

| Field           | Purpose                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Format**      | Output format: EPUB (E-Book), PDF, HTML (Single Page), Website (Multi-Page HTML) or Markdown |
| **Book Title**  | Title in the exported file                                                                   |
| **Author**      | Author name                                                                                  |
| **Language**    | Content language code (e.g., "en")                                                           |
| **Description** | Back cover blurb or summary                                                                  |

### Contents Section

Add content to your publication:

1. Drag folders and documents from the project tree into the list, or use the **Add** menu to pick them (**Add documents…**), add everything at once, or insert a table of contents, frontmatter, backmatter, or separators
2. Items appear in the content list in publication order
3. Drag items (or use the arrow buttons) to reorder
4. Click the trash icon to remove

#### Frontmatter, Backmatter and Separators

The **Add** menu can also insert:

| Menu item             | Choices                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| **Frontmatter**       | Title Page, Copyright, Dedication, Epigraph, Custom                            |
| **Backmatter**        | Glossary, Index, About Author, Acknowledgments, Custom                         |
| **Separator**         | Page Break, Scene Break, Chapter Break                                         |
| **Table of contents** | A contents page. It is added at the end of the list; drag it where you want it |

The Title Page and Copyright page are built from the plan's metadata. The editor does not yet have a place to type the text of the other frontmatter and backmatter items, so Dedication, Epigraph, Acknowledgments and Custom pages come out as placeholders in EPUB and empty in HTML — leave them out of a book you plan to publish for now. A Scene Break prints `* * *` between scenes, a Chapter Break draws a divider line (in PDF it starts a new page), and a Page Break starts a new page (an EPUB starts a new page at every chapter anyway, so page breaks do nothing there).

#### Folders

A folder in the plan is published with everything inside it — its scenes, sub-folders and worldbuilding entries — in the order they have in the project tree. Notes inside it are left out. Because the folder's contents are read when you publish, reordering scenes in the tree or on the [corkboard](../organizing/scenes-corkboard-outline#corkboard), or adding new ones, changes the next export without editing the plan.

<ThemedImage
  src="/img/generated/publish-plan-folders"
  alt="Publish plan contents listing a folder with its word and document count, and a document"
/>

**Add everything** adds each top-level folder as a single item, plus any loose scenes and documents at the top level. If some of a folder's contents are already in the plan on their own, it adds the rest one by one instead, so nothing is published twice. Notes, empty folders, canvases, timelines and charts are skipped.

Inkweld will not add anything twice: dropping a document that a folder in the plan already publishes, or a folder whose contents are partly listed, shows a message and leaves the plan unchanged. The picker hides anything the plan already covers.

#### Statistics

The Contents section shows what you are about to publish:

- **Summary chips** above the list give the number of documents and worldbuilding entries, total word count, an estimated page count (275 words per page), and an estimated reading time
- **Per-item word counts** appear on each row; a folder row also shows how many documents it contributes
- **Not synced** marks documents that have not been downloaded to this device yet; they are fetched automatically when you publish
- Use the **Recount words** button if you have edited documents since opening the plan

The same item, word, and page totals appear at the bottom of the plan's sidebar, next to a **Generate** button, so you can publish from any section.

### Style Section

The Style section holds the book-wide options and the visual style:

- **Show Table of Contents item** — Untick to hide the table of contents item without removing it from Contents
- **Include cover image** — Add your project cover to the export (EPUB, PDF and Website; single-file HTML shows it on the Title Page)
- **Chapter headings**, **Number format** and **Typographic quotes and dashes**

See [Customizing Output](./customization) for all of them.

## Generating Output

1. Add at least one content item
2. Click **Generate [Format]**
3. Wait for processing (happens in your browser)
4. The completion dialog shows file info, plus sharing options when you are online
5. Click **Download** to save the file

The generated file is also saved to your Media Library under "Published."

### Previous versions

The **Publish** section lists earlier files made from the plan under **Previous versions**, with their date and size. Each row has a **Download** button and a **Delete** button. Delete removes that file from the project; it cannot be undone.

## Sharing a Published File

When you are connected to a server, the completion dialog (**Published Successfully!**) has a **Share Settings** area with a **Who can access** menu:

| Option               | What it does                                                                           |
| -------------------- | -------------------------------------------------------------------------------------- |
| **Only me**          | The default. The file is not shared                                                    |
| **Collaborators**    | Shown as "Coming soon" and cannot be selected yet                                      |
| **Anyone with link** | Creates a share link. Anyone who has the link can download the file without signing in |
| **Anyone**           | Also creates a share link and currently behaves the same as Anyone with link           |

When a link is available, it appears in a box with a **Copy link** button, and the main button becomes **Copy Link**. Choose **Only me** again to stop sharing.

Two things to know:

- Sharing needs a server connection. In local mode, or offline, the dialog says "Sharing options available when online" and you can only download
- If the upload to the server fails, the dialog says the file is **Saved on this device only** and offers **Retry upload**. If your server's sync capacity is full, the file stays on your device and cannot be shared until you free up space and publish again. See your administrator's guide on sync capacity

Treat a share link like a password: anyone you give it to can download the file.

## Preview

The **Preview** section renders the plan in your browser without saving a file:

- The toolbar shows whether the preview is current or the plan has changed since it was rendered, plus the rendered word count (and page count for PDF)
- For HTML, Website and EPUB formats, switch between **Phone**, **Tablet** and **Desktop** widths. (The Website export is one page per chapter; the preview shows the same content on a single page.)
- Click **Refresh** to re-render after making changes

## Managing Plans

Plans are listed in the **Publishing** tab. Each card shows the plan's format, item count, and when it was last published; click a card to open and edit it, or expand its **Publish history** to see previous exports.

Changes to a plan are saved automatically as you edit.

**Multiple Plans**: Create different plans for different purposes:

- "Manuscript PDF" for editors
- "Beta EPUB" for early readers
- "Archive Markdown" for backup
