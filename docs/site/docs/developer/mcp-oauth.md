---
id: mcp-oauth
title: MCP & OAuth Integration
description: AI integration via Model Context Protocol with OAuth 2.1 authorization.
sidebar_position: 4
---

# MCP & OAuth Integration

Inkweld exposes creative writing project data to AI assistants through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Authentication is handled via OAuth 2.1 with PKCE, enabling secure third-party access to user projects.

## Architecture

```
AI Client (Claude, etc.)
    │
    ├── Discovery: GET /.well-known/oauth-protected-resource
    │   └── Finds authorization_servers → AS metadata
    │
    ├── DCR: POST /oauth/register
    │   └── Registers as OAuth client (one-time)
    │
    ├── Auth: Browser redirect → /oauth/authorize
    │   └── User selects projects + grants consent
    │
    ├── Token: POST /oauth/token (PKCE exchange)
    │   └── Receives JWT access_token + refresh_token
    │
    └── MCP: POST /api/v1/ai/mcp (Streamable HTTP)
        └── JSON-RPC with Bearer token
```

## MCP Endpoint

| Property             | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| **URL**              | `/api/v1/ai/mcp`                                           |
| **Transport**        | Streamable HTTP (stateless, POST for JSON-RPC)             |
| **Protocol Version** | `2026-07-28`                                               |
| **Auth**             | Bearer token (OAuth JWT). There are no long-lived API keys |

The server implements the **stateless** MCP protocol (`2026-07-28`): modern
clients have no `initialize` handshake and no `Mcp-Session-Id` header. Every
request carries its protocol version, client info, and client capabilities in
`_meta`, and the server identifies itself in each result's `_meta`.
`GET`/`DELETE` on the endpoint return `405 Method Not Allowed`. Stateless
`2026-07-28` clients should call `server/discover` first to learn the supported
protocol versions and capabilities.

For backward compatibility, the server is **dual-era**: legacy clients (those
using the pre-stateless `initialize` handshake, e.g. MCP Inspector 0.22.0) are
still served the classic initialize response with an `Mcp-Session-Id` header,
while requests that carry their protocol version in `_meta` are served
statelessly.

### Available Tools

#### Read Operations

| Tool                      | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| `list_projects`           | List authorized projects (call first to find project keys) |
| `get_project_schemas`     | Get a project's element schemas                            |
| `get_project_tree`        | Get the element tree structure for a project               |
| `search_elements`         | Full-text search across project elements                   |
| `search_worldbuilding`    | Search worldbuilding content with optional full data       |
| `search_relationships`    | Find relationships for a specific element                  |
| `get_element_full`        | Get complete element data including worldbuilding          |
| `get_document_content`    | Get prose content from a document element, or one section  |
| `get_document_outline`    | List a document's heading-based sections                   |
| `get_canvas`              | Read a canvas: page colours, layers, frames and objects    |
| `get_relationships_graph` | Get all relationships as a graph structure                 |
| `get_project_metadata`    | Get project metadata and settings                          |
| `get_publish_plans`       | Get saved publish/export configurations                    |
| `list_project_media`      | List project media files and media:// URLs                 |
| `list_image_profiles`     | List enabled image profiles and profile IDs for generation |
| `get_media_content`       | Read media:// content as image, text, or base64            |

#### Write Operations

| Tool                      | Description                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `create_element`          | Create new story elements                                           |
| `update_element`          | Modify existing elements                                            |
| `delete_element`          | Remove elements from the tree                                       |
| `replace_all_elements`    | Replace the whole element tree in one call (destructive, see below) |
| `move_elements`           | Move elements to a new parent                                       |
| `reorder_element`         | Change element position within siblings                             |
| `sort_elements`           | Sort children alphabetically                                        |
| `update_worldbuilding`    | Update worldbuilding data for an element                            |
| `update_document_content` | Replace prose content of a document element                         |
| `update_document_section` | Replace, add to or delete one section of a document                 |
| `edit_canvas`             | Add, change, delete and restack objects on a canvas                 |
| `create_media_upload`     | Get a short-lived URL for uploading an image file                   |
| `create_relationship`     | Create relationships between elements                               |
| `delete_relationship`     | Remove a relationship                                               |
| `tag_element`             | Add, remove, or set tags on an element                              |
| `create_snapshot`         | Create a snapshot of a document's current state                     |

`replace_all_elements` (requires `write:elements`) deletes every existing element and replaces them with the supplied list, so it is meant for bulk restructuring or initial setup, not routine edits. The elements must be in positional order: children immediately follow their parent and each has `level = parent level + 1`. The tool normalizes `order` values and `parentId`s from that ordering. Prefer `create_element`, `move_elements` and `reorder_element` when you only need to change part of the tree.

