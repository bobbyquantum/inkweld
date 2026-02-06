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

| Tool | Description |
|---|---|
| `search_elements` | Full-text search across project elements |
| `add_element` | Create new story elements |
| `update_element` | Modify existing elements |
| `generate_image` | Generate images for elements |

### Available Resources

Resources follow the URI pattern `inkweld://{type}/{username}/{slug}/{path}`:

- **Projects** — `inkweld://projects` and `inkweld://project/{user}/{slug}`
- **Elements** — `inkweld://elements/{user}/{slug}` and individual element URIs
- **Worldbuilding** — `inkweld://worldbuilding/{user}/{slug}/{elementId}`
- **Schemas** — `inkweld://schemas/{user}/{slug}`

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
