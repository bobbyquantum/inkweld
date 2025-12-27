---
title: AI Image Generation
description: Configure AI-powered image generation with OpenAI, OpenRouter, Fal.ai, or Stable Diffusion.
sidebar_position: 5
---

# AI Image Generation

Inkweld supports AI-powered image generation through multiple providers. This guide explains how to configure each provider and use the image generation features.

## Overview

The AI image generation system allows users to generate images directly within their projects. Generated images can be used as cover art, character portraits, location illustrations, or any other visual content.

### Supported Providers

| Provider             | Models                                               | Requirements                    |
| -------------------- | ---------------------------------------------------- | ------------------------------- |
| **OpenAI**           | GPT Image 1, GPT Image 1 Mini, GPT Image 1.5         | OpenAI API key                  |
| **OpenRouter**       | FLUX, Stable Diffusion 3, and more                   | OpenRouter API key              |
| **Fal.ai**           | FLUX 2 Pro, GPT Image 1.5, Nano Banana, and more     | Fal.ai API key                  |
| **Stable Diffusion** | Local models                                         | Self-hosted AUTOMATIC1111 WebUI |

## Admin Configuration

Navigate to **Admin → AI Image Generation** to configure providers and create image model profiles.

![Admin AI Settings](/img/features/admin-ai-settings-light.png)

### Global Settings

**Enable Image Generation**: Master toggle to enable/disable AI image generation for all users.

### Image Model Profiles

Image Model Profiles are the primary way to configure which AI models are available to users. Each profile:

- Wraps a specific provider and model combination
- Has a user-friendly name (e.g., "Fast Draft", "High Quality Portrait")
- Can be enabled/disabled independently
- Supports pre-configured settings like sizes and model parameters

![Image Model Profiles](/img/features/admin-ai-image-profiles-light.png)

#### Creating a Profile

1. Click **Create Profile** in the Image Model Profiles section
2. Choose a provider (OpenAI, OpenRouter, Fal.ai, or Stable Diffusion)
3. Select a model from the available options
4. Configure profile settings:
   - **Name**: Display name shown to users
   - **Description**: Optional help text
   - **Supports Image Input**: Enable for image-to-image models
   - **Supported Sizes**: Available dimensions for this profile
   - **Default Size**: Pre-selected size option
   - **Model Config**: Advanced JSON configuration for provider-specific parameters

![Profile Creation Dialog](/img/features/admin-ai-image-profile-dialog-light.png)

:::tip Best Practice
Create multiple profiles for different use cases. For example:
- "Quick Sketch" using a fast model for drafts
- "Portrait HD" using a high-quality model for character art
- "Landscape Wide" with widescreen dimensions for location images
:::

### Provider Setup

Before creating profiles, configure API keys for each provider you want to use.

#### OpenAI (GPT Image)

OpenAI's GPT Image models offer high-quality image generation with excellent prompt understanding.

1. Expand the OpenAI provider card
2. Enable the provider toggle
3. Add your OpenAI API key
4. Available models:
   - **GPT Image 1**: High-quality image generation
   - **GPT Image 1 Mini**: Faster, cost-effective generation
   - **GPT Image 1.5**: Latest model with enhanced capabilities

:::tip API Key
Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
:::

#### OpenRouter

OpenRouter provides unified access to multiple image generation models through a single API.

1. Expand the OpenRouter provider card
2. Enable the provider toggle
3. Add your OpenRouter API key
4. Available models include:
   - **FLUX Schnell**: Fast, high-quality generation
   - **FLUX Pro**: Premium quality
   - **Stable Diffusion 3**: Photorealistic results

:::tip API Key
Get your API key from [OpenRouter](https://openrouter.ai/keys)
:::

#### Fal.ai

Fal.ai provides access to cutting-edge image generation models with fast inference.

1. Expand the Fal.ai provider card
2. Enable the provider toggle
3. Add your Fal.ai API key
4. When creating a profile, select from:
   - **Text to Image** models (FLUX 2 Pro, GPT Image 1.5, Nano Banana, etc.)
   - **Image to Image** models (for style transfer and modification)

:::tip API Key
Get your API key from [Fal.ai Dashboard](https://fal.ai/dashboard/keys)
:::

#### Stable Diffusion (Self-Hosted)

For maximum control and privacy, you can connect to a self-hosted AUTOMATIC1111 WebUI instance.

1. Expand the Stable Diffusion provider card
2. Enable the provider toggle
3. Enter your WebUI endpoint URL (e.g., `http://localhost:7860`)
4. Add an API key if your WebUI requires authentication

:::note Self-Hosting
Stable Diffusion requires running the [AUTOMATIC1111 WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) with the `--api` flag.
:::

## Environment Variables

Providers can also be configured via environment variables:

```bash
# Global settings
AI_IMAGE_ENABLED=true

# OpenAI
AI_IMAGE_OPENAI_ENABLED=true
OPENAI_API_KEY=sk-...

# OpenRouter
AI_IMAGE_OPENROUTER_ENABLED=true
AI_IMAGE_OPENROUTER_API_KEY=sk-or-...

# Fal.ai
AI_FALAI_ENABLED=true
AI_FALAI_API_KEY=fal-...

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
2. Select an image profile (configured by the admin)
3. Enter a prompt describing the desired image
4. Configure options (size, count)
5. Click **Generate**

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

| Provider    | Model            | Approximate Cost       |
| ----------- | ---------------- | ---------------------- |
| OpenAI      | GPT Image 1      | ~$0.040/image          |
| OpenAI      | GPT Image 1 Mini | ~$0.020/image          |
| OpenAI      | GPT Image 1.5    | ~$0.040/image          |
| OpenRouter  | FLUX Schnell     | ~$0.003/image          |
| OpenRouter  | SD3              | ~$0.035/image          |
| Fal.ai      | FLUX 2 Pro       | ~$0.05/image           |
| Fal.ai      | Nano Banana Pro  | ~$0.01/image           |
| Self-hosted | Any              | Electricity + Hardware |

:::tip Cost Control
Use fast models like GPT Image 1 Mini, FLUX Schnell, or Nano Banana Pro for drafts, then upgrade to higher-quality models for final images.
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
