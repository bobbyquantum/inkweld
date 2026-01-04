---
id: configuration
title: Configuration
description: Complete guide to all environment variables, settings, and customization options for Inkweld.
sidebar_position: 4
---

# Configuration

This guide covers all configuration options for Inkweld, from essential security settings to optional features like AI integration.

## Configuration Methods

Inkweld loads configuration from environment variables. You can set these using:

### Environment File (Recommended)

Create a `.env` file at the project root:

```bash
cp .env.example .env
```

The backend searches for `.env` in this order:
1. `backend/.env`
2. `.env` (project root - **recommended**)
3. `~/.inkweld/.env` (user config directory)

### Docker Environment

Pass environment variables directly:

```bash
docker run -e SESSION_SECRET=your-key -e PORT=8333 ...
```

Or use an env file:

```bash
docker run --env-file .env ...
```

### Cloudflare Workers

Configure in `wrangler.toml`:

```toml
[env.production.vars]
NODE_ENV = "production"
ALLOWED_ORIGINS = "https://yoursite.com"
```

Secrets are set via Wrangler:

```bash
wrangler secret put SESSION_SECRET --env production
```

---

## Essential Configuration

These settings are required for production deployments.

### SESSION_SECRET

**Required** | String (32+ characters)

The cryptographic key used to sign session cookies and encrypt sensitive data.

```bash
SESSION_SECRET=your-super-secret-key-at-least-32-characters-long
```

:::danger Critical Security Setting
- Use a strong, random value (at least 32 characters)
- Never commit this to version control
- Changing this invalidates all existing sessions
- If used for database encryption, changing it makes existing encrypted data unreadable
:::

Generate a secure secret:

```bash
openssl rand -base64 32
```

### ALLOWED_ORIGINS

**Required for production** | Comma-separated URLs

Specifies which origins can make requests to the API (CORS).

```bash
# Single origin
ALLOWED_ORIGINS=https://inkweld.yoursite.com

# Multiple origins
ALLOWED_ORIGINS=https://inkweld.yoursite.com,https://app.yoursite.com

# Development (includes localhost)
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8333
```

---

## Server Configuration

### PORT

**Default:** `8333` | Number

The HTTP port the server listens on.

```bash
PORT=8333
```

### HOST

**Default:** `0.0.0.0` | String

The network interface to bind to.

```bash
HOST=0.0.0.0      # All interfaces (default)
HOST=127.0.0.1    # Localhost only
```

### NODE_ENV

**Default:** `development` | `development` | `production` | `staging`

Controls various behaviors like logging verbosity and security settings.

```bash
NODE_ENV=production
```

### LOG_LEVEL

**Default:** `debug` (development) / `info` (production) | `debug` | `info` | `warn` | `error` | `none`

Controls the verbosity of server logs.

```bash
LOG_LEVEL=debug    # All logs (default in development)
LOG_LEVEL=info     # Info and above (default in production)
LOG_LEVEL=warn     # Warnings and errors only
LOG_LEVEL=error    # Errors only
LOG_LEVEL=none     # Disable logging
```

**Log Output Format:**
- **Development**: Human-readable, colored output to the terminal
- **Production**: Structured JSON for log aggregators (Docker, Cloudflare, etc.)

**Features:**
- Request correlation IDs (`X-Correlation-ID` header) for tracing
- Automatic timing of request/response cycles
- Structured error logging with stack traces

---

## Database Configuration

### DB_TYPE

**Default:** `sqlite` | `sqlite` | `d1`

The database backend to use.

```bash
DB_TYPE=sqlite    # Local SQLite (Docker, Native)
DB_TYPE=d1        # Cloudflare D1
```

### DB_PATH

**Default:** `./sqlite.db` | File path

Location of the SQLite database file (only used when `DB_TYPE=sqlite`).

```bash
DB_PATH=./data/inkweld.db
```

### DATA_PATH

**Default:** `./data` | Directory path

Base directory for all data storage, including:
- Per-project LevelDB instances (Yjs documents)
- User-uploaded files (if not using R2)
- Temporary files

```bash
DATA_PATH=/var/lib/inkweld/data
```

---

## Authentication

### USER_APPROVAL_REQUIRED

**Default:** `true` | Boolean

When enabled, new user registrations require admin approval before they can access the platform.

```bash
USER_APPROVAL_REQUIRED=true     # Recommended for production
USER_APPROVAL_REQUIRED=false    # Open registration
```

### COOKIE_DOMAIN

**Default:** Auto-detected | String

The domain for session cookies. Usually not needed unless you're running multiple subdomains.

```bash
COOKIE_DOMAIN=.yoursite.com
```

---

## GitHub OAuth

Enable users to sign in with their GitHub accounts.

### GITHUB_ENABLED

**Default:** `false` | Boolean

```bash
GITHUB_ENABLED=true
```

### GITHUB_CLIENT_ID

**Required if GitHub enabled** | String

Your GitHub OAuth App client ID.

```bash
GITHUB_CLIENT_ID=Iv1.abc123def456
```

### GITHUB_CLIENT_SECRET

**Required if GitHub enabled** | String

Your GitHub OAuth App client secret.

```bash
GITHUB_CLIENT_SECRET=secret123...
```

### GITHUB_CALLBACK_URL

**Default:** Auto-generated | URL

The OAuth callback URL. Auto-generated from your server URL if not set.

```bash
GITHUB_CALLBACK_URL=https://inkweld.yoursite.com/api/auth/github/callback
```

