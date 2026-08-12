---
sidebar_position: 2
title: Connecting AI Tools (MCP)
description: Add Inkweld to your favourite AI assistant or harness with copy-paste commands using the Model Context Protocol.
---

# Connecting AI Tools (MCP)

Inkweld exposes your projects to AI assistants through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). The recommended way to connect is **OAuth** — on first use the tool opens your browser to sign in and pick which projects to share, so no API key is needed.

Most tools accept a URL pointing at the Inkweld MCP endpoint. You can find your server's exact URL in **Project Settings → MCP Access**, or construct it as:

```
https://<your-server>/api/v1/ai/mcp
```

Replace `<your-server>` with your deployment host (e.g. `api.inkweld.app` or `api.preview.inkweld.app` for a preview instance).

:::tip Legacy API keys
If a tool doesn't support OAuth, your administrator can enable **Legacy MCP API Keys** in **Admin Settings**. When enabled, the project settings page shows a "Legacy API Keys" section where you can create a long-lived, project-scoped `iw_proj_...` token to use instead.

> ⚠️ **Treat legacy keys like passwords.** Never commit a key to source control, paste it into a shared chat, or leave it in a client config file that others can read. Prefer environment or input variables where your client supports them. If you think a key has been exposed, revoke it immediately from **Project Settings → MCP Access → Legacy API Keys** and create a new one.
> :::

## Hermes

[Hermes](https://github.com/NousResearch/hermes-agent) (v0.20.0, v2026.8.3) connects via its `mcp` command with an OAuth flow:

```bash
hermes mcp add inkweld --url https://api.inkweld.app/api/v1/ai/mcp --auth oauth
```

To use a legacy API key instead, use `--auth header` and map the `Authorization` header to a `Bearer iw_proj_...` value:

```bash
hermes mcp add inkweld --url https://api.inkweld.app/api/v1/ai/mcp --auth header \
  --header "Authorization: Bearer iw_proj_your_key_here"
```

## Claude Code

Add a Streamable HTTP server to `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "inkweld": {
      "type": "http",
      "url": "https://api.inkweld.app/api/v1/ai/mcp"
    }
  }
}
```

For a legacy API key, add an `Authorization` header (prefer an environment variable for the token):

```json
{
  "mcpServers": {
    "inkweld": {
      "type": "http",
      "url": "https://api.inkweld.app/api/v1/ai/mcp",
      "headers": {
        "Authorization": "Bearer ${INKWELD_MCP_KEY}"
      }
    }
  }
}
```

## Claude Desktop

Claude Desktop connects to remote MCP servers through **Settings → Connectors → Add connector**. Choose the **Remote MCP server** option and enter the Inkweld MCP endpoint URL:

```
https://api.inkweld.app/api/v1/ai/mcp
```

On first use, Claude Desktop opens your browser to sign in with OAuth and pick which projects to share. Note that Claude Desktop's remote connector UI does **not** support static `iw_proj_...` bearer tokens — use the OAuth flow.

## Cursor

In Cursor, open **Settings → MCP → Add new MCP server** and choose **HTTP**:

- **Name**: `inkweld`
- **URL**: `https://api.inkweld.app/api/v1/ai/mcp`
- **Type**: `http` (Streamable HTTP)

For a legacy API key, set the **Authorization** header to `Bearer iw_proj_your_key_here`.

## Windsurf

Windsurf stores MCP server configuration in `~/.codeium/windsurf/mcp_config.json` (or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` on Windows). For a remote HTTP server, use the `serverUrl` property:

```json
{
  "mcpServers": {
    "inkweld": {
      "type": "http",
      "serverUrl": "https://api.inkweld.app/api/v1/ai/mcp"
    }
  }
}
```

## VS Code

Add a server to `.vscode/mcp.json`:

```json
{
  "servers": {
    "inkweld": {
      "type": "http",
      "url": "https://api.inkweld.app/api/v1/ai/mcp"
    }
  }
}
```

## Continue

Add the server to your Continue `mcpServers` configuration (e.g. `~/.continue/config.json` or `config.yaml`):

```yaml
mcpServers:
  - name: inkweld
    type: streamable-http
    url: https://api.inkweld.app/api/v1/ai/mcp
```

## Generic Streamable HTTP client

Any MCP client that supports Streamable HTTP (protocol `2026-07-28`) can connect with the endpoint URL and the OAuth flow. Stateless clients should call `server/discover` first to learn the supported protocol versions and capabilities.

## Troubleshooting

- **"Protected resource does not match"**: the endpoint URL you entered differs from the one advertised by the server's OAuth metadata. Use the exact URL shown in **Project Settings → MCP Access**.
- **OAuth sign-in loop**: make sure your browser can reach the server's authorization page and that you're not blocking third-party cookies on the domain.
- **Legacy keys not visible**: the "Legacy API Keys" section only appears when an administrator has enabled **Legacy MCP API Keys** in Admin Settings.
- **Connection refused / 404**: confirm the server is running and that the path is exactly `/api/v1/ai/mcp`.
