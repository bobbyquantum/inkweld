# Inkweld

![Inkweld Logo](frontend/public/logo.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/bobbyquantum/inkweld/ci.yml?branch=main)](https://github.com/bobbyquantum/inkweld/actions)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://hub.docker.com/)
[![Docker Image](https://ghcr-badge.egpl.dev/bobbyquantum/inkweld/latest_by_date?color=%2344cc11&ignore=latest)](https://github.com/bobbyquantum/inkweld/pkgs/container/inkweld)

---

**Quick Links:**  

- [Getting Started](docs/GETTING_STARTED.md)  
- [Changelog](CHANGELOG.md)  
- [API Documentation](backend/openapi.json)  
- [CI/CD Pipeline](docs/CI_CD.md)  
- [Contributing](#contributing)  
- [Production Readiness Checklist](#production-readiness-checklist)

---

## About

Inkweld is ideal for:

- **Creative Writing**: Collaborate on novels, short stories, and screenplays with real-time editing and version control
- **Worldbuilding**: Build rich story worlds with customizable element types and relationship systems
- **Technical Documentation**: Maintain up-to-date documentation with multiple contributors
- **Research Projects**: Collaborate on academic papers and research notes

---

### Feature Overview

| Feature                        | Description                                                                 |
|---------------------------------|-----------------------------------------------------------------------------|
| Real-time Collaboration        | Edit documents with others in real time using YJS and Prosemirror           |
| Hierarchical Organization      | Organize projects and documents in nested structures                        |
| Offline Editing                | Work offline with automatic sync when reconnected                           |
| Rich Text Formatting           | Advanced formatting and styling options                                     |
| Version History                | Track changes and revert to previous versions                               |
| User Permissions               | Fine-grained access control and roles                                       |
| Extensible Integrations        | Add new features via MCP (Model Context Protocol) integrations              |
| Export Options                 | Export to PDF (via Typst), EPUB, and Markdown (planned)                     |

---

## Architecture

```mermaid
flowchart TD
    Frontend[Angular 21 PWA] -->|REST + WebSocket| Backend[Hono API]
    Backend -->|Drizzle ORM| Database[(SQLite / D1)]
    Backend -->|Yjs persistence| Realtime[(LevelDB)]
    Backend -->|OpenAPI spec| APIClient[Generated SDK]
    Frontend -.->|imports at build| APIClient
```

---

## Project Setup

> **Requirements:**  
>
> - [Bun 1.3+](https://bun.sh/)  
> - [NodeJS 20+](https://nodejs.org/en)

1. **Clone the repository:**

    ```bash
    git clone https://github.com/bobbyquantum/inkweld.git
    cd inkweld
    ```

2. **Install dependencies:**

    ```bash
    bun install
    ```

    > This installs dependencies for both the frontend and backend.

3. **Set up environment variables:**

    - Copy `.env.example` to `.env` at the project root and update the values as needed.

4. **(Optional) Enable Angular MCP for AI Assistants:**

    This project includes an Angular CLI MCP (Model Context Protocol) server configuration that gives AI assistants direct access to real-time Angular documentation. The configuration is already set up in `.vscode/mcp.json`.

    **To activate it:**
    - Restart VS Code or your AI assistant after cloning the repository
    - The MCP server provides tools like `get_best_practices`, `search_documentation`, and `list_projects`
    - Learn more at <https://angular.dev/ai/mcp>

> There are VSCode workspaces available. For general development or trying it out, it's recommended to load the full workspace with backend and frontend folders configured.

---

## Development Server

To start the development server (both frontend and backend):

```bash
npm start
```

There is also a compound debug task available.

### Backend Runtime Targets

The new `/backend` implementation can run in three environments:

| Target | Command | Notes |
| --- | --- | --- |
| Bun (default) | `cd backend && bun run dev` | Native `bun:sqlite`, WebSockets + Yjs |
| Node.js | `cd backend && bun run dev:node` | Uses `better-sqlite3`, great for traditional servers |
| Cloudflare Workers | `cd backend && bun run dev:worker` | Uses D1 + Durable Objects |

Production builds follow the same pattern via `bun run build`, `bun run build:node`, or `bun run build:worker`.

---

## Build

To build the project:

```bash
npm run build
```

- Frontend build artifacts: `frontend/dist/`
- Backend build artifacts: `backend/dist/`
- Backend binaries are runtime-specific (`dist/bun-runner.js`, `dist/node-runner.js`)

---

## Docker Compose

To build and run with Docker Compose:

```bash
npm run compose:up:prod
```

This uses the root `Dockerfile` to build the all-in-one image (Angular SPA + Hono backend compiled into a single Bun binary) and persists SQLite/Yjs data in the `inkweld_data` volume. On boot the container automatically runs Drizzle migrations so the SQLite schema is ready before requests arrive. See `DEPLOY.md` for production deployment options.

---

## Docker Images

Pre-built Docker images are automatically published to GitHub Container Registry:

- **Latest (main branch)**: `ghcr.io/bobbyquantum/inkweld:latest`
- **Specific commit**: `ghcr.io/bobbyquantum/inkweld:main-<commit-sha>`
- **Release versions**: `ghcr.io/bobbyquantum/inkweld:v1.0.0`

### Using Pre-built Images

```bash
# Pull and run the latest image
docker run -d --name inkweld \
    -p 8333:8333 \
    -v inkweld_data:/data \
    -e SESSION_SECRET=supersecuresecretkey12345678901234567890 \
    -e CLIENT_URL=http://localhost:4200 \
    ghcr.io/bobbyquantum/inkweld:latest

# Or use with docker-compose by updating your compose file:
# image: ghcr.io/bobbyquantum/inkweld:latest
```

- `SESSION_SECRET` must be 32+ chars (used for cookie signing).
- `/data` stores the Bun SQLite file plus LevelDB/Yjs payloads—mount it to retain everything across upgrades.
- The bundled Angular SPA ships in the same container, so browsing to `http://localhost:8333/` loads the UI while `/api/**` continues to serve JSON.

### Admin CLI from inside the container

The admin CLI (`admin-cli.ts`) is also baked into the runtime stage, so you can moderate users without copying extra files:

```bash
docker exec -it inkweld bun run admin-cli.ts users pending
docker exec -it inkweld bun run admin-cli.ts users approve <username>
docker exec -it inkweld bun run admin-cli.ts stats
```

Those commands share the same environment variables and `/data` volume as the running server, which means approvals, stats, and project maintenance act on the live database.

### Available Tags

- `latest` - Latest stable build from main branch
- `v*` - Specific release versions (e.g., `v1.0.0`, `v1.1.0`)
- `main-<sha>` - Specific commit builds from main branch
- `manual` - Manual builds triggered via GitHub Actions

---

## Running Tests

To run tests for both frontend and backend:

```bash
npm test
```

This will execute the unit tests for both the frontend and backend projects.

> **Note:** If you encounter module resolution errors, run `bun install` from the repository root to ensure all dependencies are installed.

---

## Production Readiness Checklist

> **Note:** Inkweld v0.1.0 is the initial public release. Some features are planned for future versions.

### Core Functionality

- [x] Basic document editing with ProseMirror over Yjs
- [x] Local-first capabilities with automatic sync
- [x] In-browser IndexedDB storage
- [x] Backend LevelDB storage
- [x] Extensible worldbuilding elements with customizable templates
- [x] Real-time collaborative editing with WebSocket sync
- [x] Complete import/export to archive functionality
- [ ] Project renaming and slug changing capabilities

### Content Export

- [x] EPUB export capability
- [x] PDF export functionality
- [x] Markdown export options
- [ ] Print-friendly formatting
- [ ] Typography customization (font, size, line spacing)
- [ ] PDF page layout options (margins, page size, headers/footers)
- [ ] Chapter numbering styles
- [ ] Scene break customization

### User Experience

- [ ] Quick file open (Ctrl/Cmd + P)
- [ ] Project-wide search
- [ ] Find in document (Ctrl/Cmd + F)
- [ ] Find and replace
- [ ] Breadcrumb navigation
- [ ] Recent documents list
- [ ] Favorites/bookmarks
- [ ] Tag filtering in project tree
- [ ] Improved onboarding for first-time users
- [ ] Username changes and profile customization
- [ ] Enhanced user dashboard/homepage
- [x] Optimized responsive design for mobile devices
- [ ] MCP support for optional AI collaboration (in progress)

### Editor Features

- [ ] Image insertion in documents
- [ ] Code blocks

### Editor Keyboard Shortcuts

- [x] Bold shortcut (Ctrl/Cmd + B)
- [x] Italic shortcut (Ctrl/Cmd + I)
- [x] Underline shortcut (Ctrl/Cmd + U)
- [x] Strikethrough shortcut (Ctrl/Cmd + Shift + X)
- [x] Inline code shortcut (Ctrl/Cmd + E)
- [x] Heading shortcuts (Ctrl/Cmd + 1-6)
- [x] Paragraph shortcut (Ctrl/Cmd + 0)
- [x] Bullet list shortcut (Ctrl/Cmd + Shift + 7)
- [x] Numbered list shortcut (Ctrl/Cmd + Shift + 8)
- [x] Blockquote shortcut (Ctrl/Cmd + Shift + 9)
- [x] Horizontal rule shortcut (Ctrl/Cmd + Shift + H)
- [x] Clear formatting shortcut (Ctrl/Cmd + \\)
- [ ] Insert image shortcut

### Authentication & Security

- [x] Password authentication with strong password requirements
- [x] CSRF protection
- [x] User approval system for new registrations
- [ ] Password reset via email
- [ ] Additional OAuth providers (Google, etc.)
- [ ] Two-factor authentication
- [ ] Fine-grained user permissions system

### Open Source Project Structure

- [x] GitHub issue templates
- [x] Pull request template
- [ ] CONTRIBUTING.md
- [ ] CODE_OF_CONDUCT.md
- [ ] SECURITY.md
- [ ] Automated release process

### DevOps & Deployment

- [x] Docker support with optimized multi-stage Dockerfile
- [x] Docker Compose configuration
- [x] Support for SQLite and Cloudflare D1 databases
- [x] CI/CD pipeline with automated testing
- [x] Automated Docker image publishing to GHCR
- [x] GitHub Actions workflows
- [x] Self-hosting documentation
- [ ] Production logging framework
- [ ] Monitoring and observability setup

---

## Project View on AI and Creative Writing

This project aims to empower writers to make their own decisions regarding AI.

The software is designed to be self-hosted and secure. There are no backdoors, and it is not a publishing/distribution platform, so if you set up your own instance, your content will not be sold, scraped, borrowed, or stolen.

There is an AI Kill Switch feature (enabled by default) which disables any AI related functionality.

Optional AI functionality which can be configured includes: 

- Generating an image from project elements
- Generating project covers from description
- Generating grammar suggestions
- MCP support for real time collaboration with AI agents.

## AI Usage Disclosure

AI tools are used in development, via Github Copilot.  An AI generated image is used for the main app desktop background (the red with the chimneys and cogs).  Some AI generated cover art is used within the documentation for illustrative purposes.  

Main Inkweld logo designed in Inkscape by hand and released under the same terms as the rest of the repository (MIT).

PRs with Human replacements for the placeholder art elements are welcomed, provided permission is granted to be released under the same terms (MIT).

---

## Contributing

We welcome contributions! Please see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines (or create this file if it does not exist).

- Open issues for bugs or feature requests.
- Submit pull requests for improvements.
- See the [Production Readiness Checklist](#production-readiness-checklist) for areas needing help.

---

## Community & Support

- [Discussions](https://github.com/bobbyquantum/inkweld/discussions) (or open an issue)
- For security concerns, please contact the maintainer directly.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
