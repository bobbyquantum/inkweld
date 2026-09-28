---
sidebar_position: 2
title: Connecting AI Tools (MCP)
description: Add Inkweld to your favourite AI assistant or harness with copy-paste commands using the Model Context Protocol.
---

# Connecting AI Tools (MCP)

Inkweld exposes your projects to AI assistants through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). The recommended way to connect is **OAuth** — on first use the tool opens your browser to sign in and pick which projects to share, so no API key is needed.

## What to expect

When you connect a tool for the first time, the tool opens a browser window to Inkweld's **authorization page** (GitHub-style). You'll see the tool's name and logo, then pick which projects to share and the access level for each.

You choose an access level per project:

| Level             | Can do                         |
| ----------------- | ------------------------------ |
| **View only**     | Read project content           |
| **View and edit** | Read and write project content |
| **Full access**   | Everything on the project      |

You can also grant the app **access to all your projects** (including future ones) at a single default level, instead of picking projects one by one.

After authorizing, the connection is listed in **User Settings → Authorized Apps**, where you can change a project's access level, toggle all-projects access, add or remove projects, or disconnect the app entirely.

Most tools accept a URL pointing at the Inkweld MCP endpoint. You can find your server's exact URL in **Project Settings → MCP Access**, or construct it as:

```text
https://<your-server>/api/v1/ai/mcp
```

Replace `<your-server>` with your deployment host (e.g. `api.inkweld.app` or `api.preview.inkweld.app` for a preview instance).

## Hermes

[Hermes](https://github.com/NousResearch/hermes-agent) (v0.20.0, v2026.8.3) connects via its `mcp` command with an OAuth flow:

```bash
hermes mcp add inkweld --url https://api.inkweld.app/api/v1/ai/mcp --auth oauth
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

## Claude Desktop

Claude Desktop connects to remote MCP servers through **Settings → Connectors → Add connector**. Choose the **Remote MCP server** option and enter the Inkweld MCP endpoint URL:

```text
https://api.inkweld.app/api/v1/ai/mcp
```

On first use, Claude Desktop opens your browser to sign in with OAuth and pick which projects to share.

## Cursor

In Cursor, open **Settings → MCP → Add new MCP server** and choose **HTTP**:

- **Name**: `inkweld`
- **URL**: `https://api.inkweld.app/api/v1/ai/mcp`
- **Type**: `http` (Streamable HTTP)

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

Add the server to your Continue `mcpServers` configuration (e.g. `config.yaml` in your Continue config directory, or a file under `.continue/mcpServers/`):

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
- **Connection refused / 404**: confirm the server is running and that the path is exactly `/api/v1/ai/mcp`.
