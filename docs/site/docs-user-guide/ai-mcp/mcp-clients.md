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
:::

## Hermes

[Hermes](https://github.com/anomalyco/hermes) connects via its `mcp` command with an OAuth flow:

```bash
hermes mcp add inkweld --url https://api.inkweld.app/api/v1/ai/mcp --auth oauth
```

To use a legacy API key instead:

```bash
hermes mcp add inkweld --url https://api.inkweld.app/api/v1/ai/mcp --auth bearer
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

For a legacy API key, add an `Authorization` header:

```json
{
  "mcpServers": {
    "inkweld": {
      "type": "http",
      "url": "https://api.inkweld.app/api/v1/ai/mcp",
      "headers": {
        "Authorization": "Bearer iw_proj_your_key_here"
      }
    }
  }
}
```

## Claude Desktop

Claude Desktop uses a local MCP gateway. Configure it in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inkweld": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "connect",
        "https://api.inkweld.app/api/v1/ai/mcp"
      ]
    }
  }
}
```

## Cursor

In Cursor, open **Settings → MCP → Add new MCP server** and choose **HTTP**:

- **Name**: `inkweld`
- **URL**: `https://api.inkweld.app/api/v1/ai/mcp`
- **Type**: `http` (Streamable HTTP)

For a legacy API key, set the **Authorization** header to `Bearer iw_proj_your_key_here`.

## Windsurf

Windsurf uses a `.mcp.json` file in your project root:

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

## VS Code (Copilot / Continue)

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

## Generic Streamable HTTP client

Any MCP client that supports Streamable HTTP (protocol `2026-07-28`) can connect with the endpoint URL and the OAuth flow. Stateless clients should call `server/discover` first to learn the supported protocol versions and capabilities.

## Troubleshooting

- **"Protected resource does not match"**: the endpoint URL you entered differs from the one advertised by the server's OAuth metadata. Use the exact URL shown in **Project Settings → MCP Access**.
- **OAuth sign-in loop**: make sure your browser can reach the server's authorization page and that you're not blocking third-party cookies on the domain.
- **Legacy keys not visible**: the "Legacy API Keys" section only appears when an administrator has enabled **Legacy MCP API Keys** in Admin Settings.
- **Connection refused / 404**: confirm the server is running and that the path is exactly `/api/v1/ai/mcp`.