When creating a worldbuilding entry via `create_element`, pass `schemaId` along with `type: "WORLDBUILDING"` so the element is template-bound (for example, `character-v1` or `location-v1`). If `schemaId` is omitted, the element is treated as generic worldbuilding.

#### Editing part of a document

`update_document_content` rewrites the whole document, which costs an agent the full text in and out and replaces every block, so comments and anything a collaborator is typing elsewhere are lost. For a change to part of a long document, use the section tools instead (`update_document_section` needs `write:elements`):

- A **section** starts at a top-level heading and runs to the next heading of the same or a higher level, so it includes its subsections. **Section 0** is the content before the first heading; in a document without headings it is the whole text. Headings inside lists, blockquotes or tables don't start sections.
- `get_document_outline` lists the sections in order with their `index`, `level`, `heading`, `path` (for example `Part One > Chapter 2`), `blockCount` and `wordCount`.
- `get_document_content` with `section` or `sectionIndex` returns just that section, heading included, in any of its formats.
- `update_document_section` takes the section, an `operation` and `content` (`prosemirror_xml` or `markdown`, as for `update_document_content`):

| Operation       | Effect                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| `replace`       | Replace the whole section, heading included (the read output can be sent back) |
| `replace_body`  | Keep the heading, replace everything under it, subsections included            |
| `prepend`       | Insert right after the heading                                                 |
| `append`        | Insert at the end of the section, after its subsections                        |
| `insert_before` | Insert before the heading                                                      |
| `delete`        | Remove the section, heading and subsections included                           |

A section is named by `section`, its heading text (case and leading `#`s are ignored; a path such as `Part Two > Chapter 1` picks one of several headings with the same text), or by `sectionIndex` from the outline. When both are given they must name the same section, which catches an index that went stale because the document changed. An ambiguous or unknown heading is an error that lists the candidates, and nothing is written.

Only the blocks in the edited range are deleted and inserted, in one Yjs transaction, so the rest of the document keeps its Yjs items. On Workers the tool loads the document's full state from the Durable Object and sends back only its change as a Yjs update, so an edit made elsewhere in the meantime merges. The result reports the blocks removed and added, the word counts, and a note when the edit changed the number of headings (later indexes moved) or a `replace` dropped the section's heading. The section logic itself lives in `packages/inkweld-prosemirror/src/xml/sections.ts`.

#### Working on a canvas

`get_canvas` (`read:elements`) and `edit_canvas` (`write:elements`) read and change the contents of a `CANVAS` element. Create one with `create_element`. What they accept and return is shared with the WebMCP tools in `packages/inkweld-canvas`, and their tool descriptions document the fields.

- **Reading** returns the page colours, layers, frames and objects, back to front. Hand-drawn strokes can run to megabytes of points, so objects are summarised by default: a path or polygon reports `pointCount` and `bounds` instead of its points, and long text and inline images are cut. `objectIds` returns specific objects whole; `layerId`, `offset` and `limit` page through the rest.
- **Editing** takes `add`, `update` (a merge; `null` removes an optional field), `delete`, `moveToFront`, `moveToBack`, `layers`, `frames`, `background` and `inkColor`. The whole request is validated first, so a bad edit changes nothing.
- **Locks are respected.** Locked objects, and anything but pins on locked layers, are refused until unlocked, which can be in the same edit: `update` can unlock an object that `delete` then removes, and `layers` can unlock a layer. An edit that locks a layer can still change what is on it, or the `undo` of an edit that unlocked it could not put things back. Restacking is not refused, since moving anything else past a locked object changes its place in the stack anyway. Removing a layer requires deleting or moving its artwork in the same edit; pins move to another layer, as they do in the app.
- **Links are kept up to date.** A pin or region's `linkedElementId` creates the relationship behind it, and changing the link or deleting the object removes that relationship.
- **Going back:** the result's `undo` holds `edit_canvas` arguments that reverse the edit, unless they would be over 64 KB or the edit set something with no earlier value, such as a first page colour. There is no other way back from an agent's edit: `create_snapshot` covers documents and worldbuilding, not canvases, and an edit from elsewhere clears the app's undo history for that canvas, as any collaborator's does.
- **Agents cannot see the result yet.** There is no render tool, and objects have fixed coordinates, so overlaps and text overflow are not reported. A user can check the canvas in the app; an agent with browser access can screenshot it.

The edit goes into the `canvases` map of the project's elements document one object at a time, so it merges with anyone drawing at the same time and an open canvas tab shows it. The tool also rewrites the element's `canvasConfig` metadata, because browsers only mirror their own edits there and archives, templates and the media-usage scan read it. A canvas that so far only exists in that metadata (restored from an archive) is seeded first, or its contents would be lost.

