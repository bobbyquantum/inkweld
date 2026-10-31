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

| Level             | Can do                          |
| ----------------- | ------------------------------- |
| **View only**     | Read project content            |
| **View and edit** | Read and write project content  |
| **Full access**   | Same tools as **View and edit** |

**Full access** does not unlock any extra tools. Through MCP it behaves exactly like **View and edit**: the AI tool can read and change your project's content, but it cannot do anything else on the project's behalf.

What each level lets the connected tool do:

| Capability                                                                          | View only | View and edit / Full access |
| ----------------------------------------------------------------------------------- | :-------: | :-------------------------: |
| Read project details, the element tree, and document text                           |    Yes    |             Yes             |
| Search elements and worldbuilding data, and read relationships                      |    Yes    |             Yes             |
| Read the worldbuilding templates (schemas) the project uses                         |    Yes    |             Yes             |
| Read the media library, image profiles and publish plans                            |    Yes    |             Yes             |
| Read canvases (drawings, maps, mood boards)                                         |    Yes    |             Yes             |
| Create, rename, move, reorder, sort, tag and delete elements, and take snapshots    |    No     |             Yes             |
| Replace the whole element tree in one step                                          |    No     |             Yes             |
| Edit document text                                                                  |    No     |             Yes             |
| Edit worldbuilding fields and relationships, and apply images to worldbuilding data |    No     |             Yes             |
| Edit canvases, and upload images to the media library                               |    No     |             Yes             |

:::warning
With **View and edit** or **Full access**, a tool can replace every element in the project in a single call. Only grant edit access to tools you trust, and keep [snapshots](../writing/snapshots) or an [export](../organizing/import-export) of important work.
:::

:::note
MCP access can be switched off by your server administrator. If the administrator has turned on the AI kill switch, or has turned off MCP access in the admin settings, tools cannot connect to any project on that server. The kill switch always wins over the MCP setting.
:::

You can also grant the app **access to all your projects** (including future ones) at a single default level, instead of picking projects one by one.

After authorizing, the connection is listed in **User Settings → Authorized Apps**, where you can change a project's access level, toggle all-projects access, add or remove projects, or disconnect the app entirely.

Most tools accept a URL pointing at the Inkweld MCP endpoint. You can find your server's exact URL in **Project Settings → MCP** (the **MCP Access** page), or construct it as:

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

- **"MCP access is disabled by the AI kill switch" / "MCP access is disabled by the administrator"**: your server's administrator has turned off AI features or MCP access. Ask them to enable MCP access in the admin settings (and make sure the AI kill switch is off).
- **A tool can read but not change anything**: the project was shared with **View only**. Open **User Settings → Authorized Apps** and change the project to **View and edit**.
- **An app that was working asks you to authorize it again**: a password reset, a passkey recovery or an administrator disabling your account disconnects all your apps. Once you can sign in, authorize the app again.
- **OAuth sign-in loop**: make sure your browser can reach the server's authorization page and that you're not blocking third-party cookies on the domain.
- **Connection refused / 404**: confirm the server is running and that the path is exactly `/api/v1/ai/mcp`.
