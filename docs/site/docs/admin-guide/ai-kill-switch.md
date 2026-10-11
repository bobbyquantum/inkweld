---
title: AI Kill Switch
description: Master control to disable all AI features in Inkweld
sidebar_position: 2
---

import ThemedImage from '@site/src/components/ThemedImage';

# AI Kill Switch

The AI Kill Switch is the master control for AI features on an Inkweld instance. It is **on by default**, which means AI is off until an administrator turns it off on purpose.

## Overview

When the kill switch is **on** (the default):

- AI image generation buttons are hidden from the UI
- The AI linting plugin and Auto-Review are not offered in the editor
- The MCP endpoint (`/api/v1/ai/mcp`) rejects requests with 403, and the project MCP settings are hidden
- The **AI Providers**, **AI Images**, **AI Text** and **Image Audits** pages disappear from the admin sidebar

When the kill switch is **off**, features still only appear when they are configured:

- Image generation needs **Enable Image Generation** and at least one working provider
- AI linting and Auto-Review need **Enable Text Generation** (Admin → AI Text) and an API key for the **default text provider**
- MCP additionally needs the **MCP Access** setting, which is on by default

## What the server enforces

The kill switch is enforced in different places, and it is worth knowing which:

| Feature                             | Hidden in the UI when on | Refused by the server when on                                       |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| AI linting                          | Yes                      | Yes (`/api/v1/ai/lint` reports AI as disabled and refuses requests) |
| Auto-Review                         | Yes                      | Yes (the review endpoint returns 503)                               |
| MCP access                          | Yes                      | Yes (403 on the MCP endpoint)                                       |
| AI image generation                 | Yes                      | **No.** See the note below                                          |
| Image prompt optimization (AI text) | Yes                      | **No.** It checks only that text generation is enabled              |

:::warning[Image generation is not blocked server-side by the kill switch]
The kill switch hides image generation from the interface (the server reports the feature as unavailable to the web app), but the image and prompt-optimization API routes do not check the kill switch themselves. They check **Enable Image Generation** (`AI_IMAGE_ENABLED`) and whether a provider is configured. If you need a hard guarantee that no data reaches an image provider, also turn off **Enable Image Generation** on **Admin → AI Images**, or remove the provider keys. Setting `AI_KILL_SWITCH=true` alone is not enough for that purpose.
:::

## Why Use the Kill Switch?

1. **Data Privacy**: with the switch on, the editor and admin UI offer no AI features, so users cannot send content to external providers through them
2. **Cost Control**: prevents unexpected API usage charges
3. **Compliance**: keeps third-party AI processing out of regulated deployments
4. **Default Safety**: ships on by default to protect users who haven't explicitly opted in

## Configuration

### Via Admin Panel

1. Navigate to **Admin → Settings**
2. Find the **AI Kill Switch** toggle
3. Toggle to enable/disable AI features

When **disabling** the kill switch (enabling AI), a confirmation dialog will appear warning about potential data sharing with third-party AI providers.

<ThemedImage
  src="/img/features/admin-kill-switch-settings"
  alt="AI Kill Switch Settings in Admin Panel"
/>

### Via Environment Variable

Set the `AI_KILL_SWITCH` environment variable to control AI availability:

```bash
# Disable all AI features (default if not set)
AI_KILL_SWITCH=true

# Enable AI features (allows AI to work if providers are configured)
AI_KILL_SWITCH=false
```

:::warning[Environment Variable Lock]
When `AI_KILL_SWITCH` is set as an environment variable, the toggle in the Admin Panel will be disabled (grayed out). This prevents accidental changes through the UI when the server is configured to always have AI disabled.
:::

### Docker Compose Example

```yaml
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    environment:
      # Disable AI features entirely
      - AI_KILL_SWITCH=true
```

### Configuration Priority

The kill switch is the one setting where the environment variable wins. Every other setting follows admin value, then environment variable, then default.

1. **Environment variable** (highest priority): if `AI_KILL_SWITCH` is set at all, the admin toggle is locked and the environment value is used. Only the exact value `false` turns the switch off; any other value (including `0` or an empty string) leaves it on.
2. **Database setting**: configured on **Admin → Settings → AI Kill Switch** when no environment variable is set.
3. **Default**: on (AI disabled) if neither is configured.

## Affected Features

### AI Image Generation

When the kill switch is on:

- The "Generate with AI" buttons are hidden from the Media tab toolbar, the project cover editor and the worldbuilding image dialogs
- **AI Providers**, **AI Images**, **AI Text** and **Image Audits** are removed from the admin sidebar, and the AI admin pages show a warning banner if opened directly
- The server does not itself reject direct API calls to image generation (see the warning above)

### AI Linting and Auto-Review

When the kill switch is on, the AI linting plugin and Auto-Review are not offered in the document editor, and the lint and Auto-Review endpoints refuse requests. When it is off, they are available only if text generation is enabled and the default text provider has a key. That provider is chosen under **Admin → AI Text → Default Provider** (`AI_TEXT_DEFAULT_PROVIDER`: OpenAI-compatible, OpenRouter or Anthropic), so an OpenAI key is not required if you use another provider.

### MCP

MCP access for external tools is disabled while the kill switch is on, whatever the **MCP Access** setting says.

## Local Mode

When Inkweld is running in **local mode** (no sync server connection), the AI kill switch is automatically enabled. This is because:

1. AI features require server communication
2. Local-only mode shouldn't send data to external services

## Self-Hosted AI Providers

Even with the kill switch disabled, you can maintain data privacy by using self-hosted AI providers:

- **Stable Diffusion** with AUTOMATIC1111 WebUI for image generation
- **Local LLM** endpoints for AI linting and Auto-Review: the **OpenAI Compatible** provider accepts a custom endpoint (`OPENAI_API_BASE`, or the endpoint field on **Admin → AI Providers**), so servers such as Ollama or LM Studio work

When using self-hosted providers, your data stays within your infrastructure.

## Best Practices

1. **Start with Kill Switch Enabled**: Deploy with the kill switch on, then enable AI features after configuring providers
2. **Use Environment Variables for Production**: Lock the setting via environment variable for consistent behavior
3. **Communicate with Users**: If you enable AI features, inform users about potential third-party data sharing
4. **Consider Self-Hosting**: For maximum privacy, use self-hosted AI providers

## See Also

- [AI Image Generation](/docs/admin-guide/ai-image-generation) - Configure image generation providers
- [Docker Deployment](/docs/installation/docker) - Environment variable configuration
- [Admin Panel](/docs/admin-guide/overview) - Web-based administration
