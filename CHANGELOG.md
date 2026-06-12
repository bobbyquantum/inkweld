# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Find and Replace**: Press `Ctrl/Cmd + F` in the editor to search for text within documents. Supports match navigation, case-sensitive search, single replace, and replace all.
- **Media Library Search**: Search bar in the Media tab to filter items by filename or AI generation prompt. Also available in the media selector dialog.

### Known Limitations

- **User Management**: Username changes and profile customization not yet implemented
- **Project Renaming**: Changing project slugs not yet supported
- **Mobile UI**: Responsive design could be improved for mobile devices
- **AI Grammar/Lint**: Implemented but currently broken — needs fixing

### Planned

- Project renaming and slug changes
- Enhanced mobile UI
- User profile customization
- Additional OAuth providers (Google, etc.)
- Two-factor authentication
- Production logging framework
- Monitoring and observability

---

## Initial Features (pre-release)

> Features present since the initial development phase, before numbered releases.

### Writing & Editing

- **Real-time Collaborative Editing**: Multiple users can edit documents simultaneously using Yjs CRDTs and WebSocket synchronization
- **Document Management**: Hierarchical organization of projects, documents, and elements (folders, files)
- **Rich Text Editor**: ProseMirror-based editor with advanced formatting options
- **Offline Support**: IndexedDB storage for offline editing with automatic sync when reconnected
- **Worldbuilding Templates**: Character and location templates with real-time collaboration
- **Version History**: Track changes and revert to previous versions
- **Comments/Annotations**: Inline feedback with threaded replies and resolution
- **Canvas Element**: Infinite freeform canvas with layers, drawing tools, image placement, and PNG export
- **Relationship Charts**: Force-directed and hierarchy graph visualizations of element connections
- **Timelines**: Chronological visualizations with custom calendar systems and event references

### Content Export

- **EPUB Export**: Export projects and documents to EPUB format for e-readers
- **PDF Export**: High-quality PDF generation using the Typst typesetting system with full offline support
- **Markdown Export**: Full inline formatting (links, images, GFM tables, nested lists)
- **HTML Export**: Single-file web output
- **Publish Plans**: Save and reuse export configurations with per-plan typography settings

### Authentication & Security

- **Passkeys (WebAuthn)**: Passwordless sign-in via device biometrics or hardware security keys (passwordless-first default per NIST SP 800-63B Rev. 4)
- **Password Authentication**: Username/password login (opt-in via `PASSWORD_LOGIN_ENABLED=true`)
- **Magic-Link Passkey Recovery**: Email-based recovery to enrol a new passkey if the original device is lost
- **GitHub OAuth**: Optional GitHub sign-in
- **Session Management**: Secure session-based authentication with httpOnly cookies
- **CSRF Protection**: Protection against cross-site request forgery attacks
- **User Approval System**: Configurable admin approval for new user registrations

### Optional AI Features

> All AI features are disabled by default and require admin configuration.

- **AI Image Generation**: OpenAI, OpenRouter, Fal.ai, and Stable Diffusion provider support
- **Image Model Profiles**: Admin-configured presets per provider/model
- **Worldbuilding Context**: Include element data in generation prompts
- **Prompt Optimization**: AI-powered prompt rewriting for better results

### Infrastructure & DevOps

- **Docker Support**: Multi-stage Dockerfile with optimized production builds (~340 MB image)
- **Docker Compose**: Ready-to-use Docker Compose configuration
- **Single Binary**: Self-contained Bun binary (~68 MB) with embedded frontend and setup wizard
- **Database Flexibility**: Support for SQLite and Cloudflare D1
- **Cloudflare Workers**: Full serverless deployment option via Wrangler
- **CI/CD Pipeline**: Automated testing, linting, and Docker image publishing to GHCR
- **Progressive Web App**: Service worker support for offline capabilities and installability
- **Admin Dashboard**: User management, AI settings, announcements

### Developer Experience

- **Modern Tech Stack**: Angular 21 (frontend), Hono on Bun (backend)
- **Comprehensive Testing**: Vitest for unit tests, Playwright for e2e tests (80% coverage enforced)
- **API Documentation**: Auto-generated OpenAPI specification with interactive Swagger UI at `/api`
- **Type Safety**: Full TypeScript implementation with strict mode
- **MCP Integration**: Model Context Protocol endpoint with OAuth 2.1 + PKCE
- **AI Agent Support**: Detailed documentation for AI coding assistants (`AGENTS.md`, `copilot-instructions.md`)
- **Project Archives**: Export/import entire projects as `.inkweld.zip` with versioned migration system

### Documentation

- Comprehensive README with setup instructions and feature overview
- Docusaurus documentation site under `docs/site/`
- E2E testing best practices (`frontend/e2e/BEST_PRACTICES.md`)
- AI agent instructions (`AGENTS.md`, `.github/copilot-instructions.md`)

### Community

- GitHub issue templates for bugs, features, and documentation
- Pull request template
- Renovate bot configured for automated dependency updates

---

[Unreleased]: https://github.com/bobbyquantum/inkweld/compare/main...HEAD
