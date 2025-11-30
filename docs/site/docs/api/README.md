# API Documentation

This directory contains auto-generated API documentation from the OpenAPI specification.

## Generation

The API documentation is automatically generated from `backend/openapi.json` using the [docusaurus-plugin-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) plugin.

### Commands

- **Generate API docs**: `npm run gen-api-docs`
- **Clean API docs**: `npm run clean-api-docs`
- **Generate all versions**: `npm run gen-api-docs:all`

### Workflow

1. Update the backend API and ensure `backend/openapi.json` is current
2. Run `npm run clean-api-docs` to remove old generated files
3. Run `npm run gen-api-docs` to regenerate documentation
4. Commit the generated files to version control

## Files

- `sidebar.ts` - Auto-generated sidebar configuration
- `inkweld-api.info.mdx` - API overview page
- `*.api.mdx` - Individual API endpoint documentation

## Configuration

The OpenAPI plugin is configured in `docusaurus.config.ts`:

```typescript
plugins: [
  [
    'docusaurus-plugin-openapi-docs',
    {
      id: 'api',
      docsPluginId: 'classic',
      config: {
        inkweld: {
          specPath: '../../backend/openapi.json',
          outputDir: 'docs/api',
          sidebarOptions: {
            groupPathsBy: 'tag',
            categoryLinkSource: 'tag',
          },
        },
      },
    },
  ],
],
```

## Features

- **Interactive API Requests**: Try API endpoints directly from the documentation
- **Grouped by Tags**: Endpoints organized by their OpenAPI tags
- **Full Schema Support**: Complete request/response schema documentation
- **Code Examples**: Request examples in multiple languages

## Notes

- **DO NOT** manually edit generated `.mdx` files - they will be overwritten
- Custom content should be added to the OpenAPI spec or via templates
- The sidebar is auto-generated based on API tags and paths
