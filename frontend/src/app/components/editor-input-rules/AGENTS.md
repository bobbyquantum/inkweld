# Markdown input rules: agent notes

ngx-editor registers Markdown input rules (`# `, `> `, `- `, `1. `,
bold/italic, smart quotes) behind its `inputRules` option. Inkweld makes them
**opt-in** (`SettingsService.markdownShortcuts`, default off, Settings →
General) because prose often starts a line with `#` or `-`;
`DocumentElementEditorComponent.createEditor()` reads it when the editor is
created, so a change applies to documents opened afterwards.

`createUndoInputRulePlugin()` (Backspace reverts a conversion) is always
installed ahead of ngx-editor's `baseKeymap` in `document.service.ts` and is a
no-op when the rules are off.
