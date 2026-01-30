---
id: project-settings
title: Project Settings
description: Configure project title, description, and cover image.
sidebar_position: 2
---

import ThemedImage from '@site/src/components/ThemedImage';

# Project Settings

Project settings let you update your project's metadata and cover image. Access them from the project menu.

## Opening Project Settings

1. Open your project
2. Click the **three-dot menu** (⋮) in the project header
3. Select **Edit Project**

## Project Details

### Title

The display name of your project, shown on the dashboard and in exports.

### Description

An optional summary of your project. Helps identify the project on the dashboard.

## Cover Image

Set a visual cover for your project. The cover appears on the dashboard and can be used in exports.

### Upload an Image

1. Click **Upload Image**
2. Select an image file from your device
3. Crop the image to fit the cover dimensions
4. Save your changes

### Select from Library

Choose an existing image from your project's media library:
1. Click **Select from Library**
2. Pick an image from the media library dialog
3. The selected image becomes your project cover

### Generate with AI

If AI image generation is enabled on your server:
1. Click **Generate with AI**
2. Follow the prompts to create a cover
3. The generated image becomes your project cover

See [AI Image Generation](/user-guide/media/ai-generation) for details.

### Remove Cover

Click the remove button (×) on the cover image to remove it.

## Renaming a Project (Changing the URL)

You can change your project's URL slug (the part that appears in the browser address bar). This is useful if you want to give your project a new, more descriptive URL.

:::warning
Changing the project URL has important consequences:
- **Existing bookmarks and links will break** — anyone who saved a link to the old URL will need the new one
- **Collaborators with offline copies will need to re-sync** — their local data will be migrated to the new project URL
- The old URL will temporarily redirect to the new one, but this is not permanent
:::

### To Rename Your Project

1. Open your project and go to **Settings**
2. Click the **Danger Zone** tab
3. Find the **Rename Project URL** card and click the **Rename Project** button

<ThemedImage
  src="/img/features/project-rename-card"
  alt="Rename project card in the Danger Zone"
/>

4. Enter the new slug (lowercase letters, numbers, and hyphens only)
5. Click **Rename Project** to confirm

<ThemedImage
  src="/img/features/project-rename-form"
  alt="Rename form with new slug entered"
/>

After renaming, you'll be automatically redirected to the new project URL. All your documents, worldbuilding elements, and media will be preserved.

### What Gets Migrated

When you rename a project:
- ✅ All documents and their content
- ✅ All worldbuilding elements and relationships  
- ✅ All media files (images, covers)
- ✅ All publish plans and exported files
- ✅ All snapshots and version history
- ✅ MCP keys (re-keyed to new project path)
- ✅ Collaborator access and permissions

## Deleting a Project

:::danger
Deleting a project permanently removes all content. This cannot be undone.
:::

The Delete Project option is located in the Danger Zone tab:

<ThemedImage
  src="/img/features/project-delete-card"
  alt="Delete Project card in the Danger Zone"
/>

1. Open your project and go to **Settings**
2. Click the **Danger Zone** tab
3. Find the **Delete Project** card
4. Click **Delete Project**
5. Type the project name to confirm
6. Click **Delete Permanently**

---

You've completed the Inkweld User Guide! For additional help:
- Visit the main [Documentation](/docs/intro)
- Check [Troubleshooting](/docs/troubleshooting/logging)
