# Inkweld Docs Site

This site is built with [Docusaurus](https://docusaurus.io/) and managed with
Bun. See [`docs/README.md`](../README.md) for the full workflow.

## Installation

From the **repo root** (the root `postinstall` also installs this package):

```bash
bun install
```

## Local Development

```bash
cd docs/site
bun run start
```

This regenerates the API reference from `backend/openapi.json` and starts a
local development server. Most changes are reflected live without restarting.

## Build

```bash
bun run build                 # API docs + screenshots + site
bun run build:no-screenshots  # skip the Playwright screenshot run
```

Output goes to `build/`. The screenshots come from `bun run
generate-screenshots` (the Playwright screenshots suite in `frontend/`); they
are written to `static/img/generated/` and `static/img/features/`, both
gitignored.

## Deployment

Pushes to `main` that touch `docs/**` deploy the site to GitHub Pages through
`.github/workflows/docs.yml`. There is no `docusaurus deploy` / `gh-pages`
step.
