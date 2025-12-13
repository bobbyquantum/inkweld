# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-10-26

### 🎉 Initial Public Release

Inkweld v0.1.0 is the first public release of this collaborative creative writing platform.

### Added

#### Core Features

- **Real-time Collaborative Editing**: Multiple users can edit documents simultaneously using Yjs CRDTs and WebSocket synchronization
- **Document Management**: Hierarchical organization of projects, documents, and elements (folders, files)
- **Rich Text Editor**: ProseMirror-based editor with advanced formatting options
- **Offline Support**: IndexedDB storage for offline editing with automatic sync when reconnected
- **Worldbuilding Templates**: Character and location templates with real-time collaboration *(Note: Not yet ported to new Hono backend on feature/new-backend branch)*
- **Version History**: Track changes and revert to previous versions (via Yjs history)

#### Content Export

- **EPUB Export**: Export projects and documents to EPUB format for e-readers

#### Authentication & Security

- **Local Authentication**: Username/password authentication with strong password requirements
- **GitHub OAuth**: Optional GitHub OAuth integration
- **Session Management**: Secure session-based authentication with httpOnly cookies
- **CSRF Protection**: Protection against cross-site request forgery attacks
- **User Approval System**: Configurable admin approval for new user registrations

#### Infrastructure & DevOps

- **Docker Support**: Multi-stage Dockerfile with optimized production builds
- **Docker Compose**: Ready-to-use Docker Compose configuration
- **Database Flexibility**: Support for both PostgreSQL and SQLite
- **CI/CD Pipeline**: Automated testing, linting, and Docker image publishing to GHCR
- **Progressive Web App**: Service worker support for offline capabilities and installability

#### Developer Experience

- **Modern Tech Stack**: Angular 20 (frontend), Hono on Bun (backend)
- **Comprehensive Testing**: Jest for unit tests, Playwright for e2e tests
- **API Documentation**: Auto-generated OpenAPI specification
- **Type Safety**: Full TypeScript implementation with strict mode
- **AI Agent Support**: Detailed documentation for AI coding assistants (AGENTS.md, copilot-instructions.md)

### Known Limitations

- **Logging**: Currently uses console logging; a proper logging framework is recommended for production deployments
- **User Management**: Username changes and profile customization not yet implemented
- **Import/Export**: Archive import/export functionality is partially implemented
- **Project Renaming**: Changing project slugs not yet supported
- **Export Options**: PDF and Markdown export not yet implemented
- **Mobile UI**: Responsive design could be improved for mobile devices

### Technical Stack

- **Frontend**: Angular 20 with standalone components, signals, and modern control flow
- **Backend**: Hono + Bun/Node/Cloudflare Workers multi-runtime
- **Database**: Drizzle ORM with SQLite/D1 + LevelDB for document storage
- **Real-time**: Yjs for CRDTs, WebSocket for synchronization
- **Storage**: Per-project LevelDB instances for Yjs documents

### Documentation

- Comprehensive README with setup instructions and feature overview
- Getting Started guide (docs/GETTING_STARTED.md)
- CI/CD documentation (docs/CI_CD.md)
- E2E testing best practices (frontend/e2e/BEST_PRACTICES.md)
- AI agent instructions (AGENTS.md, .github/copilot-instructions.md)
- Admin CLI documentation (backend/ADMIN_CLI.md)

### Community

- GitHub issue templates for bugs, features, and documentation
- Pull request template
- Renovate bot configured for automated dependency updates

---

## [Unreleased]

### Planned Features

- PDF and Markdown export
- Project renaming and slug changes
- Complete archive import/export
- Enhanced mobile UI
- User profile customization
- Additional OAuth providers (Google, etc.)
- Two-factor authentication
- Production logging framework
- Self-hosting documentation
- Monitoring and observability

---

[0.1.0]: https://github.com/bobbyquantum/inkweld/releases/tag/v0.1.0
