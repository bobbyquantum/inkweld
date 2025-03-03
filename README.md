# Worm Project

Worm is a collaborative document editing platform designed for creative writing, worldbuilding, and technical documentation. Built with Angular (frontend) and NestJS (backend), Worm provides real-time collaboration features similar to Google Docs, but with enhanced organization capabilities tailored for complex projects.

## About

Worm is ideal for:

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

To set up the project, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/bobbyquantum/worm.git
   cd worm
   ```

2. Install dependencies:

   ```bash
   npm run install-all
   ```

3. Set up environment variables:
   - Copy the `.env.example` file to `.env` and update the values as needed.

## Development Server

To start the development server, run the following command:

```bash
npm start
```

This will start both the frontend and backend servers. The backend will listen on port 8333 and proxy the frontend. You can connect to this URL for both front and back end provided both servers are running.

## Build

To build the project, run the following command:

```bash
npm run build
```

The build artifacts for the frontend will be stored in the `frontend/dist/` directory, and the backend build will be stored in the `worm-server/dist/` directory.

## Running Tests

To run tests for both the frontend and backend, use the following command:

```bash
npm test
```

This will execute the unit tests for both the frontend and backend projects.
