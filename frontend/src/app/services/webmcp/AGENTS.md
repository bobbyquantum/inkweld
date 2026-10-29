# WebMCP (browser AI agents): agent notes

`WebMcpService` registers tools with the browser's WebMCP API
(`document.modelContext`, or Chrome's earlier `navigator.modelContext`) so an
agent built into the browser can do what the user can do in the app. Docs:
`docs/site/docs/developer/webmcp.md`.

- **Follows the user's AI preference**: `SettingsService.aiAllowed`, the
  "No AI / Allow AI" choice (default No AI, `AiPreferenceComponent` in
  Settings → General and on /setup, with a "?" that opens
  `AiPreferenceInfoDialogComponent`). It is stored under the unprefixed
  `inkweld-ai` key so it is shared by every profile and can be chosen before
  one exists. The server's AI kill switch does not apply to WebMCP: no request
  goes to an AI provider, and the tools work in every mode. Detection re-runs
  after startup (`refreshSupport`) because extensions and runtime origin-trial
  tokens add the API late.
- **Lazy**: the tools load through `WEBMCP_REGISTRY_LOADER` (a dynamic
  `import('./tools')`) only once enabled in a supporting browser. Keep
  `webmcp.service.ts` free of static imports of the tool modules, or the
  editor stack lands in the initial bundle.
- **Same paths as the UI**: tools call the existing services
  (`ProjectStateService.createElement()` is shared with the New element
  dialog). Add a tool when you add a user-facing capability, under
  `tools/*.tools.ts` with a spec; mark project changes `writes: true` (they
  are left out while the user can only read) and check `ctx.requireWrite()`.
- **Errors are results**: throw `ToolError`; `toModelContextTool` turns it
  into an `isError` result, because a rejected promise reaches the agent
  without its message.
- **Documents** go through `DocumentAccess`: the live Y.Doc when an editor
  has it open, otherwise a headless IndexedDB copy that is synced with the
  server before and after on server profiles. Never replace the text of a
  headless copy without that pull: the server's newer content would survive
  the replace.
