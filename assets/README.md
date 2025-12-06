# Assets Directory

This directory contains static assets for the Inkweld project.

## Directory Structure

- **demo_covers/** - Sample book cover images used for demo screenshots

## Generating Screenshots

Screenshots are generated using Playwright e2e tests and saved directly to `docs/site/static/img/` for use in the Docusaurus documentation site. Screenshots are **generated on-the-fly during the docs build** to ensure they are always up to date.

### Automatic Generation (Recommended)

Screenshots are automatically generated when building the documentation site:

```bash
cd docs/site
bun run build
```

This runs `TEST_ENV=screenshots npx playwright test` before the Docusaurus build.

### Manual Generation

To generate/update screenshots manually:

```bash
cd frontend
TEST_ENV=screenshots npx playwright test
```

Or using the config switcher directly:

```bash
cd frontend
npx playwright test --config=playwright.screenshots.config.ts
```

### Generated Screenshots

The following screenshots are created in `docs/site/static/img/` (these are **gitignored** and generated fresh on each build):

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
