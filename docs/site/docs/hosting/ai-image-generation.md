---
title: AI Image Generation
description: Configure AI-powered image generation with OpenAI, OpenRouter, or Stable Diffusion.
sidebar_position: 5
---

# AI Image Generation

Inkweld supports AI-powered image generation through multiple providers. This guide explains how to configure each provider and use the image generation features.

## Overview

The AI image generation system allows users to generate images directly within their projects. Generated images can be used as cover art, character portraits, location illustrations, or any other visual content.

### Supported Providers

| Provider             | Models                             | Requirements                    |
| -------------------- | ---------------------------------- | ------------------------------- |
| **OpenAI**           | DALL-E 2, DALL-E 3                 | OpenAI API key                  |
| **OpenRouter**       | FLUX, Stable Diffusion 3, and more | OpenRouter API key              |
| **Stable Diffusion** | Local models                       | Self-hosted AUTOMATIC1111 WebUI |

## Admin Configuration

Navigate to **Admin → AI Image Generation** to configure providers.

![Admin AI Settings](/img/features/admin-ai-settings-light.png)

### Global Settings

1. **Enable Image Generation**: Master toggle to enable/disable AI image generation for all users
2. **Default Provider**: The provider used when users don't specify one

### Provider Setup

#### OpenAI (DALL-E)

OpenAI's DALL-E models offer high-quality image generation with excellent prompt understanding.

1. Enable the OpenAI provider toggle
2. Add your OpenAI API key
3. Available models:
   - **DALL-E 3**: Highest quality, better prompt adherence
   - **DALL-E 2**: Faster generation, lower cost

:::tip API Key
Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
:::

#### OpenRouter

OpenRouter provides unified access to multiple image generation models through a single API.

1. Enable the OpenRouter provider toggle
2. Add your OpenRouter API key
3. Available models include:
   - **FLUX Schnell**: Fast, high-quality generation
   - **Stable Diffusion 3**: Photorealistic results
   - **FLUX Pro**: Premium quality

:::tip API Key
Get your API key from [OpenRouter](https://openrouter.ai/keys)
:::

#### Stable Diffusion (Self-Hosted)

For maximum control and privacy, you can connect to a self-hosted AUTOMATIC1111 WebUI instance.

1. Enable the Stable Diffusion provider toggle
2. Enter your WebUI endpoint URL (e.g., `http://localhost:7860`)
3. Add an API key if your WebUI requires authentication

:::note Self-Hosting
Stable Diffusion requires running the [AUTOMATIC1111 WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) with the `--api` flag.
:::

## Environment Variables

Providers can also be configured via environment variables:

```bash
# Global settings
AI_IMAGE_ENABLED=true
AI_IMAGE_DEFAULT_PROVIDER=openai

# OpenAI
AI_IMAGE_OPENAI_ENABLED=true
OPENAI_API_KEY=sk-...

# OpenRouter
AI_IMAGE_OPENROUTER_ENABLED=true
AI_IMAGE_OPENROUTER_API_KEY=sk-or-...

# Stable Diffusion
AI_IMAGE_SD_ENABLED=true
AI_IMAGE_SD_ENDPOINT=http://localhost:7860
AI_IMAGE_SD_API_KEY=optional-auth-key
```

:::info Priority
Database configuration takes precedence over environment variables. If a value is set in the Admin panel, the environment variable is ignored.
:::

## User Features

### Generating Images

Users can generate images from the **Media** tab in any project:

1. Click **Generate Image** in the media tab header
2. Select a provider (if multiple are enabled)
3. Choose a model
4. Enter a prompt describing the desired image
5. Configure options (size, quality, count)
6. Click **Generate**

![Image Generation Dialog](/img/features/image-generation-dialog-light.png)

### Worldbuilding Context

One of Inkweld's unique features is the ability to include worldbuilding elements as context for image generation:

1. Expand the **Worldbuilding Elements** panel
2. Select characters, locations, or other elements
3. Assign a role to each element:
   - **Subject**: Main focus of the image
   - **Setting**: Background or environment
   - **Style**: Artistic style reference
   - **Reference**: Additional context

The element's data is sent to the AI provider to help generate more accurate images that match your worldbuilding.

### Saving Generated Images

After generation, users can:

- Preview multiple generated images
- Select the preferred result
- Save directly to the project's media library
- Use as cover image or insert into documents

## Offline Mode

:::warning Offline Limitation
AI image generation requires a server connection and is not available in offline mode. The "Generate Image" button will not appear when running in offline mode.
:::

## Cost Considerations

Image generation costs vary by provider and model:

| Provider    | Model        | Approximate Cost       |
| ----------- | ------------ | ---------------------- |
| OpenAI      | DALL-E 3 HD  | ~$0.080/image          |
| OpenAI      | DALL-E 3     | ~$0.040/image          |
| OpenAI      | DALL-E 2     | ~$0.020/image          |
| OpenRouter  | FLUX Schnell | ~$0.003/image          |
| OpenRouter  | SD3          | ~$0.035/image          |
| Self-hosted | Any          | Electricity + Hardware |

:::tip Cost Control
Use DALL-E 2 or FLUX Schnell for drafts, then upgrade to higher-quality models for final images.
:::

## Troubleshooting

### Provider Not Available

If a provider shows as "not available":

- Verify the API key is entered correctly
- Check that the key has sufficient credits/quota
- For Stable Diffusion, ensure the WebUI is running and accessible

### Generation Failures

Common causes of generation failures:

- **Content policy violations**: The prompt may contain prohibited content
- **Rate limits**: Too many requests in a short time
- **Network issues**: Connection to provider API failed

### API Key Security

API keys are stored encrypted in the database. They are never exposed in the UI after being saved (displayed as `********`).

## Related

- [Admin CLI Reference](./admin-cli.md) - Manage configuration via command line
- [Docker Deployment](./docker.md) - Container configuration including environment variables
- [Features Overview](/docs/features) - Full feature list
