# OpenAPI Integration Guide

This guide explains how the OpenAPI documentation is integrated into the Inkweld Docusaurus documentation site.

## Overview

We've integrated [docusaurus-plugin-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs) to automatically generate beautiful, interactive API documentation from the OpenAPI specification.

## What Was Added

### 1. Dependencies

```json
{
  "docusaurus-plugin-openapi-docs": "^4.5.1",
  "docusaurus-theme-openapi-docs": "^4.5.1"
}
```

### 2. Configuration (`docusaurus.config.ts`)

- Added OpenAPI plugin configuration pointing to local copy of OpenAPI spec
- The spec is copied from `backend/openapi.json` to `static/openapi.json` during build
- Configured theme to use `@theme/ApiItem` for API documentation rendering
- Added `docusaurus-theme-openapi-docs` theme
- Updated navbar to include API sidebar link

### 3. Scripts (`package.json`)

```json
{
  "gen-api-docs": "docusaurus gen-api-docs inkweld",
  "clean-api-docs": "docusaurus clean-api-docs inkweld",
  "gen-api-docs:all": "docusaurus gen-api-docs all"
}
```

### 4. Sidebar Configuration (`sidebars.ts`)

- Imported auto-generated API sidebar
- Added `apiSidebar` to expose API documentation in navigation

## Usage

### Regenerating API Documentation

When the backend API changes and `backend/openapi.json` is updated:

```bash
cd docs/site

# Clean old documentation
npm run clean-api-docs

# Generate new documentation
npm run gen-api-docs
```

### Development Workflow

1. **Backend Changes**: Make API changes in the backend
2. **Generate OpenAPI Spec**: Run `bun run generate:openapi` in the backend directory
3. **Regenerate Docs**: Run `npm run gen-api-docs` in `docs/site`
4. **Review**: Check the generated documentation at `http://localhost:3000/docs/api`
5. **Commit**: Commit both the OpenAPI spec and generated docs

### CI/CD Integration

Consider adding this to your CI/CD pipeline:

```yaml
# In .github/workflows/docs.yml
- name: Generate API Documentation
  run: |
    cd docs/site
    npm run gen-api-docs

- name: Check for uncommitted changes
  run: |
    git diff --exit-code docs/site/docs/api/
```

## Features

### Interactive API Console

- **Try It Out**: Test API endpoints directly from the documentation
- **Request Examples**: See example requests in multiple formats
- **Response Schemas**: View detailed response structures
- **Authentication**: Configure authentication tokens for testing

### Documentation Structure

- **Grouped by Tags**: Endpoints organized by OpenAPI tags (Authentication, Users, Projects, etc.)
- **Overview Page**: `inkweld-api.info.mdx` provides API introduction
- **Individual Endpoints**: Each endpoint gets its own `.mdx` file with complete documentation

### Customization Options

The plugin supports extensive customization in `docusaurus.config.ts`:

```typescript
config: {
  inkweld: {
    specPath: 'static/openapi.json',  // Local copy, synced at build time
    outputDir: 'docs/api',
    sidebarOptions: {
      groupPathsBy: 'tag', // Group by tag, tagGroup, or other options
      categoryLinkSource: 'tag', // Use tag descriptions for categories
      sidebarCollapsible: true,
      sidebarCollapsed: true,
    },
    hideSendButton: false, // Set to true to hide API request button
    showSchemas: true, // Show schema documentation
  },
}
```

## File Structure

```
docs/site/
├── docs/
│   └── api/                           # Generated API docs
│       ├── sidebar.ts                 # Auto-generated sidebar
│       ├── inkweld-api.info.mdx      # API overview
│       ├── README.md                  # Documentation guide
│       └── *.api.mdx                  # Individual endpoints
├── docusaurus.config.ts               # Docusaurus + OpenAPI config
├── sidebars.ts                        # Sidebar configuration
└── package.json                       # Dependencies and scripts
```

## Best Practices

### 1. Keep OpenAPI Spec Updated

Always regenerate `backend/openapi.json` after API changes:

```bash
cd backend
bun run generate:openapi
```

### 2. Enrich OpenAPI with Documentation

Add descriptions, examples, and metadata to your Hono routes using Zod schemas:

```typescript
// Example: Enriching route documentation with Zod
const userRoutes = new OpenAPIHono()
  .openapi(
    createRoute({
      method: 'get',
      path: '/me',
      summary: 'Get user profile',
      description: 'Returns the authenticated user\'s profile information',
      responses: {
        200: {
          description: 'User profile retrieved successfully',
          content: { 'application/json': { schema: UserSchema } }
        }
      }
    }),
    async (c) => { /* handler */ }
  )
```

### 3. Use Tags for Organization

Group related endpoints with OpenAPI tags:

```typescript
const authRoutes = new OpenAPIHono()
  .openapi(
    createRoute({
      tags: ['Authentication'],
      // ... route config
    }),
    handler
  )
```

### 4. Version Control Generated Docs

**Recommended**: Commit generated docs to version control for these reasons:

- Documentation history tracking
- Easy review in pull requests
- No need to regenerate during deployment

Add this to `.gitignore` if you prefer to regenerate on-demand:

```
docs/site/docs/api/**/*.mdx
docs/site/docs/api/sidebar.ts
!docs/site/docs/api/README.md
```

## Troubleshooting

### Documentation Not Showing

1. Check that `npm run gen-api-docs` completed successfully
2. Verify `docs/api/sidebar.ts` exists
3. Ensure `sidebars.ts` imports the API sidebar
4. Clear Docusaurus cache: `npm run clear`

### Build Errors

```bash
# Clear cache and rebuild
cd docs/site
npm run clear
npm run gen-api-docs
npm run build
```

### OpenAPI Spec Issues

If endpoints are missing:

1. Check Hono route definitions and Zod schemas
2. Verify routes are properly registered
3. Regenerate OpenAPI spec: `cd backend && bun run generate:openapi`

## Resources

- [Plugin Documentation](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs)
- [Docusaurus Documentation](https://docusaurus.io/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Hono OpenAPI](https://hono.dev/docs/helpers/openapi)

## Next Steps

Consider these enhancements:

1. **API Versioning**: Add versioned API documentation
2. **Examples**: Add request/response examples to OpenAPI spec
3. **Authentication Guide**: Document authentication flows
4. **Rate Limiting**: Document API rate limits and quotas
5. **SDKs**: Generate client SDKs from the OpenAPI spec
