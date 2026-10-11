# Assets Directory

This directory contains static assets for the Inkweld project.

## Directory Structure

- **demo_covers/** - Sample book cover images used for demo screenshots
- **demo_images/** - Sample images used by the screenshot tests
- **architecture-light.svg** / **architecture-dark.svg** - Architecture diagram

## Generating Screenshots

Screenshots are generated using Playwright e2e tests and saved to `docs/site/static/img/generated/` (or `img/features/`) for use in the Docusaurus documentation site. Screenshots are **generated on-the-fly during the docs build** to ensure they are always up to date.

### Automatic Generation (Recommended)

Screenshots are automatically generated when building the documentation site:

```bash
cd docs/site
bun run build                 # screenshots + Docusaurus build
bun run build:no-screenshots  # skip the screenshots
```

`bun run build` runs `bun run generate-screenshots` (`TEST_ENV=screenshots npx playwright test` in `frontend/`) before the Docusaurus build.

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

Screenshots are written under `docs/site/static/img/generated/` (shared views such as
the bookshelf, editor and dialogs, in desktop/mobile and light/dark variants) and
`docs/site/static/img/features/` (feature pages such as canvas, publishing and admin
settings). Both folders are **gitignored** and regenerated on every full docs build.
Each spec in `frontend/e2e/screenshots/` names its own outputs.

## Demo Covers

The `demo_covers/` directory contains sample book cover images that are displayed in screenshot tests:

- `worldbuilding_cover_1.png` - Cover for "The Worldbuilding Chronicles"
- `inkweld_cover_1.png` - Cover for "Inkweld Demo Project"
- `demo_cover_1.png` - Cover for "Mystery Novel Draft"

These covers are referenced in the screenshot tests to create realistic demo content.
