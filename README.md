# Inkweld

![Inkweld Logo](frontend/public/logo.png)

Inkweld is a collaborative document editing platform designed for creative writing, worldbuilding, and technical documentation. Built with Angular (frontend) and NestJS (backend), Inkweld provides real-time collaboration features similar to Google Docs, but with enhanced organization capabilities tailored for complex projects.

## About

Inkweld is ideal for:

- **Creative Writing**: Collaborate on novels, short stories, and screenplays with real-time editing and version control  
- **Worldbuilding**: Organize and develop fictional worlds with hierarchical document structures
- **Technical Documentation**: Maintain up-to-date documentation with multiple contributors
- **Research Projects**: Collaborate on academic papers and research notes

Key Features:

- Real-time collaborative editing
- Hierarchical project organization
- Offline editing with automatic sync
- Rich text formatting and styling
- Version history and change tracking
- User permissions and access control
- Extensible through MCP integrations

## Project Setup

Note: [Bun 1.2+](https://bun.sh/) and [NodeJS 20+](https://nodejs.org/en) are required.

To set up the project, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/bobbyquantum/inkweld.git
   cd inkweld
   ```

2. Install dependencies:

   ```bash
   npm run install-all
   ```

3. Set up environment variables:
   - Copy the `.env.example` file to `.env` and update the values as needed.

  >There are vscode workspaces available. For general development or trying it out, it's recommended to load the full workspace with backend and frontend folders configured.

## Development Server

To start the development server, run the following command:

```bash
npm start
```

This will start both the frontend and backend servers.  There is also a compound debug task available.

## Build

To build the project, run the following command:

```bash
npm run build
```

The build artifacts for the frontend will be stored in the `frontend/dist/` directory, and the backend build will be stored in the `server/dist/` directory.

## Docker Compose

To build with docker compose

```bash
npm run compose:up:prod
```

## Running Tests

To run tests for both the frontend and backend, use the following command:

```bash
npm test
```

This will execute the unit tests for both the frontend and backend projects.

## Production Readiness Checklist

### Core Functionality

- [x] Basic document editing with Prosemirror over YJS
- [x] In-browser IndexedDB storage
- [x] Backend LevelDB storage
- [ ] Complete import/export to archive functionality (partially done)
- [ ] Add project renaming and slug changing capabilities
- [ ] Implement templated worldbuilding features (character/location templates)
- [ ] Enhance collaborative editing features

### Content Export

- [ ] Implement PDF export functionality
- [ ] Develop EPUB export capability
- [ ] Add Markdown export options
- [ ] Create print-friendly formatting

### User Experience

- [ ] Develop improved onboarding for first-time users
- [ ] Enable username changes and profile customization
- [ ] Enhance user dashboard/homepage
- [ ] Optimize responsive design for mobile devices
- [ ] Add MCP support for optional AI collaboration.

### Authentication & Security

- [x] Basic password authentication
- [x] GitHub OAuth integration
- [ ] Add additional OAuth providers beyond GitHub
- [ ] Implement enhanced security features
- [ ] Refine user permissions system
- [ ] Add session management capabilities

### Open Source Project Structure

- [ ] Create GitHub templates (issues, PRs, etc.)
- [ ] Develop comprehensive contributor documentation
- [ ] Add code of conduct and contribution guidelines
- [ ] Set up automated project boards

### DevOps & Deployment

- [x] Docker support with working Dockerfile
- [x] Docker Compose configuration
- [x] Support for SQLite and PostgreSQL databases
- [x] Basic CI that runs tests
- [ ] Enhance CI/CD pipeline
- [ ] Optimize Docker build process
- [ ] Develop self-hosting documentation
- [ ] Implement monitoring and logging

## Project View on AI and Creative Writing

This project aims to empower writers to make their own decisions regarding AI.

The software is designed to be self hosted, and secure.  There are no backdoors, and it is not a publishing/distribution platform, so if you set this up and your own instance, your content will not be sold, scraped, borrowed or stolen.
