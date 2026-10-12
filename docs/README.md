# Inkweld Documentation Hub

The canonical docs live in the Docusaurus site at `docs/site`. It holds the
admin and developer docs (`docs/site/docs`), the user guide
(`docs/site/docs-user-guide`, served under `/user-guide`) and the generated API
reference (from `backend/openapi.json`).

## Local preview

Dependencies are installed from the repo root: `bun install` runs the root
`postinstall`, which also installs `docs/site`. Then:

```bash
cd docs/site
bun run start   # http://localhost:3000, hot reload
```

`start` first regenerates the API reference from `backend/openapi.json`.

## Production build

```bash
cd docs/site
bun run build               # API docs + screenshots + Docusaurus build
bun run build:no-screenshots  # same without the Playwright screenshot run
bun run serve               # optional static preview of docs/site/build
```

The full build runs the screenshot suite (`bun run generate-screenshots`, i.e.
`TEST_ENV=screenshots npx playwright test` in `frontend/`), which needs the
Playwright Chromium browser. From the repo root, `bun run verify:docs` is the
full build and `bun run verify:docs:lite` the one without screenshots (the
default `bun run verify` uses the latter).

## Deployment

`.github/workflows/docs.yml` builds the site (with screenshots) and publishes
`docs/site/build` to GitHub Pages with the Pages actions
(`configure-pages`, `upload-pages-artifact`, `deploy-pages`). It runs on pushes
to `main` that touch `docs/**` or `backend/openapi.json`, and can be started
manually. The site is served at https://inkweld.org: that domain is set by
`siteUrl` in `docs/site/docusaurus.config.ts`, `docs/site/static/CNAME` and the
repository's GitHub Pages custom domain (Settings → Pages), which must agree.
The app links to it through `frontend/src/app/config/docs-links.ts`, and
preview.inkweld.org redirects to it (a Cloudflare redirect rule). The optional repository variable `INKWELD_APP_URL`
overrides where the "Open App" links point.

## Contributing to docs

- Place new guides under `docs/site/docs/<category>/<topic>.md(x)` (or
  `docs/site/docs-user-guide/` for the user guide).
- Organize navigation via `docs/site/sidebars.ts` / `sidebars-user-guide.ts`.
- Keep `docusaurus.config.ts` current (site title, links, metadata).
- Update this README anytime the workflow changes.

For contribution guidelines, see the [pull request template](../.github/PULL_REQUEST_TEMPLATE.md).
