import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function ApiPage(): ReactNode {
  return (
    <Layout
      title="API Documentation"
      description="REST API documentation for Inkweld"
    >
      <div className="container margin-vert--lg">
        <Heading as="h1">API Documentation</Heading>

        <section className="margin-vert--lg">
          <Heading as="h2">OpenAPI Specification</Heading>
          <p>
            The Inkweld API follows OpenAPI 3.0 specifications. You can access
            the complete API specification and try endpoints interactively.
          </p>

          <div className="margin-vert--md">
            <a
              href="https://github.com/bobbyquantum/inkweld/blob/main/backend/openapi.json"
              className="button button--primary button--lg margin-right--md"
              target="_blank"
              rel="noopener noreferrer"
            >
              View OpenAPI Spec
            </a>
            <a
              href="http://localhost:8333/api"
              className="button button--secondary button--lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Interactive API Docs (Local)
            </a>
          </div>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">Authentication</Heading>
          <p>
            Signing in returns a JWT. Send it as a bearer token on every
            request. Password sign-in is off by default (servers are
            passkey-first); an administrator can enable it with{' '}
            <code>PASSWORD_LOGIN_ENABLED=true</code>.
          </p>
          <pre>
            <code>{`POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}

Response:
{
  "user": { "id": "uuid", "username": "your-username", ... },
  "token": "eyJ..."
}

Then: Authorization: Bearer eyJ...`}</code>
          </pre>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">Common Endpoints</Heading>

          <Heading as="h3">Projects</Heading>
          <ul>
            <li>
              <code>GET /api/v1/projects</code> - List your projects
            </li>
            <li>
              <code>POST /api/v1/projects</code> - Create a project (
              <code>title</code>, <code>slug</code>)
            </li>
            <li>
              <code>GET /api/v1/projects/:username/:slug</code> - Get project
              details
            </li>
            <li>
              <code>PUT /api/v1/projects/:username/:slug</code> - Update project
            </li>
            <li>
              <code>DELETE /api/v1/projects/:username/:slug</code> - Delete
              project
            </li>
          </ul>

          <Heading as="h3">Elements and documents</Heading>
          <ul>
            <li>
              <code>GET /api/v1/projects/:username/:slug/elements</code> - The
              project tree (folders, documents, worldbuilding elements)
            </li>
            <li>
              <code>GET /api/v1/projects/:username/:slug/docs</code> - List
              documents
            </li>
            <li>
              <code>GET /api/v1/projects/:username/:slug/docs/:docId</code> -
              Get a document
            </li>
          </ul>
          <p>
            Documents and worldbuilding content are edited through the real-time
            connection below or the MCP server, not through REST writes.
          </p>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">WebSocket Connection</Heading>
          <p>Real-time collaboration uses WebSocket connections:</p>
          <pre>
            <code>{`wss://your-server/api/v1/ws/yjs?documentId=<username>:<slug>:<elementId>

The client authenticates with its token after connecting.
Yjs CRDT updates exchanged in binary format.`}</code>
          </pre>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">Rate Limiting</Heading>
          <p>
            The API implements rate limiting to prevent abuse. Default limits:
          </p>
          <ul>
            <li>100 requests per minute per IP address</li>
            <li>1000 requests per hour per authenticated user</li>
          </ul>
          <p>
            Rate limit configuration can be adjusted via environment variables.
          </p>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">Error Responses</Heading>
          <p>The API returns standard HTTP status codes:</p>
          <ul>
            <li>
              <code>200</code> - Success
            </li>
            <li>
              <code>201</code> - Resource created
            </li>
            <li>
              <code>400</code> - Bad request (validation error)
            </li>
            <li>
              <code>401</code> - Unauthorized (not logged in)
            </li>
            <li>
              <code>403</code> - Forbidden (insufficient permissions)
            </li>
            <li>
              <code>404</code> - Resource not found
            </li>
            <li>
              <code>429</code> - Too many requests (rate limited)
            </li>
            <li>
              <code>500</code> - Internal server error
            </li>
          </ul>
        </section>

        <section className="margin-vert--lg">
          <Heading as="h2">Client Generation</Heading>
          <p>Generate type-safe API clients from the OpenAPI specification:</p>
          <pre>
            <code>{String.raw`# TypeScript/Angular client (included in repo)
cd backend
bun run generate:angular-client

# Other languages via openapi-generator
npx @openapitools/openapi-generator-cli generate \
  -i backend/openapi.json \
  -g python \
  -o ./python-client`}</code>
          </pre>
        </section>
      </div>
    </Layout>
  );
}
