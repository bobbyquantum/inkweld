---
id: project-archives
title: Project Archive Format
description: Technical reference for Inkweld's project archive (.inkweld.zip) format used for backup and migration.
sidebar_position: 3
---

# Project Archive Format

Technical documentation of the `.inkweld.zip` archive format used for project export and import.

## Overview

Project archives are complete snapshots of an Inkweld project packaged as ZIP files. They contain:

- All project metadata and settings
- Complete element tree structure (folders, documents, worldbuilding entries)
- Document content as ProseMirror JSON
- Worldbuilding data (flattened from Yjs CRDTs)
- Schemas, relationships, tags, and publish plans
- Media files (cover images, inline images)
- Optional document snapshots (version history)

Archives are self-contained and can be imported into any Inkweld instance.

## Archive Structure

```
project-slug_YYYY-MM-DD_HH-MM-SS.inkweld.zip
├── manifest.json              # Archive metadata & version
├── project.json               # Project settings
├── elements.json              # Element tree structure
├── documents.json             # ProseMirror document content
├── worldbuilding.json         # Worldbuilding entry data
├── schemas.json               # Worldbuilding templates
├── relationships.json         # Element-to-element links
├── relationship-types.json    # Custom relationship definitions
├── tags.json                  # Tag definitions
├── element-tags.json          # Element-tag assignments
├── publish-plans.json         # Export configurations
├── snapshots.json             # Document version history (optional)
├── media-index.json           # Media file manifest
└── media/                     # Binary media files
    ├── cover.jpg
    └── img-*.{jpg,png,gif,webp}
```

## File Specifications

### manifest.json

Archive metadata including version information.

```typescript
interface ArchiveManifest {
  /** Archive format version (currently 1) */
  version: number;
  /** ISO timestamp when archive was created */
  exportedAt: string;
  /** Inkweld version that created this archive */
  appVersion?: string;
  /** Project title for display */
  projectTitle: string;
  /** Original project slug */
  originalSlug: string;
  /** Optional checksums for validation */
  checksums?: {
    project?: string;
    elements?: string;
    media?: string;
  };
}
```

**Example:**

```json
{
  "version": 1,
  "exportedAt": "2026-01-30T15:30:00.000Z",
  "projectTitle": "My Novel",
  "originalSlug": "my-novel",
  "appVersion": "0.2.0"
}
```

### project.json

Project metadata and settings.

```typescript
interface ArchiveProject {
  /** Project title */
  title: string;
  /** Project description */
  description?: string;
  /** Original URL slug */
  slug: string;
  /** Whether project has a cover image */
  hasCover?: boolean;
}
```

### elements.json

Array of project elements (folders, documents, worldbuilding entries).

```typescript
interface ArchiveElement {
  /** Element ID (new IDs generated on import) */
  id: string;
  /** Display name */
  name: string;
  /** Element type: FOLDER, ITEM, or WORLDBUILDING */
  type: ElementType;
  /** Schema ID for worldbuilding elements */
  schemaId?: string | null;
  /** Sort order within parent */
  order: number;
  /** Nesting level (0 = root) */
  level: number;
  /** Parent element ID (null for root) */
  parentId: string | null;
  /** Can contain children */
  expandable?: boolean;
  /** Element version for optimistic locking */
  version?: number;
  /** Additional metadata */
  metadata: Record<string, string>;
}
```

### documents.json

Document content for ITEM elements, stored as ProseMirror JSON.

```typescript
interface ArchiveDocumentContent {
  /** Element ID this content belongs to */
  elementId: string;
  /** ProseMirror JSON content */
  content: unknown;
}
```

The `content` field contains the ProseMirror document state, which includes the document structure with nodes like paragraphs, headings, lists, and custom nodes like element references.

### worldbuilding.json

Data for worldbuilding elements, flattened from Yjs Y.Map structures.

```typescript
interface ArchiveWorldbuildingData {
  /** Element ID */
  elementId: string;
  /** Schema ID (e.g., 'character-v1') */
  schemaId: string;
  /** Flattened field data */
  data: Record<string, unknown>;
}
```

Field keys use dot notation for nested structures (e.g., `"appearance.height": "180cm"`).

### snapshots.json

Optional document version history.

```typescript
interface ArchiveSnapshot {
  /** Document element ID */
  documentId: string;
  /** User-provided snapshot name */
  name: string;
  /** Optional description */
  description?: string;
  /** Document content as XML (preferred format) */
  xmlContent?: string;
  /** Worldbuilding data at snapshot time */
  worldbuildingData?: Record<string, unknown>;
  /** Word count at snapshot time */
  wordCount?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** ISO timestamp */
  createdAt: string;
}
```

