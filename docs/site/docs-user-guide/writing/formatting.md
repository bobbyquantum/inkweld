---
id: formatting
title: Formatting Text
description: Apply styles, structure, and visual hierarchy to your writing.
sidebar_position: 3
---

# Formatting Text

Inkweld provides formatting options to structure and style your creative writing. Most formatting is in the editor toolbar, and selecting text also brings up a small floating menu with the basics.

## Character Formatting

### Basic Styles

Apply these styles using the toolbar buttons:

| Style             | Toolbar Button       | Keyboard Shortcut      |
| ----------------- | -------------------- | ---------------------- |
| **Bold**          | Bold button          | `Ctrl/Cmd + B`         |
| _Italic_          | Italic button        | `Ctrl/Cmd + I`         |
| <u>Underline</u>  | Underline button     | `Ctrl/Cmd + U`         |
| ~~Strikethrough~~ | Strikethrough button | `Ctrl/Cmd + Shift + X` |

### When to Use Each

- **Bold**: Key terms, warnings, important information
- **Italic**: Internal thoughts, foreign words, titles of works, emphasis
- **Underline**: Rarely used in fiction; consider alternatives
- **Strikethrough**: Showing edits, crossed-out items in notes

### Combining Styles

You can combine multiple styles:

- _**Bold and italic**_ for strong emphasis
- Apply styles in any order

## Headings

Structure your documents with headings using the paragraph style dropdown in the toolbar.

### Available Heading Levels

| Level           | Usage                          |
| --------------- | ------------------------------ |
| **Heading 1**   | Document/chapter title         |
| **Heading 2**   | Major sections                 |
| **Heading 3**   | Subsections                    |
| **Heading 4-6** | Additional hierarchy if needed |
| **Paragraph**   | Normal body text               |

### Best Practices

- Use **Heading 1** once per document (the title)
- Use **Heading 2** for major divisions (scenes, sections)
- Use **Heading 3** for sub-divisions if needed
- Don't skip levels (e.g., H1 → H3)

### Scene Breaks vs. Headings

For fiction, consider:

- **Headings**: When you want visible section titles
- **Horizontal rules**: For scene breaks without titles

## Text Alignment

Align text using the alignment buttons in the toolbar:

- **Left align** (default)
- **Center** — for titles, poetry, or centered content
- **Right align** — for signatures, dates, or right-aligned elements
- **Justify** — for formal documents

## Lists

### Bullet Lists

Use for unordered items:

- Character traits
- Location features
- Plot points to address

Create with the bullet list button in the toolbar.

### Numbered Lists

Use for ordered sequences:

1. First event
2. Second event
3. Third event

Create with the numbered list button in the toolbar.

### Nested Lists

Indent list items to create hierarchy:

- Main point
  - Supporting detail
  - Another detail

Use the keyboard shortcuts:

- `Tab` or `Ctrl/Cmd + ]` to indent
- `Ctrl/Cmd + [` to outdent

## Block Quotes

Use block quotes for:

- Quotations from other sources
- Epigraphs at chapter starts
- Letters or documents within your story
- Emphasis on key passages

> "The only way out is through."
> — Robert Frost

Create with the quote button in the toolbar.

## Horizontal Rules

Insert a horizontal rule for:

- Scene breaks
- Thematic breaks
- Section dividers

---

Create with the **Horizontal rule** button in the toolbar, or with `Ctrl/Cmd + Shift + H`. There is no Markdown typing shortcut for it.

## Tables

Tables are useful for reference material that sits alongside your prose — magic
system rules, character stat blocks, timelines of regnal years, translation
glossaries.

### Inserting a Table

1. Place the cursor where you want the table
2. Click the **Table** button in the toolbar
3. Choose **Insert table**

A new table starts as three columns by three rows. The first row is a **header
row**, styled differently from the body and preserved when you export.

### Editing a Table

Click into any cell and type. Cells hold ordinary paragraphs, so all the
character formatting above works inside them. The other table menu items are
greyed out until the cursor is inside a table.

| Action                        | How                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| Move to the next cell         | `Tab`                                                      |
| Move to the previous cell     | `Shift + Tab`                                              |
| Add a row                     | Table menu → _Insert row above_ or _Insert row below_      |
| Add a column                  | Table menu → _Insert column left_ or _Insert column right_ |
| Delete a row or column        | Table menu → _Delete row_ or _Delete column_               |
| Merge selected cells          | Table menu → _Merge cells_                                 |
| Split a merged cell           | Table menu → _Split cell_                                  |
| Turn the header row on/off    | Table menu → _Toggle header row_                           |
| Turn the header column on/off | Table menu → _Toggle header column_                        |
| Resize a column               | Drag the divider between two columns                       |
| Remove the whole table        | Table menu → _Delete table_                                |

Select several cells by clicking one and dragging across the others — merge and
alignment actions apply to the whole selection.

:::tip
`Tab` in the last cell does **not** create a new row. Use _Insert row below_
from the table menu when you need more space.
:::

### Tables and Export

Tables export to Markdown, HTML, EPUB, and PDF. Merged cells are handled
differently by each format:

| Format   | Merged cells                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| PDF      | Cells merged across columns are kept                                                                              |
| EPUB     | Merges across columns and rows are kept                                                                           |
| Markdown | Markdown tables cannot merge cells, so the text stays in the first cell and the columns it spanned are left empty |
| HTML     | The merge is not written out, so a merged cell takes up a single column                                           |

If a table relies on merged cells, check the exported result in the format you
plan to publish.

:::warning
Markdown always treats a table's first row as the header, even if you turned
the header row off in the editor — that is a limitation of the Markdown table
format. EPUB, PDF and HTML follow your header row and column settings.
:::

## Links

### Inserting Links

1. Click the **Insert link** button in the toolbar (or press `Ctrl/Cmd + K`, or use the link button in the floating menu)
2. A dialog opens. If you had text selected, enter just the **URL**. If nothing was selected, enter the **Link text** and the **URL**
3. Click **Insert**

To change a link, put the cursor in it and open the dialog again; it becomes **Edit Link**, with an **Open in new tab** option and a **Remove link** button.

### Internal Element Links

Use `@mentions` to link to project elements:

1. Type `@` in the editor
2. Search for a character, location, or document
3. Select from the dropdown

See [Element References](../worldbuilding/element-references) for details.

## Inline Code

For technical terms or code-like text, select the text and press `Ctrl/Cmd + E` (or ``Ctrl/Cmd + ` ``, using the backtick key). This applies `monospace formatting` to the selection.

## Clearing Formatting

To remove inline formatting from text:

1. Select the formatted text
2. Click the **Clear formatting** button in the toolbar (or press `Ctrl/Cmd + \`)

This removes character-level formatting such as bold, italic, underline, strikethrough, code and links. It does not change the paragraph itself, so headings, lists, block quotes and alignment stay as they are. With nothing selected, the toolbar button clears the formatting that would apply to the next characters you type; the keyboard shortcut only works on a selection. It also removes comment highlights and AI Review highlights from the selected text.

## Paragraphs and Spacing

### Paragraph Breaks

- Press **Enter** for a new paragraph
- Paragraphs have automatic spacing

### Line Breaks

- Press **Shift + Enter** for a line break without paragraph spacing
- Useful for poetry or addresses

## Undo and Redo

Made a mistake? Use the undo/redo buttons or keyboard shortcuts:

- **Undo**: `Ctrl/Cmd + Z`
- **Redo**: `Ctrl + Y` (Windows/Linux) or `Cmd + Shift + Z` (macOS)
