---
id: features
title: Features
description: Discover what makes Inkweld the perfect platform for collaborative creative writing.
sidebar_position: 2
---

![Inkweld Bookshelf](/img/generated/bookshelf-desktop-dark.png)

## Real-Time Collaboration

Work together with co-authors, beta readers, and editors in real-time. Inkweld uses **Conflict-free Replicated Data Types (CRDTs)** to ensure everyone sees changes instantly without conflicts or overwrites.

- **Live editing** - See your collaborators' cursors and changes as they type
- **No conflicts** - Write simultaneously without worrying about version conflicts
- **Seamless sync** - Changes sync automatically when you're back online
- **User presence** - Know who's currently viewing and editing documents

![Editor Interface](/img/generated/editor-desktop-dark.png)

## Media Library

Manage all your project's media assets in one place with the built-in Media Library.

![Media Library](/img/generated/media-tab-desktop.png)

- **Centralized storage**: View all images and files stored with your project
- **Category filtering**: Filter by cover images, inline images, or published exports
- **Quick preview**: Click any image for a full-size preview
- **Easy management**: Download or delete media files with one click
- **Offline support**: Media is stored locally in IndexedDB for offline access
- **Size tracking**: See total storage used at a glance

The Media Library automatically organizes assets uploaded to your project:

- **Cover images**: Project and document covers
- **Inline images**: Images embedded in your documents
- **Published exports**: Generated EPUB, PDF, and other export files

## Worldbuilding Tools

Build rich, detailed fictional worlds with structured templates for characters, locations, events, and lore.

- **Character profiles**: Track names, relationships, motivations, and development arcs
- **Location databases**: Map out settings with descriptions, histories, and connections
- **Timeline management**: Organize events chronologically across your story universe
- **Custom templates**: Create your own worldbuilding schemas for unique needs
- **[Element references](/docs/user-guide/element-references)**: Use `@mentions` to link characters, locations, and items throughout your prose
- **[Relationships](/docs/user-guide/relationships)**: Define semantic connections between characters, locations, and items with bidirectional relationship types

## Document Organization

Keep your writing organized with a flexible hierarchical structure.

- **Folders and files**: Organize chapters, scenes, and research materials
- **Drag-and-drop**: Reorder and restructure your project with ease
- **Multiple document types**: Switch between prose, notes, and worldbuilding entries
- **Search and filter**: Find content quickly across your entire project
- **Document templates**: Start new chapters with pre-configured structures

## Offline-First Architecture

Write anywhere, anytime—even without an internet connection.

- **Full offline support**: Continue writing when you're disconnected
- **Automatic sync**: Changes sync when you reconnect
- **Local storage**: Documents cached locally for instant access
- **Conflict resolution**: Automatic merging of offline changes

## Privacy and Data Ownership

Your stories belong to you, completely.

- **Self-hosted**: Run Inkweld on your own server or local machine
- **No cloud dependencies**: All data stays under your control
- **Open source**: Audit the code and customize as needed
- **Export options**: Export your work in standard formats anytime

## Modern Rich Text Editor

Write with a powerful editor designed for long-form creative writing.

- **Distraction-free mode**: Focus on your words without clutter
- **Markdown support**: Use familiar Markdown shortcuts for formatting
- **Custom styles**: Bold, italic, headings, lists, and block quotes
- **Keyboard shortcuts**: Speed up your workflow with quick commands
- **Mobile-responsive**: Write comfortably on any device

## User Management

Control who has access to your writing projects.

- **Multi-user support**: Invite collaborators with different permission levels
- **Project sharing**: Grant read or write access per project
- **Admin controls**: Manage users and approve registrations
- **Session management**: Secure authentication with session-based login

## Publishing & Export

Export your work in multiple professional formats.

- **EPUB export**: Create e-books ready for Kindle, Kobo, and other readers
- **PDF export**: Generate print-ready documents with customizable formatting
- **HTML export**: Create web-ready versions of your work
- **Markdown export**: Export to plain Markdown for maximum portability
- **Publish plans**: Save export configurations for consistent output
- **Customizable output**: Control chapter numbering, table of contents, metadata, and styling
- **Client-side generation**: Exports happen in your browser—no server upload needed

## Technical Highlights

For those interested in what's under the hood:

- **Angular 21 frontend** with standalone components and modern control flow
- **Bun + Hono backend** for blazing-fast API performance
- **Yjs CRDTs** for real-time collaboration without conflicts
- **LevelDB** for efficient document persistence
- **SQLite or Cloudflare D1** for relational data
- **WebSocket connections** for instant updates
- **Docker deployment** for easy self-hosting

---

Ready to get started? Check out the [Installation Guide](./installation) or learn about [hosting options](./hosting/docker).
