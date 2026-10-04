---
title: AI Image Generation Setup
description: Configure AI image generation providers for your instance.
sidebar_position: 5
---

import ThemedImage from '@site/src/components/ThemedImage';

# AI Image Generation Setup

AI image generation is an optional feature. When enabled, users can generate images for project covers, character portraits, and other visuals.

For how users interact with this feature, see the [User Guide: AI Image Generation](/user-guide/media/ai-generation).

## Supported Providers

| Provider                  | Requirements                                      |
| ------------------------- | ------------------------------------------------- |
| **OpenAI**                | OpenAI API key                                    |
| **OpenRouter**            | OpenRouter API key                                |
| **Fal.ai**                | Fal.ai API key                                    |
| **Stable Diffusion**      | Self-hosted AUTOMATIC1111 WebUI with `--api` flag |
| **Cloudflare Workers AI** | Cloudflare Account ID + API Token                 |

## Configuration

Image generation is set up on two admin pages: **Admin → AI Providers** holds the API keys, and **Admin → AI Images** holds the on/off switch and the model profiles users pick from.

<ThemedImage
  src="/img/features/admin-ai-settings"
  alt="The AI Images admin page, with the Enable Image Generation switch above the Image Model Profiles list"
/>

### Global Toggle

**Enable Image Generation** controls whether the feature is available to users. When disabled, no generation buttons appear in the UI.

### Image Model Profiles

Profiles define which AI models users can choose from. Each profile wraps a provider + model combination. A profile card shows its provider and model, whether it accepts an input image, and its supported sizes; use the switch to hide a profile from users without deleting it, or the pencil and trash buttons to edit or delete it.

<ThemedImage
  src="/img/features/admin-ai-image-profiles"
  alt="Image model profile cards, each showing provider and model, image-input support, supported sizes, and an enable switch with edit and delete buttons"
/>

To create a profile:

1. Click **Create Profile**
2. Select a provider
3. Select a model
4. Configure:
   - **Name** — What users see
   - **Supported Sizes** — Available dimensions
   - **Default Size** — Pre-selected option

<ThemedImage
  src="/img/features/admin-ai-image-profile-dialog"
  alt="The Create Image Profile dialog with name, description, provider, capability switches and supported sizes"
/>

### Provider Setup

On **Admin → AI Providers**, expand a provider card and add your API key to enable it.

| Provider         | API Key Source                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OpenAI           | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)                                                          |
| OpenRouter       | [openrouter.ai/keys](https://openrouter.ai/keys)                                                                              |
| Fal.ai           | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)                                                                        |
| Stable Diffusion | Self-hosted — enter your WebUI endpoint URL                                                                                   |
| Workers AI       | [dash.cloudflare.com](https://dash.cloudflare.com) — Account ID + [API Token](https://dash.cloudflare.com/profile/api-tokens) |

## Environment Variables

Providers can be configured via environment variables:

```bash
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

# Cloudflare Workers AI
AI_IMAGE_WORKERSAI_ENABLED=true
WORKERSAI_ACCOUNT_ID=your-cloudflare-account-id
WORKERSAI_API_TOKEN=your-workers-ai-api-token
```

:::note
Admin panel settings take precedence over environment variables.
:::

## Local Mode

AI image generation requires a server connection and is not available in local mode.

## Cost Considerations

Costs vary by provider. Check your provider's pricing. Self-hosted Stable Diffusion has no per-image cost.

## Troubleshooting

- **Provider not available**: Verify API key is correct and has credits
- **Generation failures**: Content policy violation, rate limits, or network issues
- **Stable Diffusion not connecting**: Ensure WebUI is running with `--api` flag

API keys are stored encrypted and never displayed after saving.

## Related

- [User Guide: AI Image Generation](/user-guide/media/ai-generation) — How users interact with this feature
- [AI Kill Switch](./ai-kill-switch) — Emergency disable for AI features