Images use project media. `create_media_upload` (`write:elements`) takes a `format` (`png`, `jpeg`, `webp` or `gif`) and returns an `uploadUrl` and the `mediaUrl` the file will have. The agent sends the file with a plain `PUT`, for example `curl --fail --upload-file picture.png "<uploadUrl>"`, so the bytes never pass through its conversation the way `apply_image`'s `base64Data` does. The URL's token is the only credential. It names one new file, expires after 15 minutes and is signed with a key derived for this purpose alone, so it cannot pass as a session or OAuth token. The route (`routes/mcp-upload.routes.ts`) checks again that MCP is enabled, the session is not revoked and the user can still write to the project, checks the file's magic bytes against the format, charges the project owner's sync capacity, and refuses a second upload to the same URL.

A browser fetches such an image from the server when a canvas needs it, rather than waiting for the next background media sync (`CanvasRendererService.resolveImageSrc`).

#### Schema (Template) Operations

These need the `write:schemas` permission (editors and admins).

| Tool            | Description                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| `create_schema` | Create a worldbuilding element type, from tabs of fields or by cloning another one  |
| `update_schema` | Rename a schema, change its icon, description or defaults, and edit its tabs/fields |
| `delete_schema` | Delete a schema (elements of that type keep their own copy and their data)          |

`update_schema` takes either `operations` (applied in order: `add_tab`, `update_tab`, `remove_tab`, `move_tab`, `add_field`, `update_field`, `remove_field`, `move_field`) or `tabs` (replace every tab). Fields take the same properties as in the template editor (`label`, `key`, `type`, `placeholder`, `description`, `defaultValue`, `options`, `rows`, `icon`, `validation`, `layout`, and `targetSchemaId` / `multiple` / `inverseLabel` for relationship fields). A key left out is derived from the label (`"Eye Colour"` → `eyeColour`), and `description` / `image` are refused as new field keys because every element already has those identity fields. The edited schema is validated the way the template editor validates it (unique tab keys, field keys unique across the schema, no field clashing with a nested group); if any operation fails, nothing is written.

Like the template editor, the tools keep each relationship field's backing relationship type in step: creating or changing the field adds or updates the type, and removing the field (or changing its type, or deleting the schema) deletes the type and every relationship made through it.

Existing elements keep their own copy of their schema, so editing a shared schema doesn't change them: each one shows that the shared schema was updated and can take the change with "Update from shared schema" in the element editor. Elements created afterwards use the new version.

#### Image Operations

| Tool          | Description                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apply_image` | Unified image tool: generate (AI), upload (base64), or reference existing media — and optionally assign to project cover or element image |

Call `list_image_profiles` first and pass `profileId` when using `source: "generate"`.

#### Discovering Projects

Every other tool takes a `project` argument in `username/slug` form, so start with project discovery. Some MCP clients (for example Claude's connector) only surface tools, not resources, which is why discovery and schema access are available as tools too.

| Tool                  | Arguments            | Required permission | Returns                                                                                                                                             |
| --------------------- | -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`       | none                 | none                | `totalProjects` and, per project: `username`, `slug`, `projectKey`, `role`, `permissions`, `permissionSummary`                                      |
| `get_project_schemas` | `project` (required) | `read:schemas`      | `total` and `schemas`: the worldbuilding element types (for example Character, Location) with id, name, icon, description, tabs/fields and defaults |

`list_projects` only reports the caller's own grants, so it is always available to an authorized session. Example call and result:

```json
{ "name": "list_projects", "arguments": {} }
```

```json
{
  "totalProjects": 1,
  "projects": [
    {
      "username": "alice",
      "slug": "my-novel",
      "projectKey": "alice/my-novel",
      "role": "editor",
      "permissions": ["read:project", "read:elements", "write:elements"],
      "permissionSummary": "..."
    }
  ]
}
```

Call `get_project_schemas` before `create_element` or `update_worldbuilding` to learn the valid schema ids and field keys:

```json
{ "name": "get_project_schemas", "arguments": { "project": "alice/my-novel" } }
```

Every worldbuilding element also has two **identity fields** outside its schema, `description` and `image` (listed as `identityFields` in the result). `update_worldbuilding` resolves a bare key against the element's schema first: if the schema defines a `description` field, `"description"` writes that field. Use `"identity.description"` / `"identity.image"` to write the identity field, and `"worldbuilding.<key>"` to force a schema field.

Schema fields with a dotted key (`description.terrain`) are nested: `"description.terrain": "…"` writes that one field, and an object value (`"worldbuilding.description": { "terrain": "…" }`) merges into the nested fields instead of replacing them. `create_element` gives a new worldbuilding element the schema's empty field skeleton, as the app does, and a write creates any missing parent, so elements created before that still accept nested writes. A write is refused if a parent key holds plain text (an older template's `description` field). Every write updates the element's `lastModified`.

