# Worldbuilding editor: agent notes

Per-element schema copies and identity images are described in
`services/worldbuilding/AGENTS.md`.

## Template editor (unified schema designer)

Element schemas ("templates") are edited through the **unified interactive
schema editor**, not a separate tabbed form. `WorldbuildingEditorComponent`
renders the schema as a live preview (`previewSchema` + `editMode` inputs); the
owning `TemplateEditorPageComponent` (`components/templates-tab/`) applies
`SchemaEditEvent`s (add/remove/reorder tabs & fields, `update-tab` for
label/icon, `update-field` for field config, `add-tab`, etc.) and live-saves via
the `schemaChange` output.

- **Schema Details** is the top tab/section in edit mode (schema name, icon,
  description); tabs follow, then the fixed Identity/Relationships/Media/Styling
  sections. Two responsive layouts: sidenav (wide) and accordion (narrow).
- Tab and schema icon pickers come from `getAvailableIcons()` in
  `worldbuilding-editor.component.ts` — it must keep covering every built-in
  element-type icon, so an existing schema's icon is always selectable.
- The preview's identity panel is read-only (`[readOnly]="previewMode()"`), so
  its async load cannot clobber the schema's `defaultAppearance`/`defaultImage`
  — the styling preview is seeded from the schema instead.
- Template snapshots reuse the document snapshot dialogs
  (`CreateSnapshotDialog` accepts no `MAT_DIALOG_DATA`).
