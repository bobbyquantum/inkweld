---
id: documents
title: Managing Documents
description: Create, rename, move, and delete documents in your project.
sidebar_position: 2
---

import ThemedImage from '@site/src/components/ThemedImage';

# Managing Documents

Documents are the core of your Inkweld project—they hold your chapters, scenes, notes, and prose. This guide covers how to work with documents in the project navigator.

## Creating Documents

### From the Create Button

At the bottom of the project tree, there's always a **Create** button that opens the element type chooser:

<ThemedImage
  src="/img/generated/element-type-chooser"
  alt="Element type chooser showing document and worldbuilding options"
/>

1. Click the **Create** button
2. Choose **Document** (or another element type)
3. Enter a title for your new element
4. Click **Create**

<ThemedImage
  src="/img/generated/new-document-dialog"
  alt="New document naming dialog"
/>

The new document opens automatically in a new tab.

### From the Toolbar

The navigator toolbar has two buttons for quickly creating elements:

- **New Document** (📄+) — Opens the element type chooser
- **New Folder** (📁+) — Creates a folder directly (skips type chooser)

If you have a folder selected in the tree, new elements will be created inside that folder.

### From Context Menu

Right-click on a folder to create elements inside it:

<ThemedImage
  src="/img/generated/folder-context-menu"
  alt="Folder context menu with New Element option"
/>

1. **Right-click** on a folder in the project tree
2. Select **New Element**
3. Choose the element type
4. Enter a title
5. Click **Create**

## Document Types

### Text Documents

Standard documents for prose writing:

- Chapters and scenes
- Notes and planning
- Research and references
- Any freeform text

These use the rich text editor. See [The Editor](../writing/editor) for details.

### Worldbuilding Elements

Structured entries with customizable templates:

- Characters with profile fields
- Locations with details
- Items with properties
- Custom types you define

See [Worldbuilding Elements](../worldbuilding/elements) for details on creating structured element types.

## Opening Documents

Click any document in the project navigator to open it in a new tab. If the document is already open, clicking it will switch to that tab.

See [Project Interface](./project-structure) for more on working with tabs.

## Editing Documents

### Basic Editing

See [The Editor](../writing/editor) for comprehensive editing instructions.

Quick reference:

- Click in the document to place your cursor
- Type to add text
- Use the toolbar for formatting
- Changes save automatically

### Autosave

Documents save automatically:

- Every few seconds while typing
- When you switch documents
- When you leave the project

The connection indicator in the navigator shows sync status.

## Renaming Documents

### From Context Menu

1. **Right-click** the document in the project tree
2. Select **Rename**
3. Enter the new name
4. Press **Enter** or click outside to confirm

### From Tab Context Menu

1. **Right-click** the document's tab
2. Select **Rename**
3. Enter the new name
4. Press **Enter** to confirm

## Moving Documents

### Drag and Drop

The only way to move documents is drag and drop:

1. Click and hold the document in the project tree
2. Drag to the target folder
3. Release to drop

You can also drag documents to reorder them within a folder.

:::tip Drag Indicator
When dragging, the target folder highlights to show where the document will be placed.
:::

## Deleting Documents

### Delete a Document

1. Right-click the document in the project tree
2. Select **Delete**
3. Confirm the deletion

:::warning Permanent Deletion
Deleted documents are **permanently removed**. There is no recycle bin. Consider these precautions:

- **Create a snapshot** before deleting if you're unsure
- **Move to an archive folder** instead of deleting
- **Export your project** regularly as a backup
:::

## Document Snapshots

Snapshots preserve document versions so you can restore previous content.

### Creating a Snapshot

1. Open the document
2. Click the **History** button (🕐) in the editor toolbar
3. Click **Create Snapshot**
4. Enter a description (optional)
5. Click **Save**

### Viewing and Restoring Snapshots

1. Click the **History** button in the toolbar
2. Browse your snapshots
3. Click a snapshot to preview its content
4. Click **Restore** to revert to that version

:::tip Regular Snapshots
Create snapshots:

- Before major revisions
- After completing a chapter
- Before sharing for feedback
- At project milestones
:::

---

**Next:** [Using Tags](./tags) - Categorize and filter your story elements.
