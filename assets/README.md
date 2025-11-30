# Assets Directory

This directory contains static assets for the Inkweld project.

## Directory Structure

- **demo_covers/** - Sample book cover images used for demo screenshots

## Generating Screenshots

Screenshots are generated using Playwright e2e tests and are saved directly to `docs/site/static/img/` for use in the Docusaurus documentation site. Screenshots are **not run by default** to keep regular test runs fast.

To generate/update screenshots:

```bash
cd frontend
npm run screenshots
```

Or manually with environment variable:

```bash
cd frontend
GENERATE_SCREENSHOTS=true npm run e2e
```

On Windows PowerShell:

```powershell
cd frontend
npm run screenshots
```

Or manually:

```powershell
cd frontend
$env:GENERATE_SCREENSHOTS="true"; npm run e2e
```

### Generated Screenshots

The following screenshots are created in `docs/site/static/img/` and **committed to the repository** for use in Docusaurus documentation:

- `bookshelf-desktop.png` / `bookshelf-desktop-dark.png` - Desktop bookshelf views
- `bookshelf-mobile.png` / `bookshelf-mobile-dark.png` - Mobile bookshelf views  
- `editor-desktop.png` / `editor-desktop-dark.png` - Desktop editor views
- `editor-mobile.png` / `editor-mobile-dark.png` - Mobile editor views

## Demo Covers

The `demo_covers/` directory contains sample book cover images that are displayed in screenshot tests:

- `worldbuilding_cover_1.png` - Cover for "The Worldbuilding Chronicles"
- `inkweld_cover_1.png` - Cover for "Inkweld Demo Project"
- `demo_cover_1.png` - Cover for "Mystery Novel Draft"

These covers are referenced in the screenshot tests to create realistic demo content.
