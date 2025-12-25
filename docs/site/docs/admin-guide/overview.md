---
title: Admin Guide
description: Server administration and configuration for Inkweld
sidebar_position: 1
---

# Admin Guide

This guide covers server administration for Inkweld, including user management, system settings, and AI feature configuration.

## Accessing the Admin Panel

The admin panel is available at `/admin` and is only accessible to users with administrator privileges.

To access the admin panel:

1. Log in with an admin account
2. Click the user menu (avatar) in the top-right corner
3. Select **Admin** from the dropdown menu

## Admin Sections

### Users

Manage user accounts, including:

- View all registered users
- Approve pending user registrations (when user approval is required)
- Promote users to admin status
- Disable or delete accounts

### Settings

Configure system-wide settings:

- **User Approval Required**: When enabled, new user registrations require admin approval
- **AI Kill Switch**: Master control to disable all AI features

### AI Image Generation

Configure AI providers for image generation:

- OpenAI (DALL-E)
- OpenRouter (FLUX, Stable Diffusion 3)
- Stable Diffusion (self-hosted)
- Fal.ai

See [AI Image Generation](/docs/hosting/ai-image-generation) for detailed provider configuration.

## Quick Links

- [AI Kill Switch](./ai-kill-switch) - Control AI feature availability
- [Docker Deployment](/docs/hosting/docker) - Deploy Inkweld with Docker
- [Admin CLI](/docs/hosting/admin-cli) - Command-line administration
