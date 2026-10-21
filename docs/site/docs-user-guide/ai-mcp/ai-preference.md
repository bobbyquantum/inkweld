---
id: ai-preference
sidebar_position: 1
title: No AI or Allow AI
description: Choose whether Inkweld shows any AI features, and let an AI assistant built into your browser work with your projects through WebMCP.
---

# No AI or Allow AI

AI in Inkweld is off until you turn it on. Every browser you use Inkweld in has its own **No AI / Allow AI** choice, and it starts on **No AI**.

## Where to choose

- **Settings → General → AI**, at any time.
- On the setup page, in the lower-left corner, before you create a profile.

The **?** next to the choice explains what Allow AI turns on and tells you whether your browser offers WebMCP.

The choice is saved in this browser and applies to every profile in it (Browser, Cloud Sync and Inkweld Server). It is not saved to your account, so a different browser or device starts on No AI again.

## What each option does

**No AI** (the default) hides every AI feature, even on a server where the administrator has turned AI on. Inkweld sends nothing to an AI provider and offers nothing to a browser assistant.

**Allow AI** turns on the AI features available to you:

- **On an Inkweld Server:** image generation, the AI linter and Auto-Review, and MCP access for other AI apps ([Connecting AI Tools](./mcp-clients.md)), but only those the server's administrator has enabled. They send the text or prompts you choose to the AI provider the administrator set up.
- **In your browser:** WebMCP, described below.

Allow AI never overrides the administrator: when a server has AI turned off for everyone, it stays off.

## WebMCP: AI assistants in your browser

[WebMCP](https://webmachinelearning.github.io/webmcp/) is a new browser feature that lets a web page offer tools to an AI assistant built into the browser, or added by an extension. With **Allow AI** on, Inkweld offers tools for what you can do in the app yourself: open and create projects, read and edit documents, fill in worldbuilding, add relationships and tags, take and restore snapshots, and publish.

- The assistant works in the open Inkweld tab, with your own access. It can change only projects you can edit.
- It works with every kind of profile, including Browser and Cloud Sync, because nothing goes through an Inkweld server.
- Inkweld sends nothing to an AI provider for this. Your browser's assistant decides where the text it reads goes, so check its own privacy terms.
- Switching back to **No AI** removes the tools straight away.

WebMCP is still experimental. In Chrome it has to be turned on with the WebMCP flag in `chrome://flags`, followed by a relaunch. If your browser doesn't offer it, the **?** dialog says so and Allow AI only affects server features.

Once it is on, ask the assistant something like "outline three chapters in my open project" or "list the characters in this project and their factions".

Developers can find the full list of tools in the [WebMCP developer guide](/docs/developer/webmcp).
