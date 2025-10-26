# Assets Directory

This directory contains static assets for the Inkweld project.

## Directory Structure

- **demo_covers/** - Sample book cover images used for demo screenshots
- **screenshots/** - Project screenshots for README and documentation (committed to repo)

## Generating Screenshots

Screenshots are generated using Playwright e2e tests but are **not run by default** to keep regular test runs fast.

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

The following screenshots are created in `assets/screenshots/` and **committed to the repository** for use in README and documentation:

- `bookshelf-desktop.png` - Desktop view of the project bookshelf/dashboard
- `bookshelf-mobile.png` - Mobile view of the project bookshelf/dashboard
- `editor-desktop.png` - Desktop view of the project editor
- `editor-mobile.png` - Mobile view of the project editor

## Demo Covers

The `demo_covers/` directory contains sample book cover images that are displayed in screenshot tests:

- `worldbuilding_cover_1.png` - Cover for "The Worldbuilding Chronicles"
- `inkweld_cover_1.png` - Cover for "Inkweld Demo Project"
- `demo_cover_1.png` - Cover for "Mystery Novel Draft"

These covers are referenced in the screenshot tests to create realistic demo content.
