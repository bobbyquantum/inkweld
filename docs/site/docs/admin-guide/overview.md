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
- **Privacy Policy & Terms**: Publish your instance's legal documents. Paste the
  text (Markdown) to host it at `/privacy` and `/terms`, or give a URL for those
  pages to redirect to. Once set, they are linked from the landing page, the
  sign-in and registration dialogs, and the other pages people see before
  signing in. Turn on **Require acceptance** to make new users tick "I agree"
  when registering; everyone is asked again whenever you change the text or a
  URL, and anyone who declines is signed out. Same settings as environment
  variables: `PRIVACY_POLICY_CONTENT`, `PRIVACY_POLICY_URL`,
  `TERMS_OF_SERVICE_CONTENT`, `TERMS_OF_SERVICE_URL`,
  `REQUIRE_POLICY_ACCEPTANCE`.

### Appearance

Customise the full-screen backgrounds behind the login page and home screen, and
choose whether users may personalise their own. See
[Appearance](./appearance.md).

### AI Image Generation

Configure AI providers for image generation:

- OpenAI (GPT Image)
- OpenRouter (FLUX, Stable Diffusion 3)
- Stable Diffusion (self-hosted)
- Fal.ai

See [AI Image Generation](./ai-image-generation) for detailed provider configuration.

## Quick Links

- [AI Kill Switch](./ai-kill-switch) - Control AI feature availability
- [Docker Deployment](/docs/installation/docker) - Deploy Inkweld with Docker
- [Configuration](/docs/configuration) - Environment variables and customization