### media-index.json

Manifest of media files included in the archive.

```typescript
interface ArchiveMediaFile {
  /** Media identifier (e.g., 'cover', 'img-abc123') */
  mediaId: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Original filename */
  filename?: string;
  /** Path within archive (e.g., 'media/cover.jpg') */
  archivePath: string;
}
```

## Version Compatibility

### Current Version

The current archive format version is **1** (defined in `ARCHIVE_VERSION`).

### Version Checking on Import

When importing an archive:

1. **Version greater than ARCHIVE_VERSION**: Rejected with `UnsupportedVersion` error. User must update Inkweld.
2. **Version less than MIN_SUPPORTED_VERSION**: Rejected with `VersionMismatch` error. Archive is too old.
3. **Version between MIN_SUPPORTED_VERSION and ARCHIVE_VERSION**: Migrated to current version.
4. **Version equals ARCHIVE_VERSION**: Imported directly without migration.

### Migration System

When the archive format changes, migrations handle backward compatibility:

```typescript
// frontend/src/app/services/project/archive-migrations.ts

interface ArchiveMigration {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: (archive: ProjectArchive) => ProjectArchive;
}

export const ARCHIVE_MIGRATIONS: ArchiveMigration[] = [
  // Migrations added here when ARCHIVE_VERSION increases
];
```

Migrations are applied sequentially. An archive at version 1 being imported into version 3 would go through: v1 → v2 → v3.

### Adding a New Migration

When making breaking changes to the archive format:

1. Increment `ARCHIVE_VERSION` in `project-archive.ts`
2. Add a migration function to `ARCHIVE_MIGRATIONS`:

```typescript
{
  fromVersion: 1,
  toVersion: 2,
  description: 'Add displayOrder field to schemas',
  migrate: (archive) => ({
    ...archive,
    schemas: archive.schemas.map(s => ({
      ...s,
      displayOrder: s.displayOrder ?? 0,
    })),
    manifest: { ...archive.manifest, version: 2 },
  }),
}
```

3. Document the change in the version history comment

## Implementation Details

### Export Flow

The export process (`project-export.service.ts`):

1. **Sync Verification** (server mode): Ensures all documents are synced
2. **Media Download**: Downloads cover and media from server
3. **Data Collection**: Gathers elements, documents, worldbuilding data
4. **Yjs Flattening**: Converts Yjs Y.Map/Y.Array to plain JSON
5. **ZIP Creation**: Packages everything with DEFLATE compression (level 6)
6. **Download**: Triggers browser download

### Import Flow

The import process (`project-import.service.ts`):

1. **Load Archive**: Extract ZIP and parse JSON files
2. **Migration**: Apply migrations if archive version < current
3. **Validation**: Check structure and required fields
4. **Project Creation**: Create new project (offline or via API)
5. **Data Import**: Import elements, documents, worldbuilding, schemas, etc.
6. **Snapshot Import**: Restore version history (optional)
7. **Media Import**: Extract and store media files
8. **Cover Upload**: Upload cover to server (server mode)

### Error Handling

The service throws `ProjectArchiveError` with specific types:

| Error Type | Cause |
|------------|-------|
| `InvalidFormat` | Not a valid ZIP file |
| `CorruptedArchive` | Missing or invalid required files |
| `UnsupportedVersion` | Archive version too new |
| `VersionMismatch` | Archive version too old or no migration path |
| `SlugTaken` | Project slug already exists |
| `ValidationFailed` | Invalid data structure |
| `StorageError` | IndexedDB or file system error |
| `NetworkError` | Server communication failed |
| `SyncRequired` | Documents not synced before export |
| `MediaDownloadFailed` | Failed to download media |
| `MediaUploadFailed` | Failed to upload cover |
| `Cancelled` | User cancelled operation |

## Related Files

| File | Purpose |
|------|---------|
| `frontend/src/app/models/project-archive.ts` | Archive types and constants |
| `frontend/src/app/services/project/project-export.service.ts` | Export implementation |
| `frontend/src/app/services/project/project-import.service.ts` | Import implementation |
| `frontend/src/app/services/project/archive-migrations.ts` | Migration registry |
| `frontend/src/app/services/project/document-import.service.ts` | Document content writing |

## Best Practices

### For Users

- Export before major changes or migrations
- Store archives in cloud storage or external drives
- Verify sync status before exporting (server mode)

### For Developers

- Always increment `ARCHIVE_VERSION` for breaking changes
- Add migrations for all breaking changes
- Test migrations with archives from previous versions
- Document version changes in the version history