### Setting Up GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** Inkweld (or your instance name)
   - **Homepage URL:** `https://inkweld.yoursite.com`
   - **Callback URL:** `https://inkweld.yoursite.com/api/auth/github/callback`
4. Copy the Client ID and Client Secret to your configuration

---

## Default Admin User

Bootstrap your instance with an initial admin user.

### DEFAULT_ADMIN_USERNAME

**Optional** | String

Username for the default admin account (created on first startup).

```bash
DEFAULT_ADMIN_USERNAME=admin
```

### DEFAULT_ADMIN_PASSWORD

**Optional** | String

Password for the default admin account.

```bash
DEFAULT_ADMIN_PASSWORD=your-secure-admin-password
```

:::tip First User Alternative
If you don't set a default admin, the first user to register automatically becomes an administrator.
:::

---

## Frontend Serving

### SERVE_FRONTEND

**Default:** `true` | Boolean

Whether the backend should serve the embedded Angular frontend.

```bash
SERVE_FRONTEND=true     # Serve frontend (bundled binary)
SERVE_FRONTEND=false    # API-only mode
```

Set to `false` when:
- Hosting frontend separately (e.g., Cloudflare Pages)
- Running in API-only mode for integrations

### FRONTEND_DIST

**Optional** | Directory path

Serve frontend from an external directory instead of embedded assets.

```bash
FRONTEND_DIST=/app/frontend/dist
```

---

## AI Features

### OPENAI_API_KEY

**Optional** | String

Enable AI-powered features like content suggestions and image generation.

```bash
OPENAI_API_KEY=sk-...
```

Features enabled with this key:
- AI writing assistance
- Content linting suggestions
- DALL-E image generation

See the [AI Image Generation guide](./admin-guide/ai-image-generation) for detailed setup.

---

## Advanced: Real-time Collaboration

These settings control the Yjs real-time collaboration system. Most deployments don't need to change these.

### GC (Garbage Collection)

**Default:** `true` | Boolean

Enable garbage collection for Yjs documents to reclaim memory.

```bash
GC=true
```

### CALLBACK_URL

**Optional** | URL

Webhook URL called when Yjs documents are updated.

```bash
CALLBACK_URL=http://localhost:8333/yjs-callback
```

### CALLBACK_TIMEOUT

**Default:** `5000` | Milliseconds

Timeout for Yjs callback requests.

### CALLBACK_DEBOUNCE_WAIT

**Default:** `2000` | Milliseconds

Debounce wait time before triggering callbacks.

### CALLBACK_DEBOUNCE_MAXWAIT

**Default:** `10000` | Milliseconds

Maximum wait time for debounced callbacks.

---

## Example Configurations

### Development

```bash
PORT=8333
NODE_ENV=development
SESSION_SECRET=dev-secret-key-for-local-testing-only
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8333
DB_TYPE=sqlite
DATA_PATH=./data
USER_APPROVAL_REQUIRED=false
```

### Production (Docker)

```bash
PORT=8333
NODE_ENV=production
SESSION_SECRET=<generated-32-char-secret>
ALLOWED_ORIGINS=https://inkweld.yourcompany.com
DB_TYPE=sqlite
DB_PATH=/data/inkweld.db
DATA_PATH=/data
USER_APPROVAL_REQUIRED=true
GITHUB_ENABLED=true
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>
```

### Production (Cloudflare)

In `wrangler.toml`:

```toml
[env.production.vars]
NODE_ENV = "production"
PORT = "8333"
DB_TYPE = "d1"
ALLOWED_ORIGINS = "https://inkweld.yourcompany.com"
USER_APPROVAL_REQUIRED = "true"
GITHUB_ENABLED = "false"
```

Set secrets via Wrangler:

```bash
wrangler secret put SESSION_SECRET --env production
```

---

## Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | Required | Session encryption key (32+ chars) |
| `ALLOWED_ORIGINS` | Required | Comma-separated CORS origins |
| `PORT` | `8333` | HTTP server port |
| `HOST` | `0.0.0.0` | Network interface to bind |
| `NODE_ENV` | `development` | Environment mode |
| `DB_TYPE` | `sqlite` | Database type (`sqlite` or `d1`) |
| `DB_PATH` | `./sqlite.db` | SQLite file path |
| `DATA_PATH` | `./data` | Data storage directory |
| `USER_APPROVAL_REQUIRED` | `true` | Require admin approval for new users |
| `GITHUB_ENABLED` | `false` | Enable GitHub OAuth |
| `GITHUB_CLIENT_ID` | - | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | - | GitHub OAuth client secret |
| `GITHUB_CALLBACK_URL` | Auto | GitHub OAuth callback URL |
| `DEFAULT_ADMIN_USERNAME` | - | Initial admin username |
| `DEFAULT_ADMIN_PASSWORD` | - | Initial admin password |
| `SERVE_FRONTEND` | `true` | Serve embedded frontend |
| `FRONTEND_DIST` | - | External frontend path |
| `OPENAI_API_KEY` | - | OpenAI API key for AI features |
| `COOKIE_DOMAIN` | Auto | Cookie domain |
| `GC` | `true` | Yjs garbage collection |

---

## Next Steps

- **[Admin CLI](./admin-guide/admin-cli)** - Manage users and settings from the command line
- **[AI Image Generation](./admin-guide/ai-image-generation)** - Set up AI-powered features
- **[Troubleshooting](./troubleshooting/cookies)** - Common issues and solutions
