---
id: projects
title: Working with Projects
description: Learn how to create and manage writing projects in Inkweld.
sidebar_position: 1
---

## Creating a Project

1. Click the **"New Project"** button on your dashboard
2. Enter a project title and optional description
3. Choose a project slug (URL-friendly name)
4. Click **"Create"** to start your project

Your project is created with a default folder structure:

- **Chapters** folder for your story content
- **Chapter 1** document to get you started

## Project Structure

### Folders

Organize your work with folders:

- **Right-click** in the project tree to create new folders
- **Drag and drop** to move folders and files
- **Nested folders** for complex organization (e.g., Act 1 > Chapter 1 > Scenes)

### Documents

Create different types of documents:

- **Text documents** - For chapters, scenes, and prose
- **Worldbuilding entries** - For characters, locations, and lore
- **Notes** - For research, outlines, and planning

## Editing Documents

### Rich Text Editor

The editor supports:

- **Basic formatting**: Bold, italic, underline
- **Headings**: H1, H2, H3 for structure
- **Lists**: Bulleted and numbered lists
- **Block quotes**: For emphasis or citations
- **Markdown shortcuts**: Type `#` for headings, `*` for bullets

### Keyboard Shortcuts

- `Ctrl/Cmd + B` - Bold
- `Ctrl/Cmd + I` - Italic
- `Ctrl/Cmd + S` - Save (automatic in real-time)
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo

### Real-Time Collaboration

When collaborators are editing:

- See their **cursor position** and selections
- **Changes appear instantly** as they type
- **Conflict-free editing** - write simultaneously without issues
- **User indicators** show who's currently active

## Worldbuilding

### Creating Character Profiles

1. Right-click in your project tree
2. Select **"New Worldbuilding Entry"**
3. Choose **"Character"** template
4. Fill in details:
   - Name and aliases
   - Physical description
   - Personality traits
   - Backstory and motivations
   - Relationships with other characters

### Location Entries

Document your story's settings:

- **Name and type** (city, building, region)
- **Description** - Visual details and atmosphere
- **History** - Past events that shaped the location
- **Notable features** - Landmarks or important elements
- **Connected locations** - Links to nearby places

### Custom Templates

Create your own worldbuilding schemas:

1. Go to **Project Settings**
2. Click **"Worldbuilding Templates"**
3. Define custom fields and sections
4. Use your template for new entries

## Offline Work

### Working Offline

Inkweld works without internet:

1. **Open your project** while online (loads data to cache)
2. **Go offline** - Continue writing as normal
3. **Changes save locally** automatically
4. **Reconnect** - Changes sync automatically

### Sync Status

Check your sync status:

- **Green indicator**: All changes synced
- **Yellow indicator**: Syncing in progress
- **Red indicator**: Connection issue - working offline

## Project Settings

Access settings from the project menu:

- **Project details** - Edit title, description, slug
- **Collaborators** - Invite team members (coming soon)
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
📁 Characters
  📄 Protagonist
  📄 Antagonist
  📁 Supporting Cast
📁 Locations
  📄 Main City
  📄 Wilderness
📁 Timeline
  📄 Past Events
  📄 Story Timeline
```

## Next Steps

- Explore [all features](../features) in depth
- Learn about [hosting](../hosting/docker) for production
- Check the [developer guide](../developer/architecture) for customization
