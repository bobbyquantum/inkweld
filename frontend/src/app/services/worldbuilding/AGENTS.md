# Worldbuilding services: agent notes

The template (schema) editor UI is described in
`components/worldbuilding/AGENTS.md`.

## Per-element schema copies

Every worldbuilding element owns a copy of its schema in a third Yjs map on
the element doc, `schema` (alongside `worldbuilding` and `identity`), with keys
`snapshot` (the `ElementTypeSchema`), `baseHash`, and `baseSchemaId`.
`WorldbuildingService.getSchemaForElement` returns that copy, never the shared
library object. Elements without a copy (imported without one, or after "Revert
to shared schema") get the shared schema copied in on first open by
`getElementSchemaState`.

- **Drift detection**: `schemaContentHash` (`frontend/src/app/utils/schema-hash.ts`)
  hashes only `name/icon/description/tabs/defaultValues/defaultAppearance/defaultImage`,
  never `id/version/createdAt/updatedAt/isNew`, because `saveSchemaToLibrary` bumps
  `version` on every save. `isCustom` = copy hash ≠ `baseHash`; `sharedUpdated` =
  shared hash ≠ `baseHash`. The backend mirror in `backend/src/utils/schema-hash.ts`
  **must stay byte-equivalent** (both specs assert the same golden hash) because
  the MCP `create_element` tool writes the copy and `baseHash` at creation.
- **Editing**: the element editor toggles `elementSchemaEditing` (status-bar chip
  menu) and applies `SchemaEditEvent`s through the shared `SchemaEditService`
  reducer with `removeRelationshipTypes: false` — a per-element edit must never
  delete a relationship type other elements still use. The template editor uses
  the same reducer with the default (`true`). Schema Details / defaults remain
  template-only (`templateEditingEnabled()`).
- **Sync** ("Update from shared schema") is a whole-schema apply via
  `mergeElementSchema`: shared wins for matching keys, local-only tabs/fields are
  appended, element data is never touched. Snapshots and project archives carry
  the copy (`__elementSchema` key inside `worldbuildingData`; `schema` +
  `schemaBaseHash` on `ArchiveWorldbuildingData`).
- **Identity vs template fields**: `description` and `image` live in the
  element's `identity` map, outside any schema, but a template may still
  define a field with one of those keys (older templates do). MCP
  `update_worldbuilding` (`backend/src/mcp/tools/worldbuilding-fields.ts`)
  resolves a bare key against the element's schema (copy, else shared by
  `schemaId`) first, so the template field stays writable;
  `identity.<key>` / `worldbuilding.<key>` pick a map explicitly. New templates
  start with an empty General tab rather than seeding `name`/`description`
  fields that duplicate identity.

## Identity images are media references

`identity.image` holds a `media://<id>.<ext>` reference, never a base64
`data:` URL (one generated image is ~2.7 MB of base64 in every sync, snapshot,
archive and MCP read). `IdentityImageService` (`identity-image.service.ts`)
saves the image as local media (uploaded by the media sync, so the server
quota applies) under an id derived from its bytes, or references the media
item it came from (the generator's saved copy, an uncropped library pick).
Opening an older element with an inline image migrates it with a
compare-and-set (`WorldbuildingService.replaceIdentityImage`). The Media tab's
delete check counts identity images and backgrounds as usages.
