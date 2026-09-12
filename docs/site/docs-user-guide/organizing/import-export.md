---
id: import-export
title: Backups, Export & Import
description: Export a project as a portable .inkweld.zip archive, restore it anywhere, and move projects between offline mode and a server.
sidebar_position: 7
---

# Backups, Export & Import

Every Inkweld project can be packaged into a single **project archive** — a `.inkweld.zip` file that contains the whole project: documents, worldbuilding, media, tags, relationships, publish plans, and version history. Archives are how you back up your work, move it between Inkweld instances, or duplicate a project.

:::tip[Back up before upgrading]
Inkweld is pre-1.0. Export an archive before upgrading your server or clearing browser data, and keep the file somewhere outside the device you write on.

:::

## What's in an archive

| Included             | Details                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| Project settings     | Title, description, cover image                                             |
| Project tree         | Every folder, document, and worldbuilding element, in order                 |
| Document content     | Full rich text for each document                                            |
| Worldbuilding data   | All field values, plus the templates (schemas) they use                     |
| Relationships & tags | Relationship types, links between elements, tag definitions and assignments |
| Publish plans        | Saved export configurations and typography styles                           |
| Media                | Cover and inline images from the media library                              |
| Snapshots            | Named document versions and their history                                   |

Not included: collaborators and sharing permissions, comments, and per-user settings. Those belong to the server account rather than the project.

## Exporting a project

You can export from three places:

- **Project Home tab** — the **Export Project** button in the _Start_ column
- **Project Settings tab** — the **Export & Import** card under project actions
- **Project menu** (⋮) in the header

Inkweld packages the project and your browser downloads a file named like:

```
my-novel_2026-09-02_14-30-00.inkweld.zip
```

### Exporting while connected to a server

In server mode, the export waits for the server copy to be complete first:

1. **Sync check** — if any document still has unsynced changes, the export stops and lists those documents. Wait a moment for sync to finish, then try again.
2. **Media download** — the cover and any images not yet cached locally are fetched from the server so the archive is complete.

In offline mode there is nothing to sync; the archive is built straight from your browser's storage.

## Importing a project

An import always creates a **new project**. It never overwrites an existing one, so it's safe to import the same archive more than once.

Open the import dialog from:

- The **+ Create** menu on the Bookshelf → **Import Project**
- The **Import Project** button on an empty Bookshelf
- The **Project Home** tab or the **Project Settings** tab inside any project

### Step 1 — Choose the file

Drag a `.inkweld.zip` file onto the drop zone, or click **Browse Files**. Inkweld reads the archive and checks that it's valid.

### Step 2 — Configure

The dialog shows the archive's title, when it was exported, and how many elements, media files, and worldbuilding entries it contains.

Choose a **project slug** — the short name used in the project's URL. Inkweld pre-fills it from the archive and checks availability as you type.

| Rule       |                                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| Length     | 3–50 characters                                                                      |
| Characters | Lowercase letters, numbers, and hyphens                                              |
| Unique     | Must not match another project in your account (or in this browser, in offline mode) |

### Step 3 — Import

Click **Import** and watch the progress bar. Elements are created first, then documents, worldbuilding data, snapshots, and finally media. If anything fails, the partially created project is removed so you can fix the problem and try again.

### Step 4 — Done

The new project appears on your Bookshelf. All element IDs are regenerated on import, so the copy is fully independent of the original.

## Common uses

### Backups

Export regularly and store the archive in cloud storage or on an external drive. In offline mode this matters most: projects live in your browser's storage, and clearing site data removes them.

### Moving between instances

Export from one Inkweld server, import on another. Archives are self-contained and don't depend on the server they came from.

### Going from offline to a server

Export the project in offline mode, connect to a server (see [Choosing Your Mode](../getting-started/client-mode)), log in, and import. For several projects at once, the built-in migration in **User Settings → Connection** does the same thing without the intermediate files.

### Duplicating a project

Export, then import under a new slug. Useful for starting a sequel from the same world, or experimenting with a restructure without touching the original.

### Sharing a complete copy

Send the archive to a co-author or editor. They get an independent copy of the whole project — unlike [sharing](../collaboration/sharing), which grants live access to the same project.

## Version compatibility

Each archive records the format version it was written with.

- Archives from **older** versions of Inkweld are migrated automatically on import.
- Archives from a **newer** version than the one you're running are rejected with an _unsupported version_ message. Update Inkweld, then import again.

## Troubleshooting

| Message                                         | What to do                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| _Please select a ZIP file_                      | Only `.inkweld.zip` (or `.zip`) archives are accepted.                         |
| _Failed to parse archive_                       | The file is not an Inkweld archive or is corrupted. Re-export from the source. |
| _This slug is already taken_                    | Choose a different slug; the import never replaces an existing project.        |
| _The following documents have unsynced changes_ | Wait for sync to finish (check the connection indicator), then export again.   |
| _Unsupported version_                           | The archive comes from a newer Inkweld. Update your instance.                  |

---

Developers can find the full archive layout and migration rules in the [Project Archive Format](/docs/developer/project-archives) reference.
