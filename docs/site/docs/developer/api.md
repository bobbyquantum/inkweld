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

### JWT Bearer Tokens (REST API)

Authenticated endpoints expect an `Authorization: Bearer <token>` header. The token is an HS256-signed JWT that is valid for 30 days. A successful sign-in returns it in the response body as `{ user, token }`, and the web app stores and sends it for you.

:::note Password login is off by default
Inkweld is passwordless-first. With the default `PASSWORD_LOGIN_ENABLED=false`, `POST /api/v1/auth/login` returns `403` and users sign in with passkeys, which need a browser and so are awkward to script. To script against a server with username/password, set `PASSWORD_LOGIN_ENABLED=true` (see [Configuration](../configuration.md)). The account must be approved and enabled.
:::

```bash
# Login (requires PASSWORD_LOGIN_ENABLED=true)
TOKEN=$(curl -s -X POST http://localhost:8333/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "pass"}' | jq -r .token)

# Use the token for authenticated requests
curl http://localhost:8333/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

Signing out of all devices (and other session-revoking actions) invalidates every token issued before that moment, so a stored token can stop working before its 30 days are up and you should be ready to sign in again on a `401`.

### OAuth 2.1 Bearer Tokens (MCP / AI Clients)

The MCP endpoint (`/api/v1/ai/mcp`) uses OAuth 2.1 with PKCE for authorization. AI assistants discover the OAuth server via standard metadata endpoints, register dynamically, and obtain JWT access tokens scoped to the projects the user granted. There are no long-lived API keys for MCP: use OAuth, or the JWT bearer token above for the REST API.

```bash
# Use a bearer token for MCP requests
curl -X POST http://localhost:8333/api/v1/ai/mcp \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{...}}'
```

See the [MCP & OAuth Integration](./mcp-oauth.md) guide for the full OAuth flow, scopes, and configuration.

## Common Response Codes

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Rate Limiting

General API endpoints are not rate limited by the server. A fixed set of abuse-sensitive endpoints is limited per client IP, answering `429 Too Many Requests` once the limit is passed:

| Endpoint                                  | Limit         |
| ----------------------------------------- | ------------- |
| `POST /api/v1/auth/login`                 | 5 per minute  |
| `POST /api/v1/auth/register`              | 3 per minute  |
| `POST /api/v1/auth/forgot-password`       | 3 per minute  |
| `POST /api/v1/auth/reset-password`        | 5 per minute  |
| `/api/v1/auth/passkeys/login/*`           | 10 per minute |
| `/api/v1/auth/passkeys/register/*`        | 10 per minute |
| `/api/v1/auth/passkey-recovery/*`         | 3 per minute  |
| `POST /oauth/register` (MCP client setup) | 10 per hour   |

The limits are fixed (not configurable) and are held in memory per server process, so they apply on Bun and Docker but not meaningfully on Cloudflare Workers, where isolates are short-lived. On Workers, add Cloudflare WAF rate-limiting rules in front of the auth endpoints. Set `INKWELD_DISABLE_RATE_LIMIT=true` to switch them off (for example in automated tests).

## CORS

CORS is configured to allow requests from the frontend application. See `backend/src/bun-app.ts` for configuration.

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
3. Regenerate docs: `cd docs/site && bun run gen-api-docs`
4. Review changes in documentation site

## Developer Resources

- [Architecture Overview](./architecture.md)
- [MCP & OAuth Integration](./mcp-oauth.md)
- [Getting Started](../getting-started.md)

## Example: Creating a Project

```bash
# Authenticate (requires PASSWORD_LOGIN_ENABLED=true)
TOKEN=$(curl -s -X POST http://localhost:8333/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret"}' | jq -r .token)

# Create project (slug: at least 3 chars, lowercase letters, digits and hyphens)
curl -X POST http://localhost:8333/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "My Novel",
    "slug": "my-novel",
    "description": "A collaborative novel project"
  }'
```

## Need Help?

- Check the [API Reference](/docs/api/inkweld-api) for endpoint details
- Review [Troubleshooting](../troubleshooting/logging.md)
- Ask in [GitHub Discussions](https://github.com/bobbyquantum/inkweld/discussions)
