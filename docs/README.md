# Inkweld Documentation Hub

The canonical docs now live inside our Docusaurus site located at `docs/site`. You can preview the content locally or build the production bundle that will eventually ship to `https://docs.inkweld.org`.

## Local preview

```bash
cd docs/site
npm install   # first run only
npm run start
```

The dev server hosts the docs at `http://localhost:3000/` with hot reload enabled. Markdown files sit under `docs/site/docs` and update immediately.

## Production build

```bash
cd docs/site
npm run build
npm run serve   # optional static preview
```

CI will deploy the output in `docs/site/build/` to `docs.inkweld.org` once the hosting workflow is ready.

## Contributing to docs

- Place new guides under `docs/site/docs/<category>/<topic>.md(x)`.
- Organize navigation via `docs/site/sidebars.ts`.
- Keep `docusaurus.config.ts` current (site title, links, metadata).
- Update this README anytime the workflow changes.

For contribution guidelines, see [documentation pull request template](../.github/PULL_REQUEST_TEMPLATE/documentation.md).
