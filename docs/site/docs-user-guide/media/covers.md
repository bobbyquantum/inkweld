---
id: covers
title: Project Covers
description: Add a cover image to your project.
sidebar_position: 2
---

# Project Covers

Each project can have a cover image that appears on the dashboard and in EPUB exports.

## Setting a Cover

Open your project and click the **Edit** button (pencil icon) in the header. The dialog shows your current cover or a placeholder.

### Adding a Cover

Two options are always available:

- **Upload Image** — Select a file from your device
- **Select from Library** — Choose from your media library

If your administrator has enabled AI features, a third option appears:

- **Generate with AI** — Create a cover using AI image generation

:::note
AI image generation is an optional feature. If you don't see the "Generate with AI" option, your administrator has not enabled it for this instance.
:::

After selecting an image, a cropper appears to adjust it to the correct aspect ratio (1:1.6, optimized for 1600×2560px). Click **Crop & Save** to apply.

### Designing the Cover on a Canvas

A cover can be a [canvas](../worldbuilding/canvas#frame-as-project-cover) element instead of an uploaded image. Choose **Design on Canvas** in the edit dialog (or **New element → Cover** in the project tree) to create a canvas with a cover-size frame that is linked as the project's **live cover**. Whatever you arrange inside the frame — images from your media library, text, shapes, drawings — is rendered to the cover image automatically a few seconds after you stop editing, so the dashboard, the sidebar, other devices and every export always show the current design.

The edit dialog shows a **Live cover** card while a canvas is linked, with **Open canvas**, **Update now** and **Unlink**. Uploading, picking or generating an image while a live cover is linked unlinks it (you'll be asked first); the canvas itself is kept.

Any existing canvas frame can become the live cover from its **⋮** menu → **Use as live cover…**. For a one-off render that doesn't stay linked, use **Set as project cover…** instead.

### Removing a Cover

Click the delete button on the cover image in the edit dialog. The project will show a placeholder with its title instead.

## Covers in Exports

Your project cover is embedded as the book cover when exporting to **EPUB** format. Other export formats (PDF, HTML, Markdown) do not currently include the cover.

## Worldbuilding Images

Characters, locations, and other worldbuilding elements can also have images via their identity panel. See [AI Image Generation](./ai-generation) for details on generating these (if enabled).

---

**Next:** [AI Image Generation](./ai-generation) — Create images with AI (requires admin to enable).
