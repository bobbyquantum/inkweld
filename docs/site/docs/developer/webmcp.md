---
id: webmcp
title: WebMCP (Browser AI Agents)
description: Let an AI agent built into the browser use Inkweld through WebMCP tools.
sidebar_position: 5
---

# WebMCP (Browser AI Agents)

[WebMCP](https://webmachinelearning.github.io/webmcp/) is a proposed browser API that lets a web page offer **tools** to an AI agent running in the browser, such as the assistant built into the browser or a browser extension. The page registers each tool with a name, a description, a JSON Schema for its input and a function that runs it. The agent calls the tools instead of clicking through the UI.

Inkweld registers tools that cover what a user can do in the app: browse and edit projects, documents, worldbuilding, relationships, tags, snapshots and publish plans. The tools run in the page through the same services the UI uses, so they behave the same on every kind of profile (browser-only, cloud folder or server) and act with the signed-in user's access.

This is separate from the [server MCP endpoint](./mcp-oauth.md): that one serves external clients over HTTP with OAuth, while WebMCP tools exist only inside an open Inkweld tab.

## Turning it on

WebMCP is **off by default**, like every AI feature in Inkweld. It follows the user's own **No AI / Allow AI** choice (`SettingsService.aiAllowed`), which defaults to **No AI**. The user changes it in **Settings → General → AI**, or at the bottom of the first-run setup page, next to the theme selector. The **?** next to the choice explains what Allow AI turns on and says whether the browser offers WebMCP.

The same choice also controls the server's AI features (see [AI preference](../admin-guide/ai-kill-switch.md#user-ai-preference)). For WebMCP the server's kill switch does not apply: nothing goes through the server, the agent is the browser's, and Inkweld sends nothing to an AI provider. The choice is stored per browser (`inkweld-ai` localStorage key) and shared by every profile in it, because setup offers it before any profile exists.

`WebMcpService` looks for the API at startup, again a few times shortly after, and whenever the choice is shown. An extension or polyfill can add `document.modelContext` after the app boots, and Chrome adds it when an origin-trial token is inserted at runtime. In Chrome, WebMCP needs the `chrome://flags/#enable-webmcp-testing` flag or the site's origin-trial token.

## Tools

The app tools are registered as soon as WebMCP is on. The project tools are registered while a project is open and removed when it closes. Tools that change the project are registered only while the user can edit it; they also check access each time they run. Agents learn about each change through the browser's `toolchange` event.

| Group            | Tools                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | `get_app_state`, `list_projects`, `open_project`, `list_project_templates`, `create_project`, `go_home`, `get_preferences`, `update_preferences`                              |
| Project and tree | `get_project`, `update_project`, `get_project_tree`, `search_elements`, `get_element`, `create_element`, `update_element`, `move_element`, `delete_element`, `export_project` |
| Tabs and views   | `open_element`, `open_view`, `close_tab`                                                                                                                                      |
| Documents        | `get_document_content`, `update_document_content`, `search_text`                                                                                                              |
| Worldbuilding    | `list_schemas`, `get_worldbuilding`, `update_worldbuilding`                                                                                                                   |
| Relationships    | `list_relationship_types`, `list_relationships`, `create_relationship`, `update_relationship`, `delete_relationship`, `create_relationship_type`                              |
| Tags             | `list_tags`, `create_tag`, `tag_element`, `delete_tag`                                                                                                                        |
| Snapshots        | `list_snapshots`, `create_snapshot`, `restore_snapshot`                                                                                                                       |
| Publishing       | `list_publish_plans`, `create_publish_plan`, `open_publish_plan`, `publish`                                                                                                   |

Document content is read and written as Markdown or as Inkweld's XML format, the same formats the server MCP tools use. Every tool sets the WebMCP annotations: `readOnlyHint` for tools that only read, `untrustedContentHint` for results that contain user-written text, and `consequentialHint` for `delete_element`, `delete_tag` and `restore_snapshot`.

## How it works

- `WebMcpService` (`frontend/src/app/services/webmcp/`) is started from `AppComponent`. It watches the preference and, when the browser supports WebMCP, loads the tool registry with a dynamic `import()`. The tools are not part of the initial bundle.
- `model-context.ts` supports both the current draft (`document.modelContext`, where aborting the registration's `AbortSignal` unregisters the tool) and Chrome's early preview (`navigator.modelContext` with `unregisterTool()`).
- A tool returns an MCP-style `CallToolResult`. Errors come back as `isError` results instead of rejected promises, because the browser reports a rejection to the agent only as "tool rejected", without the message.
- `DocumentAccess` writes a document through the open editor's live Y.Doc when there is one, so the user sees the change. Otherwise it loads a headless copy from IndexedDB. On a server profile that copy is synced with the server before a read or a write, and pushed back after a write; replacing the text of a stale copy would leave the server's newer paragraphs in place. A headless write emits `localEdit$` so Cloud Sync and auto-snapshots notice it.
- Elements are created through `ProjectStateService.createElement()`, the same path as the New element dialog, so presets (scene, note, conversation, map, cover) behave identically.

## Trying it out

Use a browser that ships WebMCP (or has it behind a flag or origin trial), or a WebMCP extension, then turn the setting on and ask the agent to, for example, "outline three chapters in my open project".