### Available Resources

Resources list the projects the user has authorized access to:

- **Project List** — `inkweld://projects` lists all authorized projects (same data as `list_projects`)
- **Individual Projects** — `inkweld://project/{user}/{slug}` provides project details and available permissions
- **Sub-resources** — `elements`, `worldbuilding` and `schemas` under each project; `schemas` returns the same data as `get_project_schemas`

:::tip
Call `list_projects` first, then use tools like `search_elements`, `create_element` and `update_element` to work with project content. Pass the project key (e.g., `alice/my-novel`) as the `project` parameter to specify which project to operate on.
:::

## OAuth 2.1 Flow

### Discovery Endpoints

| Endpoint                                  | RFC      | Purpose                             |
| ----------------------------------------- | -------- | ----------------------------------- |
| `/.well-known/oauth-protected-resource`   | RFC 9728 | Protected Resource Metadata         |
| `/.well-known/oauth-authorization-server` | RFC 8414 | Authorization Server Metadata       |
| `/.well-known/openid-configuration`       | OIDC     | OpenID Connect discovery (fallback) |

### Supported Standards

- **OAuth 2.1** with mandatory PKCE (S256)
- **Dynamic Client Registration** (RFC 7591) — no pre-registration needed
- **Token Rotation** — refresh tokens are rotated on each use with a grace period
- **JWT Access Tokens** — HS256 signed, contain session and user info

### Scopes

| Scope                 | Description                          |
| --------------------- | ------------------------------------ |
| `mcp:tools`           | Access to MCP tools                  |
| `mcp:resources`       | Access to MCP resources              |
| `read:project`        | Read project metadata                |
| `read:elements`       | Read story elements                  |
| `read:worldbuilding`  | Read worldbuilding data              |
| `read:schemas`        | Read element schemas                 |
| `write:elements`      | Create/modify elements               |
| `write:worldbuilding` | Modify worldbuilding data            |
| `write:schemas`       | Create/modify/delete element schemas |

### Grant Model

During the consent flow, users select which projects to share and choose an access level per project:

| Role       | Permissions                                                                       |
| ---------- | --------------------------------------------------------------------------------- |
| **Viewer** | `read:project`, `read:elements`, `read:worldbuilding`, `read:schemas`             |
| **Editor** | All viewer permissions + `write:elements`, `write:worldbuilding`, `write:schemas` |
| **Admin**  | All permissions                                                                   |

Users may instead choose **"Access all my projects"** plus a **default access level**. In that mode the session (`mcp_oauth_sessions.access_all_projects` / `default_role`) expands to every project the user owns (current and future) at the default role, instead of an explicit `project_collaborators` row per project. Explicit per-project grants are still honoured as overrides where present. This choice is carried from the consent page through the authorization code (`mcp_oauth_codes`) to the session.

## Dual-Runtime Support

The MCP/OAuth system runs on both:

- **Bun** (local development) — uses LevelDB for Yjs document storage
- **Cloudflare Workers** (production) — uses Durable Objects for Yjs documents

Environment variables (`BASE_URL`, `DATABASE_KEY`, etc.) are accessed via `c.env` on Workers with a `process.env` fallback for Bun.

## Connected Apps Management

Users manage authorized OAuth clients from **User Settings → Authorized Apps** (also deep-linkable at `/settings`). Both entry points render the same shared `ProjectGrantListComponent` used by the consent page, so there is a single implementation of the project + access-level UI:

- View all connected apps
- Change access levels per project
- Toggle **"Access all my projects"** and set a default access level
- Add / revoke individual project access
- Revoke an app entirely

The OAuth consent page and the Authorized Apps management tab both use the shared `ProjectGrantListComponent` (`frontend/src/app/components/project-grant-list/`) so project-grant editing stays consistent across the two flows.

## Configuration

### Required Environment Variables

| Variable          | Purpose                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_KEY`    | JWT signing secret (min 32 chars). Falls back to `SESSION_SECRET` when unset, so most deployments only set `SESSION_SECRET`                                                                                                                                                       |
| `BASE_URL`        | Public server URL, used as the OAuth issuer and in discovery metadata. Optional: the discovery endpoints fall back to the request's own origin, but set it explicitly behind a reverse proxy or on Cloudflare Workers, where the origin the server sees may not be the public one |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs (the first is used for the consent page redirect)                                                                                                                                                                                                   |

See the [Configuration reference](../configuration.md) for details. `MCP_ENABLED` turns MCP off entirely.

### Token Lifetimes

| Token              | Lifetime  |
| ------------------ | --------- |
| Access Token       | 1 hour    |
| Refresh Token      | 30 days   |
| Authorization Code | 5 minutes |
