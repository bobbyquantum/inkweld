# Worm Bridge Server

The bridge server acts as a middleware component between the frontend and backend, handling:

1. YJS WebSocket connections for real-time collaboration
2. Request proxying between frontend and backend

## Features

- Real-time collaborative editing using YJS
- Request proxying for API and WebSocket connections
- Development-mode document validation

## Setup

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

## Architecture

The bridge server runs on port 8333 and handles:

- `/ws/yjs/*` - WebSocket connections for YJS collaboration
- `/api/*` - Proxied to backend (port 8080)
- All other requests - Proxied to frontend (port 4200)

## Development

The server includes dummy/development implementations for:
- Document state persistence
- Access validation
- Initial content creation

These will be replaced with actual implementations when moving to production.

## Test Coverage

The bridge server uses Jest for testing. To run the tests, use the following command:

```bash
bun run test
```

Ensure that you have the necessary dependencies installed before running the tests.
