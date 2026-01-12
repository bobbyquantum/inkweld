---
id: element-references
title: Element References
description: Link your story elements together with @mentions.
sidebar_position: 2
---

import ThemedImage from '@site/src/components/ThemedImage';

# Element References

Element references let you create links between your story content. Use the `@` symbol to reference any element from anywhere in your project.

## What Are Element References?

Element references are inline links to other elements:
- Type `@` to trigger the reference popup
- Search for any element in your project
- Insert a styled link to that element
- Navigate between connected content

## Quick Start

1. Type `@` in any document
2. Start typing to search for an element
3. Select from the dropdown or press Enter
4. A styled link is inserted into your text

<ThemedImage
  src="/img/features/element-ref-01-popup"
  alt="The @ popup appears when you type @"
/>

## Why Use Element References?

### Track Element Appearances

See everywhere an element is mentioned across your entire project. The **Relationships Panel** shows:

- **References**: Elements this document links to
- **Backlinks**: Other documents that reference this element

### Navigate Your World

Click any element reference to jump directly to that element's page. Build a web of interconnected worldbuilding.

### Maintain Consistency

When you hover over an element reference, a tooltip shows key information about that element. Quickly verify details without leaving your current document.

## Using the @ Popup

### Triggering the Popup

Type `@` anywhere in a document:
- In prose content
- In worldbuilding fields
- In notes

The popup appears immediately with suggestions.

### Searching

The popup shows relevant elements by default. Start typing to filter:

- Type `@Elena` to find elements named Elena
- Type `@Tavern` to find elements containing "Tavern"
- Results are ranked by relevance and recency

<ThemedImage
  src="/img/features/element-ref-character-search"
  alt="Searching for an element by name"
/>

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate through results |
| `Enter` | Select highlighted result |
| `Escape` | Close popup without selecting |
| `Tab` | Select and continue typing |

### Element Type Icons

The popup shows icons based on the element's type:

| Icon | Element Type |
|------|--------------|
| 📄 | Document |
| 📁 | Folder |
| ✨ | Worldbuilding element |

## Inserting References

### Basic Insertion

1. Type `@` and search
2. Select an element
3. The reference appears as styled text
4. Continue typing normally

### Reference Display

References appear as:
- Distinctly styled (usually colored/highlighted)
- Clickable links
- Show element name by default

<ThemedImage
  src="/img/features/element-ref-character-link"
  alt="Element reference displayed in the editor"
/>

## Editing References

### Change Display Text

By default, the element's name is shown. To use custom text:

1. **Right-click** the element reference
2. Select **"Edit Display Text"**
3. Enter your preferred text
4. Click **Save** or press Enter

Example: Change `@Elena Blackwood` to display as just `Elena` or `the sorceress`.

<ThemedImage
  src="/img/features/element-ref-context-menu"
  alt="Right-click context menu on an element reference"
/>

### Remove a Reference

To remove an element reference:

1. Place your cursor at the reference
2. Use **Backspace** or **Delete**
3. The reference is removed like any text

Or:

1. Select the reference
2. Press **Delete** or type replacement text

## Viewing References

### In the Meta Panel

Open the side panel to see:

**References (Outgoing)**
- Elements mentioned in this document
- Click to navigate to the element

**Backlinks (Incoming)**
- Documents that mention this element
- Click to navigate to those documents

### Reference Counts

See how many times an element is referenced:
- On element cards in worldbuilding views
- In the meta panel

### Tooltip Preview

Hover over a reference to see:
- Element type and name
- Brief description or summary
- Quick facts from the profile

<ThemedImage
  src="/img/features/element-ref-character-tooltip"
  alt="Tooltip showing element details on hover"
/>

---

**Next:** [Relationships](./relationships) - Define semantic connections between elements.
