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
  /** The element's own schema copy, when it has one */
  schema?: ElementTypeSchema;
  /** Content hash of the shared schema this copy was last aligned to */
  schemaBaseHash?: string;
}
```

Field keys use dot notation for nested structures (e.g., `"appearance.height": "180cm"`).

Each worldbuilding element carries its own copy of its schema (the `schema` Yjs
map on the element document). `schema` and `schemaBaseHash` round-trip that copy
so an element customised away from the shared project schema keeps its shape on
import. Archives written before per-element schemas omit both fields; on first
open the element copies the shared schema in, which is the same recovery path
used for elements that predate the feature.

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

| Version | Change         |
| ------- | -------------- |
| 1       | Initial format |

### Version Checking on Import

Import accepts only archives whose version equals `ARCHIVE_VERSION`:

1. **Version greater than ARCHIVE_VERSION**: Rejected with `UnsupportedVersion`. The user must update Inkweld.
2. **Any other version**: Rejected with `VersionMismatch`.

### Changing the Format

When making a breaking change to the archive format:

1. Increment `ARCHIVE_VERSION` in `project-archive.ts`
2. Document the change in the version table above and the JSDoc on `ARCHIVE_VERSION`
3. Decide whether archives at the previous version should still import; if so,
   add an upgrade step to `project-import.service.ts` before validation, with tests

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
2. **Validation**: Check the version, structure and required fields
3. **Project Creation**: Create new project (offline or via API)
4. **Data Import**: Import elements, documents, worldbuilding, schemas, etc.
5. **Snapshot Import**: Restore version history (optional)
6. **Media Import**: Extract and store media files
7. **Cover Upload**: Upload cover to server (server mode)

### Error Handling

The service throws `ProjectArchiveError` with specific types:

| Error Type            | Cause                                  |
| --------------------- | -------------------------------------- |
| `InvalidFormat`       | Not a valid ZIP file                   |
| `CorruptedArchive`    | Missing or invalid required files      |
| `UnsupportedVersion`  | Archive version too new                |
| `VersionMismatch`     | Archive version is not the current one |
| `SlugTaken`           | Project slug already exists            |
| `ValidationFailed`    | Invalid data structure                 |
| `StorageError`        | IndexedDB or file system error         |
| `NetworkError`        | Server communication failed            |
| `SyncRequired`        | Documents not synced before export     |
| `MediaDownloadFailed` | Failed to download media               |
| `MediaUploadFailed`   | Failed to upload cover                 |
| `Cancelled`           | User cancelled operation               |

## Related Files

| File                                                           | Purpose                     |
| -------------------------------------------------------------- | --------------------------- |
| `frontend/src/app/models/project-archive.ts`                   | Archive types and constants |
| `frontend/src/app/services/project/project-export.service.ts`  | Export implementation       |
| `frontend/src/app/services/project/project-import.service.ts`  | Import implementation       |
| `frontend/src/app/services/project/document-import.service.ts` | Document content writing    |

## Best Practices

### For Users

- Export before major changes or migrations
- Store archives in cloud storage or external drives
- Verify sync status before exporting (server mode)

### For Developers

- Always increment `ARCHIVE_VERSION` for breaking changes
- Document version changes in the version history
- If previous-version archives should still import, add and test an upgrade step
