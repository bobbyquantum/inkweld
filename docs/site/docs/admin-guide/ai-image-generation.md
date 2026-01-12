---
title: AI Image Generation Setup
description: Configure AI image generation providers for your instance.
sidebar_position: 5
---

# AI Image Generation Setup

AI image generation is an optional feature. When enabled, users can generate images for project covers, character portraits, and other visuals.

For how users interact with this feature, see the [User Guide: AI Image Generation](/user-guide/media/ai-generation).

## Supported Providers

| Provider | Requirements |
|----------|-------------|
| **OpenAI** | OpenAI API key |
| **OpenRouter** | OpenRouter API key |
| **Fal.ai** | Fal.ai API key |
| **Stable Diffusion** | Self-hosted AUTOMATIC1111 WebUI with `--api` flag |

## Configuration

Navigate to **Admin → AI Image Generation**.

### Global Toggle

**Enable Image Generation** controls whether the feature is available to users. When disabled, no generation buttons appear in the UI.

### Image Model Profiles

Profiles define which AI models users can choose from. Each profile wraps a provider + model combination.

To create a profile:

1. Click **Create Profile**
2. Select a provider
3. Select a model
4. Configure:
   - **Name** — What users see
   - **Supported Sizes** — Available dimensions
   - **Default Size** — Pre-selected option

### Provider Setup

Expand a provider card and add your API key to enable it.

| Provider | API Key Source |
|----------|---------------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Fal.ai | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |
| Stable Diffusion | Self-hosted — enter your WebUI endpoint URL |

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
```

:::note
Admin panel settings take precedence over environment variables.
:::

## Offline Mode

AI image generation requires a server connection and is not available in offline mode.

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
