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

| Property | Value |
|---|---|
| **URL** | `/api/v1/ai/mcp` |
| **Transport** | Streamable HTTP (POST for JSON-RPC, GET for SSE) |
| **Protocol Version** | `2025-06-18` |
| **Auth** | Bearer token (OAuth JWT or legacy API key) |

### Available Tools

#### Read Operations

| Tool | Description |
|---|---|
| `get_project_tree` | Get the element tree structure for a project |
| `search_elements` | Full-text search across project elements |
| `search_worldbuilding` | Search worldbuilding content with optional full data |
| `search_relationships` | Find relationships for a specific element |
| `get_element_full` | Get complete element data including worldbuilding |
| `get_document_content` | Get prose content from a document element |
| `get_relationships_graph` | Get all relationships as a graph structure |
| `get_project_metadata` | Get project metadata and settings |
| `get_publish_plans` | Get saved publish/export configurations |

#### Write Operations

| Tool | Description |
|---|---|
| `create_element` | Create new story elements |
| `update_element` | Modify existing elements |
| `delete_element` | Remove elements from the tree |
| `move_elements` | Move elements to a new parent |
| `reorder_element` | Change element position within siblings |
| `sort_elements` | Sort children alphabetically |
| `update_worldbuilding` | Update worldbuilding data for an element |
| `create_relationship` | Create relationships between elements |
| `delete_relationship` | Remove a relationship |
| `tag_element` | Add, remove, or set tags on an element |
| `create_snapshot` | Create a snapshot of a document's current state |

#### Image Operations

| Tool | Description |
|---|---|
| `generate_image` | Generate an image using AI |
| `set_element_image` | Set an element's cover image |
| `generate_and_set_element_image` | Generate and set an element image |
| `set_project_cover` | Set the project cover image |
| `generate_project_cover` | Generate and set a project cover |

### Available Resources

Resources list the projects the user has authorized access to:

- **Project List** — `inkweld://projects` lists all authorized projects
- **Individual Projects** — `inkweld://project/{user}/{slug}` provides project details and available permissions

:::tip
Use tools like `search_elements`, `add_element`, and `update_element` to work with project content. Pass the project key (e.g., `alice/my-novel`) as a parameter to specify which project to operate on.
:::

## OAuth 2.1 Flow

### Discovery Endpoints

| Endpoint | RFC | Purpose |
|---|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728 | Protected Resource Metadata |
| `/.well-known/oauth-authorization-server` | RFC 8414 | Authorization Server Metadata |
| `/.well-known/openid-configuration` | OIDC | OpenID Connect discovery (fallback) |

### Supported Standards

- **OAuth 2.1** with mandatory PKCE (S256)
- **Dynamic Client Registration** (RFC 7591) — no pre-registration needed
- **Token Rotation** — refresh tokens are rotated on each use with a grace period
- **JWT Access Tokens** — HS256 signed, contain session and user info

### Scopes

| Scope | Description |
|---|---|
| `mcp:tools` | Access to MCP tools |
| `mcp:resources` | Access to MCP resources |
| `read:project` | Read project metadata |
| `read:elements` | Read story elements |
| `read:worldbuilding` | Read worldbuilding data |
| `read:schemas` | Read element schemas |
| `write:elements` | Create/modify elements |
| `write:worldbuilding` | Modify worldbuilding data |

### Grant Model

During the consent flow, users select which projects to share and choose an access level per project:

| Role | Permissions |
|---|---|
| **Viewer** | `read:project`, `read:elements`, `read:worldbuilding`, `read:schemas` |
| **Editor** | All viewer permissions + `write:elements`, `write:worldbuilding` |
| **Admin** | All permissions |

## Dual-Runtime Support

The MCP/OAuth system runs on both:

- **Bun** (local development) — uses LevelDB for Yjs document storage
- **Cloudflare Workers** (production) — uses Durable Objects for Yjs documents

Environment variables (`BASE_URL`, `DATABASE_KEY`, etc.) are accessed via `c.env` on Workers with a `process.env` fallback for Bun.

## Connected Apps Management

Users can manage authorized OAuth clients at `/settings`:

- View all connected apps
- Change access levels per project
- Revoke individual project access
- Revoke an app entirely

## Configuration

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_KEY` | JWT signing secret (min 32 chars) |
| `BASE_URL` | Server base URL (issuer for JWTs) |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs (for consent redirect) |

### Token Lifetimes

| Token | Lifetime |
|---|---|
| Access Token | 1 hour |
| Refresh Token | 30 days |
| Authorization Code | 5 minutes |

## Legacy API Key Auth

The MCP endpoint also supports legacy API key authentication (`iw_proj_*` prefix) for backward compatibility. These keys provide direct access to a single project without the OAuth flow.
