---
id: import-export
title: Backups, Export & Import
description: Export a project as a portable .inkweld.zip archive, restore it anywhere, and move projects between modes or instances.
sidebar_position: 9
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
| Time systems         | The calendars and time systems installed in the project                     |
| Generators           | Random name and idea generators defined in the project                      |
| Relationships & tags | Relationship types, links between elements, tag definitions and assignments |
| Media links          | Which elements each media library file is tagged with                       |
| Publish plans        | Saved export configurations and typography styles                           |
| Media                | Cover and inline images from the media library                              |
| Snapshots            | Named document versions and their history                                   |

Not included: collaborators and sharing permissions, comments, and per-user settings. Those belong to the server account rather than the project.

## Exporting a project

Open the **Project Settings** tab (bottom of the project navigator), go to the **Actions** section, and click **Export Project** on the **Export & Import** card.

Inkweld packages the project and your browser downloads a file named like:

```
my-novel_2026-09-02_14-30-00.inkweld.zip
```

### Exporting while connected to a server

In Realtime Sync, the export waits for the server copy to be complete first:

1. **Sync check** — if any document still has unsynced changes, the export stops and lists those documents. Wait a moment for sync to finish, then try again.
2. **Media download** — the cover and any images not yet cached locally are fetched from the server so the archive is complete.

In Browser and Cloud Sync modes there is no server check; the archive is built straight from your browser's storage.

## Importing a project

An import always creates a **new project**. It never overwrites an existing one, so it's safe to import the same archive more than once.

Open the import dialog from either of these:

- The **Create** menu on the Bookshelf (the home screen) → **Import Project**, or the **Import Project** button on an empty Bookshelf
- The **Import Project** button on the **Export & Import** card in a project's **Project Settings** tab (**Actions** section)

### Step 1 — Choose the file

Drag a `.inkweld.zip` file onto the drop zone (**Drag and drop a project archive here**), or click **Browse Files**. Inkweld reads the archive and checks that it's valid.

### Step 2 — Configure

The dialog shows the archive's title, when it was exported, and how many elements, media files, and worldbuilding entries it contains.

Choose a **project slug** — the short name used in the project's URL. Inkweld pre-fills it from the archive and checks availability as you type.

| Rule       |                                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| Length     | 3–50 characters                                                                      |
| Characters | Lowercase letters, numbers, and hyphens                                              |
| Unique     | Must not match another project in your account (or in this browser, in Browser mode) |

### Step 3 — Import

Click **Import** and watch the progress bar. Elements are created first, then documents, worldbuilding data, snapshots, and finally media. If anything fails, the partially created project is removed so you can fix the problem and try again.

### Step 4 — Done

The new project appears on your Bookshelf. Elements keep their original internal IDs, so the copy is independent of the original because it has its own slug (and, on a server, its own project), not because its IDs were regenerated.

## Common uses

### Backups

Export regularly and store the archive in cloud storage or on an external drive. In Browser mode this matters most: projects live only in your browser's storage, and clearing site data removes them. Cloud Sync keeps a continuous mirror in your own storage, but an archive is still the portable copy.

### Moving between instances

Export from one Inkweld server, import on another. Archives are self-contained and don't depend on the server they came from.

### Moving between modes

Export the project in Browser or Cloud Sync mode, switch mode (see [Choosing Your Mode](../getting-started/client-mode)), sign in if needed, and import. For several projects at once, the built-in migration under **Manage profiles…** in the account menu does the same thing without the intermediate files.

### Duplicating a project

Export, then import under a new slug. Useful for starting a sequel from the same world, or experimenting with a restructure without touching the original.

### Sharing a complete copy

Send the archive to a co-author or editor. They get an independent copy of the whole project — unlike [sharing](../collaboration/sharing), which grants live access to the same project.

## Version compatibility

Each archive records the format version it was written with, and the dialog shows it next to the export date.

- An archive can only be imported by a version of Inkweld that uses the **same** archive format. Archives from an **older** format are **not** converted automatically: the import fails with a message that the archive version is not supported.
- Archives from a **newer** format than the one you're running are rejected too, with a message asking you to update Inkweld.

If an old archive no longer imports, open it in the Inkweld version that created it and export it again from there, or ask your administrator which release you need.

## Troubleshooting

| Message                                          | What to do                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| _Please select a ZIP file_                       | Only `.zip` files (normally `.inkweld.zip`) are accepted.                                        |
| _Failed to parse archive_                        | The file is not an Inkweld archive or is corrupted. Re-export from the source.                   |
| _Missing required file…_ / _Failed to parse…_    | The archive is incomplete or damaged. Re-export from the source.                                 |
| _This slug is already taken_                     | Choose a different slug; the import never replaces an existing project.                          |
| _Archive version … is newer than supported…_     | The archive comes from a newer Inkweld. Update your instance.                                    |
| _Archive version … is not supported…_            | The archive uses an older format that this version cannot read. See Version compatibility above. |
| _The following documents have unsynced changes…_ | Wait for sync to finish (check the connection indicator), then export again.                     |

---

Developers can find the full archive layout and migration rules in the [Project Archive Format](/docs/developer/project-archives) reference.
