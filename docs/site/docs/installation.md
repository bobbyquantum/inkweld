---
id: installation
title: Installation
description: Install Inkweld locally for development or personal use.
sidebar_position: 3
---

## Quick Start with Docker

The fastest way to try Inkweld is with Docker:

```bash
docker run -p 8333:8333 \
  -v inkweld_data:/data \
  -e SESSION_SECRET=your-secret-key-min-32-characters-long \
  -e CLIENT_URL=http://localhost:8333 \
  ghcr.io/bobbyquantum/inkweld:latest
```

Then open [http://localhost:8333](http://localhost:8333) in your browser.

## Prerequisites

For local development or custom deployments, you'll need:

- **Git** - Version control
- **Node.js 20+** - Required for Angular frontend development
- **Bun 1.3+** - Backend runtime and package manager
- **Docker** (optional) - For containerized deployment

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
```

### 2. Install Dependencies

```bash
bun install
```

This installs packages for both frontend and backend.

### 3. Configure Environment

Create your environment configuration at the project root:

```bash
cp .env.example .env
```

Edit `.env` and set required values:

```bash
# Required
SESSION_SECRET=your-super-secret-key-at-least-32-characters
CLIENT_URL=http://localhost:4200

# Database (defaults to SQLite)
DB_TYPE=sqlite
DB_PATH=./data/inkweld.db

# Data storage
DATA_PATH=./data
```

### 4. Start Development Servers

From the repo root:

```bash
npm start
```

This starts:

- Backend on [http://localhost:8333](http://localhost:8333)
- Frontend on [http://localhost:4200](http://localhost:4200)

Or start them individually:

```bash
# Backend
cd backend
bun run dev

# Frontend (in another terminal)
cd frontend
npm start
```

### 5. Create Your First User

Visit [http://localhost:4200](http://localhost:4200) and click "Sign Up" to create an account.

By default, new users require admin approval. To approve users:

```bash
cd backend
bun run admin users pending
bun run admin users approve <username>
```

Or disable user approval in your `.env`:

```bash
USER_APPROVAL_REQUIRED=false
```

## Database Options

### SQLite (Default)

Perfect for single-server deployments. This is the recommended option for most use cases:

```bash
DB_TYPE=sqlite
DB_PATH=./data/inkweld.db
```

### Cloudflare D1

For Cloudflare Workers deployments:

```bash
DB_TYPE=d1
```

See [Cloudflare deployment](./hosting/cloudflare) for D1 configuration.

## Next Steps

- Learn about [hosting options](./hosting/docker) for production deployments
- Explore [features](./features) available in Inkweld
- Check the [user guide](./user-guide/projects) to start writing
- Review [developer documentation](./developer/architecture) for customization

## Troubleshooting

### Port Already in Use

If port 8333 or 4200 is already in use, you can change them:

```bash
# Backend
PORT=3000 bun run dev

# Frontend - edit angular.json or use:
ng serve --port 4201
```

### Database Connection Errors

Ensure the data directory exists and is writable:

```bash
mkdir -p backend/data
chmod 755 backend/data
```

### Permission Issues

On Linux/Mac, ensure the data directory is writable:

```bash
mkdir -p backend/data
chmod 755 backend/data
```

Need more help? Check the [troubleshooting guide](./troubleshooting/cookies) or [open an issue](https://github.com/bobbyquantum/inkweld/issues).
