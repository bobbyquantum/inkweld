---
id: projects
title: Working with Projects
description: Learn how to create and manage writing projects in Inkweld.
sidebar_position: 1
---

import ThemedImage from '@site/src/components/ThemedImage';

# Working with Projects

## Creating a Project

1. Click the **"New Project"** button on your dashboard
2. Enter a project title and optional description
3. Choose a project slug (URL-friendly name)
4. Click **"Create"** to start your project

Your project is created with a default folder structure:

- **Chapters** folder for your story content
- **Chapter 1** document to get you started

<ThemedImage
  src="/img/features/character-relationships-overview"
  alt="Project view showing the sidebar tree and editor"
/>

## Project Structure

### Folders

Organize your work with folders:

- **Right-click** in the project tree to create new folders
- **Drag and drop** to move folders and files
- **Nested folders** for complex organization (e.g., Act 1 > Chapter 1 > Scenes)

### Documents

Create different types of documents:

- **Text documents** - For chapters, scenes, and prose
- **Worldbuilding entries** - Structured elements for your story world
- **Notes** - For research, outlines, and planning

## Editing Documents

### Rich Text Editor

The editor supports:

- **Basic formatting**: Bold, italic, underline
- **Headings**: H1, H2, H3 for structure
- **Lists**: Bulleted and numbered lists
- **Block quotes**: For emphasis or citations
- **Markdown shortcuts**: Type `#` for headings, `*` for bullets

<ThemedImage
  src="/img/features/element-ref-editor"
  alt="Rich text editor showing prose with an element reference link"
/>

### Keyboard Shortcuts

**Text Formatting**
- `Ctrl/Cmd + B` - Bold
- `Ctrl/Cmd + I` - Italic
- `Ctrl/Cmd + U` - Underline
- `Ctrl/Cmd + Shift + X` - Strikethrough
- `Ctrl/Cmd + E` - Inline code
- `Ctrl/Cmd + \` - Clear formatting

**Block Formatting**
- `Ctrl/Cmd + 0` - Normal paragraph
- `Ctrl/Cmd + 1` through `Ctrl/Cmd + 6` - Headings 1-6
- `Ctrl/Cmd + Shift + 7` - Bullet list (toggle)
- `Ctrl/Cmd + Shift + 8` - Numbered list (toggle)
- `Ctrl/Cmd + Shift + 9` - Blockquote
- `Ctrl/Cmd + Shift + H` - Horizontal rule

**General**
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo

:::note
Changes are saved automatically in real-time. There is no manual save required.
:::

### Real-Time Collaboration

When collaborators are editing:

- See their **cursor position** and selections
- **Changes appear instantly** as they type
- **Conflict-free editing** - write simultaneously without issues
- **User indicators** show who's currently active

## Worldbuilding Elements

Inkweld uses a flexible **element system** for worldbuilding. Elements are structured entries that you define to match your story's needs—characters, locations, factions, items, magic systems, or anything else your world requires.

### Creating Elements

1. Right-click in your project tree
2. Select **"New Worldbuilding Entry"**
3. Choose a template or create a new one
4. Fill in the structured fields

:::tip Element References
Once you've created elements, use `@` mentions in your documents to link to them. See [Element References](./element-references) for details.
:::

### Templates

Every worldbuilding element uses a template that defines its structure. Templates are fully customizable:

1. Go to **Project Settings** → **Templates**
2. Click **"Create Template"**
3. Define custom tabs and fields
4. Use your template for new entries

Examples of templates you might create:

- **Character** - Names, descriptions, personality, backstory
- **Location** - Settings with descriptions, history, notable features
- **Faction** - Organizations, governments, or groups
- **Item** - Artifacts, weapons, or magical objects
- **Event** - Historical moments or timeline entries
- **Species** - Races, creatures, or beings in your world

Inkweld includes a few demo templates to help you get started, but you can modify these or create entirely new ones to match your story's unique needs.

## Offline Work

### Working Offline

Inkweld works without internet:

1. **Open your project** while online (loads data to cache)
2. **Go offline** - Continue writing as normal
3. **Changes save locally** automatically
4. **Reconnect** - Changes sync automatically

### Sync Status

Check the sync indicator in the toolbar:

- **Green indicator**: All changes synced to the server
- **Yellow indicator**: Sync in progress
- **Red indicator**: Connection issue — changes are saved locally and will sync when you reconnect

## Project Settings

Access settings from the project menu:

- **Project details** - Edit title, description, slug
- **Collaborators** - Invite team members and manage access
- **Publishing** - Configure and run export plans
- **Delete** - Permanently remove the project

## Publishing Your Work

### Export Formats

Inkweld supports multiple export formats:

- **EPUB** - E-book format for Kindle, Kobo, Apple Books, and more
- **PDF** - Print-ready documents with professional formatting
- **HTML** - Web-ready single-page exports
- **Markdown** - Plain text format for maximum portability

### Creating a Publish Plan

1. Open your project and go to the **Home** tab
2. Click **"New Publish Plan"** in the Publishing section
3. Configure your export:
   - **Name**: Give your plan a descriptive name
   - **Format**: Choose EPUB, PDF, HTML, or Markdown
   - **Metadata**: Set title, author, description, and language
   - **Options**: Configure table of contents, chapter numbering, and styling

### Adding Content to Your Plan

1. Open your publish plan
2. Use **"Add Content"** to include:
   - **Documents**: Add chapters and scenes from your project
   - **Frontmatter**: Title pages, copyright notices, dedications
   - **Backmatter**: Author bio, acknowledgments, appendices
   - **Table of Contents**: Auto-generated navigation
   - **Separators**: Scene breaks and chapter dividers
3. **Drag and drop** to reorder items
4. **Save** your plan for reuse

### Generating Your Export

1. Open your publish plan
2. Click **"Generate"**
3. Wait for processing (happens in your browser)
4. Download the finished file

All exports happen client-side—your content never leaves your device during generation.

### Quick Export

For simple exports without creating a plan:

1. Go to the **Home** tab
2. Click **"Quick Export"**
3. Select documents to include
4. Choose a format
5. Download immediately

## Tips for Organization

### Chapter Organization

```
📁 Act 1
  📁 Chapter 1
    📄 Scene 1 - Opening
    📄 Scene 2 - Inciting Incident
  📁 Chapter 2
    📄 Scene 1 - Rising Action
```

### Worldbuilding Organization

```
📁 People
  📄 Protagonist
  📄 Antagonist
  📁 Supporting Cast
📁 Places
  📄 Main City
  📄 Wilderness
📁 Factions
  📄 The Guild
  📄 The Empire
📁 Timeline
  📄 Past Events
  📄 Story Timeline
```

## Next Steps

- Learn to link elements inline with [Element References](./element-references)
- Define structured connections with [Relationships](./relationships)
- Categorize your content with [Tags](./tags)
