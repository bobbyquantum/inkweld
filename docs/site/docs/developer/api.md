# API Documentation

Inkweld's REST API is fully documented using OpenAPI 3.1 specification and rendered with interactive documentation.

## Accessing the API Docs

- **Documentation Site**: [API Reference](/docs/api/inkweld-api)
- **OpenAPI Spec**: [`backend/openapi.json`](https://github.com/bobbyquantum/inkweld/blob/main/backend/openapi.json)

## API Overview

The Inkweld API provides programmatic access to all platform features:

- **Authentication**: User registration, login, OAuth integration
- **User Management**: Profile management, avatars, search
- **Projects**: Create, read, update, delete writing projects
- **Documents**: Manage collaborative documents with Yjs
- **Files**: Upload and manage project assets
- **Snapshots**: Version control for documents
- **AI Features**: Linting, image generation, MCP integration
- **Health & Config**: Service health checks and feature flags

## Interactive Features

Our API documentation includes:

- **Try It Out**: Test endpoints directly from the browser
- **Request Examples**: See example requests in multiple languages
- **Response Schemas**: Detailed response structure documentation
- **Authentication**: Configure bearer tokens for testing

## API Base URL

```
http://localhost:8333  # Development
https://your-domain.com # Production
```

## Authentication

Most endpoints require authentication via session cookies:

```bash
# Login to obtain session cookie
curl -X POST http://localhost:8333/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "pass"}' \
  -c cookies.txt

# Use session cookie for authenticated requests
curl http://localhost:8333/api/v1/users/me \
  -b cookies.txt
```

## Common Response Codes

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Rate Limiting

Currently, there are no rate limits on the API. This may change in production deployments.

## CORS

CORS is configured to allow requests from the frontend application. See `backend/src/app.module.ts` for configuration.

## Versioning

The API is versioned with a URL prefix: `/api/v1/`

Future versions will be released as `/api/v2/`, etc., with backward compatibility maintained.

## OpenAPI Specification

The complete API specification is available at:

- **File**: `backend/openapi.json`
- **Generation**: Auto-generated from Hono Zod OpenAPI definitions
- **Format**: OpenAPI 3.1 (JSON)

### Generating the Spec

```bash
cd backend
bun run generate:openapi
```

This analyzes all Hono routes and generates the OpenAPI specification.

## Documentation Updates

When the API changes:

1. Update Hono route definitions and Zod schemas
2. Regenerate OpenAPI spec: `cd backend && bun run generate:openapi`
3. Regenerate docs: `cd docs/site && npm run gen-api-docs`
4. Review changes in documentation site

## Developer Resources

- [Architecture Overview](./architecture.md)
- [Getting Started](../getting-started.md)

## Example: Creating a Project

```bash
# Authenticate
curl -X POST http://localhost:8333/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret"}' \
  -c cookies.txt

# Create project
curl -X POST http://localhost:8333/api/v1/projects \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "My Novel",
    "slug": "my-novel",
    "description": "A collaborative novel project"
  }'
```

## Need Help?

- Check the [API Reference](/docs/api/inkweld-api) for endpoint details
- Review [Troubleshooting](../troubleshooting/cookies.md)
- Ask in [GitHub Discussions](https://github.com/bobbyquantum/inkweld/discussions)
