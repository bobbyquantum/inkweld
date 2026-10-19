---
id: configuration
title: Configuration
description: Complete guide to all environment variables, settings, and customization options for Inkweld.
sidebar_position: 4
---

# Configuration

This guide covers all configuration options for Inkweld, from essential security settings to optional features like AI integration.

## Configuration Methods

Inkweld reads its configuration from environment variables. Many settings
(authentication, email, AI, appearance, legal pages, sync capacity) can also be
changed later in **Admin → Settings**. For those, a value saved in the admin UI
wins over the environment variable, and the environment variable wins over the
built-in default. Environment values are read live; they are never copied into
the database, so removing a saved admin value falls back to the environment
again.

You can set environment variables using:

### Environment File (Recommended)

Create a `.env` file at the project root:

```bash
cp .env.example .env
```

The Bun server loads the **first** `.env` file it finds, in this order (files
are not merged):

1. `.env` in the current working directory (e.g. `backend/.env` when started from `backend/`)
2. `../.env` (the project root when started from `backend/`)
3. The repository root `.env`
4. `~/.inkweld/.env` (`%APPDATA%\Inkweld\.env` on Windows)

Variables already set in the process environment always take precedence over
the file.

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

Configure in `backend/wrangler.toml` (copy `backend/wrangler.toml.example`):

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

**Required outside development** | String (32+ characters)

The key used to sign session tokens (JWTs) and to encrypt sensitive values
stored in the database, such as API keys saved in Admin → Settings.

The server refuses to start without a secret of at least 32 characters
whenever `NODE_ENV` is anything other than `development` or `test` (including
`production`, `preview` or `staging`). In development it falls back to a
public, well-known key and logs a warning — never expose such a server.

```bash
SESSION_SECRET=<run: openssl rand -hex 32>
```

:::danger[Critical Security Setting]

- Use a strong, random value (at least 32 characters)
- Never commit this to version control
- Changing this invalidates all existing sessions
- If used for database encryption, changing it makes existing encrypted data unreadable
  :::

Generate a secure secret:

```bash
openssl rand -hex 32
```

### DATABASE_KEY

**Optional** | String (32+ characters)

Overrides `SESSION_SECRET` for both token signing and database encryption. When
neither is set the rules above apply to whichever one is present. Most
deployments only set `SESSION_SECRET`.

### ALLOWED_ORIGINS

**Default:** `http://localhost:4200` | Comma-separated URLs

Specifies which origins can make requests to the API (CORS). Set it to every
URL users open Inkweld from: it is also used as the expected origin for passkey
sign-in, and its first entry is the fallback public URL for email links.

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

The server always listens on all interfaces. To restrict it to localhost,
bind the port in Docker (`-p 127.0.0.1:8333:8333`) or use a firewall.

### NODE_ENV

**Default:** `development` | String

`development` and `test` (or leaving it unset) are treated as development: a
missing `SESSION_SECRET` is allowed. Any other value (`production`, `preview`,
`staging`, …) requires a secret.

Logging is stricter: human-readable `debug` logs only appear when `NODE_ENV` is
explicitly `development` or `test`. Anything else, including an unset
`NODE_ENV`, logs JSON at `info`. See [Logging](./troubleshooting/logging).

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

See [Logging](./troubleshooting/logging) for details.

**Log Output Format:**

- **Development**: Human-readable, colored output to the terminal
- **Production**: Structured JSON for log aggregators (Docker, Cloudflare, etc.)

**Features:**

- Request correlation IDs (`X-Correlation-ID` header) for tracing
- Automatic timing of request/response cycles
- Structured error logging with stack traces

### TRUST_PROXY

**Default:** `false` | Boolean

Set to `true` when Inkweld runs behind a reverse proxy (nginx, Caddy, Traefik,
Cloudflare Tunnel) that overwrites `X-Forwarded-For`. Inkweld then uses the
right-most `X-Forwarded-For` entry as the client IP for rate limiting and audit
logs. Leave it `false` when clients can reach the server directly: otherwise
anyone can pick their own IP and escape the login rate limit. Cloudflare
Workers always use `CF-Connecting-IP` and ignore this setting.

```bash
TRUST_PROXY=true
```

### TLS_ENABLED / TLS_CERT_PATH / TLS_KEY_PATH

**Default:** `false`, `./certs/cert.pem`, `./certs/key.pem` | Bun server only

Serve HTTPS directly from the Bun server. If either file is missing the server
logs a warning and starts without TLS. Most deployments terminate TLS at a
reverse proxy instead.

---

## Database Configuration

The Bun server always uses SQLite; Cloudflare Workers always use the D1
database bound in `wrangler.toml`. `DB_TYPE` still appears in some example
files but does not change anything.

### DB_PATH

**Default:** `<DATA_PATH>/inkweld.db` | File path

Location of the SQLite database file. The Docker image sets it to
`/data/sqlite.db`.

```bash
DB_PATH=./data/inkweld.db
```

### DATA_PATH

**Default:** `./data` | Directory path

Base directory for all data storage, including:

- Per-project LevelDB instances (Yjs documents)
- Uploaded media, covers, avatars and published files
- The SQLite database, unless `DB_PATH` is set

The Docker image sets it to `/data/yjs`.

```bash
DATA_PATH=/var/lib/inkweld/data
```

---

## Authentication

### USER_APPROVAL_REQUIRED

**Default:** `true` | Boolean

When enabled, new user registrations require admin approval before they can access the platform.

```bash
USER_APPROVAL_REQUIRED=true     # Admin approval required (default)
USER_APPROVAL_REQUIRED=false    # Open registration
```

### REQUIRE_EMAIL

**Default:** `false` | Boolean

Require an email address when registering. Needed if you want users to be able
to recover their account by email.

### Password rules

Only apply when `PASSWORD_LOGIN_ENABLED=true`.

| Variable                     | Default | Meaning                              |
| ---------------------------- | ------- | ------------------------------------ |
| `PASSWORD_MIN_LENGTH`        | `8`     | Minimum length                       |
| `PASSWORD_REQUIRE_UPPERCASE` | `true`  | Require an uppercase letter          |
| `PASSWORD_REQUIRE_LOWERCASE` | `true`  | Require a lowercase letter           |
| `PASSWORD_REQUIRE_NUMBER`    | `true`  | Require a digit                      |
| `PASSWORD_REQUIRE_SYMBOL`    | `true`  | Require a symbol such as `! @ # $ %` |

---

## Passkeys (WebAuthn)

Enable passwordless sign-in via device biometrics or security keys.

### WEBAUTHN_RP_ID

**Required for production** | String | Default: `localhost`

The WebAuthn Relying Party ID — the effective domain of your deployment (no protocol or port). Must match the domain users access Inkweld from.

```bash
WEBAUTHN_RP_ID=inkweld.yourcompany.com
```

:::danger[Cannot change after users register passkeys]
Changing this value invalidates all existing passkeys.
:::

### WEBAUTHN_RP_NAME

**Optional** | String | Default: `Inkweld`

Human-readable name shown in the browser passkey registration prompt.

```bash
WEBAUTHN_RP_NAME="Acme Writing Platform"
```

### PASSKEYS_ENABLED

**Default:** `true` | Boolean

Master switch for passkey support. When `false`, the passkey UI is hidden, the passkey endpoints return 403 and the passkey recovery endpoints return 404.

```bash
PASSKEYS_ENABLED=true
```

### PASSWORD_LOGIN_ENABLED

**Default:** `false` | Boolean

Allow username/password sign-in. When `false` (default), Inkweld is passwordless-first: the `/login` endpoint returns 403 for password attempts, registration omits the password field and immediately enrols a passkey, and the forgot/reset password endpoints return 404. Set to `true` to restore classic password auth alongside passkeys.

```bash
PASSWORD_LOGIN_ENABLED=true
```

:::warning
Flipping from `true` to `false` locks out any user who has a password but no passkey, unless `EMAIL_RECOVERY_ENABLED` is also `true`.
:::

### EMAIL_RECOVERY_ENABLED

**Default:** `false` | Boolean

Enable email-based account recovery. When passwords are disabled, this powers a magic-link flow that lets users enrol a new passkey. When passwords are enabled, it powers the classic forgot-password flow. Requires SMTP settings to deliver emails.

```bash
EMAIL_RECOVERY_ENABLED=true
```

### ALLOW_INKWELD_APP_CLIENT

**Default:** `false` | Boolean

Let the official app at `https://inkweld.app` sign in to this server, including
with passkeys. See
[Sign-in from the Official App](./admin-guide/official-app).

See the [Passkeys admin guide](./admin-guide/passkeys) for full setup instructions.

---

## Sync Capacity

Per-user limits on server storage. See the [Sync Capacity admin guide](./admin-guide/sync-capacity) for what counts and what is blocked. Both values can also be changed in **Admin → Settings**.

### SYNC_QUOTA_ENABLED

**Default:** `false` | Boolean

Enforce per-user sync capacity. When `true`, media uploads, published files and new projects are refused once an account reaches its allowance. Editing and syncing existing work are never blocked. When `false`, usage is still measured and shown to users.

```bash
SYNC_QUOTA_ENABLED=true
```

### SYNC_QUOTA_DEFAULT_BYTES

**Default:** `104857600` (100 MB) | Integer (bytes)

Allowance for every account without its own. Admins can give individual users a different allowance. Values above 1 TiB, negative or non-numeric values fall back to the default.

```bash
SYNC_QUOTA_DEFAULT_BYTES=524288000
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

**Default:** Derived from the request | URL

The OAuth callback URL. When unset, Inkweld builds it from the host and
protocol of the incoming request (honouring `X-Forwarded-Proto`), so you only
need it when that would be wrong.

```bash
GITHUB_CALLBACK_URL=https://inkweld.yoursite.com/api/v1/auth/github
```

### Setting Up GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** Inkweld (or your instance name)
   - **Homepage URL:** `https://inkweld.yoursite.com`
   - **Callback URL:** `https://inkweld.yoursite.com/api/v1/auth/github`
4. Copy the Client ID and Client Secret to your configuration

See the [GitHub OAuth guide](./admin-guide/github-oauth) for details.

---

## Home Assistant Ingress

Used by the Inkweld Home Assistant app, which serves the UI in the HA sidebar
through ingress. Home Assistant signs people in, and Inkweld maps each HA user
to an Inkweld account (created on first visit, linked by HA user id).

### INGRESS_ENABLED

**Default:** `false` | Boolean

Trust Home Assistant's ingress headers (`X-Ingress-Path`, `X-Remote-User-*`)
on requests whose TCP peer is `INGRESS_TRUSTED_PROXY`. Requests from anywhere
else are treated normally, so a direct port can stay open alongside ingress.

### INGRESS_TRUSTED_PROXY

**Required with `INGRESS_ENABLED`** | IP address

The Supervisor's ingress proxy. The Home Assistant app sets it to
`172.30.32.2`; without it, no request is treated as ingress.

### INGRESS_ADMINS

**Default:** empty | Comma-separated HA usernames

HA users who are Inkweld admins, applied on every ingress sign-in (granted
and revoked; the last active admin is never demoted). When empty, the first
account on the instance becomes admin.

---

## Default Admin User

Bootstrap your instance with an initial admin user. Both variables must be set;
the account is created on startup by the Bun server if it does not exist yet.
Cloudflare Workers deployments don't seed an admin — the first user to register
becomes administrator.

Password sign-in is off by default (`PASSWORD_LOGIN_ENABLED=false`), so set
`PASSWORD_LOGIN_ENABLED=true` as well if you want to sign in with this password.

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

:::tip[First User Alternative]
If you don't set a default admin, the first user to register automatically becomes an administrator.
:::

---

## Application Mode

### APP_MODE

**Default:** `BOTH` | `ONLINE` | `LOCAL` | `BOTH`

Controls which kinds of profile people may add in the app served by this server. It applies on the setup screen at first run and everywhere a profile can be added later: **Add profile** in the user menu, the profile manager, and its upgrade options.

```bash
APP_MODE=ONLINE    # Server profiles only (no Browser or Cloud Sync)
APP_MODE=LOCAL     # Browser and Cloud Sync profiles only (no server)
APP_MODE=BOTH      # Anything (default)
```

- **`ONLINE`** hides Browser and Cloud Sync. Cloud Sync keeps writing in the browser and mirrors it to the user's own cloud storage, so it counts as a browser profile here.
- **`LOCAL`** hides adding a server. Cloud Sync is still offered when the build has a provider configured.

In the app these settings read as:

| `APP_MODE`       | Users can add                   | Users cannot add                |
| ---------------- | ------------------------------- | ------------------------------- |
| `ONLINE`         | Server profiles                 | Browser and Cloud Sync profiles |
| `LOCAL`          | Browser and Cloud Sync profiles | Server profiles                 |
| `BOTH` (default) | All three                       | Nothing                         |

`LOCAL` is a legacy name: it means "no Inkweld Server", not the old "Local Mode" label (now **Browser profile**).

Profiles that already exist on a device are never removed or locked: someone who made a Browser profile before you switched to `ONLINE` can still open it, reconnect a Cloud Sync account that lost its credentials, and move its projects to a server. Only creating new profiles of a forbidden kind is refused.

**Which server decides.** The policy comes from the server the app belongs to, not from whichever profile happens to be active:

- the server that serves the frontend (Docker, native binary, Home Assistant ingress), or
- the server a hosted frontend build points at (its `apiUrl`, e.g. a Cloudflare Pages frontend with a Workers backend).

Servers added later as extra profiles do not change what the app offers.

The app remembers the last mode it was told. If the server can't be reached, that remembered mode stays in force, so an outage never unlocks Browser profiles on an `ONLINE` site. A browser that has never reached the server (and so has nothing remembered) offers everything until it does.

Browser and Cloud Sync profiles never contact a server on their own, and this doesn't change that: the app asks for the mode when someone opens the setup screen, the upgrade choices or the add-server form, and in the background only while a server profile is active.

:::note[APP_MODE and auto-configuration]
`APP_MODE` is a policy; a hosted build's `autoConfigure` setting is only a first-run convenience that connects new visitors straight to the hosted server. Auto-configuration on its own does not stop anyone adding a Browser profile later. Set `APP_MODE=ONLINE` for that.
:::

### DEFAULT_SERVER_NAME

**Optional** | URL

Server URL suggested to the setup screen, and the fallback public URL for email
links when `SITE_URL` is unset.

### BASE_URL

**Default:** Derived from the request | URL

Public URL of the API, used in the MCP OAuth discovery metadata
(`/.well-known/oauth-*`) that MCP clients read. Set it when the server sits
behind a proxy that changes the host or protocol, or on Cloudflare Workers.

### MCP_ENABLED

**Default:** `true` | Boolean

Allow MCP clients to connect to projects. The AI kill switch still takes
precedence: when it is on, MCP is off regardless of this setting. See
[MCP Clients](/user-guide/ai-mcp/mcp-clients).

### MCP_MAX_DYNAMIC_CLIENTS

**Default:** `500` | Integer

Cap on MCP OAuth clients registered through dynamic client registration.
Abandoned clients (no session after 24 hours) are pruned.

---

## Email / SMTP

SMTP configuration for account recovery emails, magic-link passkey recovery, and password resets.

### EMAIL_ENABLED

**Default:** `false` | Boolean

Master switch for email delivery. When `false`, the email service short-circuits and no emails are sent. Set to `true` to enable any email feature.

```bash
EMAIL_ENABLED=true
```

### EMAIL_HOST

**Required if email enabled** | String

SMTP host (e.g. `smtp.sendgrid.net`, `smtp.mailgun.org`).

```bash
EMAIL_HOST=smtp.sendgrid.net
```

### EMAIL_PORT

**Default:** `587` | Number

SMTP port. Use `587` for STARTTLS, `465` for implicit TLS, or `25` for no encryption.

```bash
EMAIL_PORT=587
```

### EMAIL_ENCRYPTION

**Default:** `starttls` | `starttls` | `tls` | `none`

Must match the chosen port.

```bash
EMAIL_ENCRYPTION=starttls
```

### EMAIL_USERNAME / EMAIL_PASSWORD

**Optional** | String

SMTP credentials. Leave blank for unauthenticated relays (e.g., inside a VPC).

```bash
EMAIL_USERNAME=apikey
EMAIL_PASSWORD=your-smtp-password
```

### EMAIL_FROM

**Required if email enabled** | String

Envelope From address. Must be a domain you're authorised to send from (SPF/DKIM).

```bash
EMAIL_FROM=noreply@example.com
```

### EMAIL_FROM_NAME

**Default:** `Inkweld` | String

Display name shown to email recipients.

```bash
EMAIL_FROM_NAME="My Inkweld"
```

:::tip[Test your email setup]
After configuring SMTP, verify it works by triggering a password reset or recovery email. Check the server logs for SMTP errors if messages don't arrive.
:::

### SITE_URL

**Default:** - | URL

Public URL of your instance, used to build links in emails (password resets,
passkey recovery, welcome emails). Include the protocol. When unset, Inkweld
falls back to `DEFAULT_SERVER_NAME`, then the first `ALLOWED_ORIGINS` entry.

```bash
SITE_URL=https://inkweld.example.com
```

---

## Legal Pages & Custom HTML

These can also be set in **Admin → Settings**; values saved there take
precedence. See [Legal Pages & Custom HTML](./admin-guide/custom-html.md).

### PRIVACY_POLICY_CONTENT / TERMS_OF_SERVICE_CONTENT

**Default:** - | Markdown

Text of your privacy policy and terms of service, hosted at `/privacy` and
`/terms`. Takes precedence over the matching URL.

### PRIVACY_POLICY_URL / TERMS_OF_SERVICE_URL

**Default:** - | URL

Where `/privacy` and `/terms` redirect when no text is set. Leave both the text
and the URL unset to hide a document.

```bash
PRIVACY_POLICY_URL=https://example.com/privacy
TERMS_OF_SERVICE_URL=https://example.com/terms
```

### REQUIRE_POLICY_ACCEPTANCE

**Default:** `false` | Boolean

Require new users to accept the documents when registering, and ask everyone to
accept again whenever the text or a URL changes. Has no effect until at least
one document is set.

### CUSTOM_HEAD_HTML / CUSTOM_BODY_HTML

**Default:** - | HTML

Raw HTML injected into `<head>` and at the end of `<body>` of every page the
Inkweld server serves — for analytics, consent managers or verification meta
tags. **Not sanitized.** Has no effect when the frontend is served elsewhere
(Cloudflare Pages, or `SERVE_FRONTEND=false`).

### CONTENT_SECURITY_POLICY_MODE

**Default:** `enforce` | `enforce`, `report-only` or `off`

The Content-Security-Policy sent with the app page. `enforce` blocks scripts
the policy doesn't allow; `report-only` only logs them in the browser console;
`off` sends no policy. Scripts in the custom HTML above are allowed
automatically. See
[Content Security Policy](./admin-guide/custom-html.md#content-security-policy).

### CONTENT_SECURITY_POLICY_TRUSTED_SOURCES

**Default:** - | Space-separated origins

Extra origins allowed to serve scripts, styles, fonts and frames — needed when
custom HTML loads more scripts at runtime, as tag managers and chat widgets do.

```bash
CONTENT_SECURITY_POLICY_TRUSTED_SOURCES="https://www.googletagmanager.com https://*.example-widget.com"
```

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

Serve the frontend from a directory (a built `frontend/dist/browser`) instead
of the assets embedded in the binary. Takes precedence over embedded assets.
The Docker image sets it to `/app/frontend/browser`.

```bash
FRONTEND_DIST=/app/frontend/browser
```

---

## Appearance

Backgrounds for the login and home screens. Usually set in **Admin →
Appearance**; see the [Appearance guide](./admin-guide/appearance).

| Variable                         | Default | Meaning                                                            |
| -------------------------------- | ------- | ------------------------------------------------------------------ |
| `LOGIN_BACKGROUND_URL`           | -       | External `https://` image for the login screen                     |
| `HOME_BACKGROUND_URL`            | -       | External `https://` image for the home screen (and login if unset) |
| `BACKGROUND_OVERLAY_OPACITY`     | -       | Scrim opacity over the image, `0`–`0.95`                           |
| `BACKGROUND_BLUR`                | `0`     | Blur in pixels, `0`–`40`                                           |
| `USER_BACKGROUND_ENABLED`        | `true`  | Let users pick a background preset                                 |
| `USER_BACKGROUND_UPLOAD_ENABLED` | `false` | Let users upload their own background image (uses server storage)  |

---

## AI Features

All AI features are **off** until the AI kill switch is turned off. See the
[AI Kill Switch guide](./admin-guide/ai-kill-switch).

### AI_KILL_SWITCH

**Default:** `true` | Boolean

Master switch. While `true`, the app hides every AI feature and the server
refuses every AI request with `403`, whatever provider keys are set. Set it to `false` to allow them. When set in the
environment, the admin UI shows it as locked. See the
[AI Kill Switch guide](./admin-guide/ai-kill-switch) for exactly what is
enforced on the server.

### OPENAI_API_KEY

**Optional** | String

OpenAI API key, shared by image generation and AI review. Setting it also turns
the OpenAI image provider, AI image generation and AI review on by default —
once the kill switch is off.

```bash
AI_KILL_SWITCH=false
OPENAI_API_KEY=sk-...
```

`OPENAI_API_BASE` points the OpenAI provider at an OpenAI-compatible endpoint
(default `https://api.openai.com/v1`).

Other providers (OpenRouter, Anthropic, Fal.ai, Stable Diffusion, Cloudflare
Workers AI) and the model lists are easiest to set up in **Admin → AI
Providers**; their environment variables are listed in the
[reference table](#environment-variable-reference) below. See the
[AI Image Generation guide](./admin-guide/ai-image-generation) for detailed
setup.

---

## Example Configurations

### Development

```bash
PORT=8333
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8333
DATA_PATH=./data
USER_APPROVAL_REQUIRED=false
PASSWORD_LOGIN_ENABLED=true
```

### Production (Docker)

```bash
PORT=8333
NODE_ENV=production
SESSION_SECRET=<generated-32-char-secret>
ALLOWED_ORIGINS=https://inkweld.yourcompany.com
SITE_URL=https://inkweld.yourcompany.com
TRUST_PROXY=true
WEBAUTHN_RP_ID=inkweld.yourcompany.com
WEBAUTHN_RP_NAME="My Inkweld"
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
BASE_URL = "https://api.inkweld.yourcompany.com"
ALLOWED_ORIGINS = "https://inkweld.yourcompany.com"
WEBAUTHN_RP_ID = "inkweld.yourcompany.com"
USER_APPROVAL_REQUIRED = "true"
GITHUB_ENABLED = "false"
```

The D1 database, R2 bucket and Durable Object are bindings in the same file,
not variables. See [Cloudflare Workers](./installation/cloudflare).

Set secrets via Wrangler:

```bash
wrangler secret put SESSION_SECRET --env production
```

---

## Environment Variable Reference

| Variable                                                            | Default                           | Description                                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                                                    | Required outside development      | Signs session tokens and encrypts stored secrets (32+ chars)                                                                                                |
| `DATABASE_KEY`                                                      | -                                 | Overrides `SESSION_SECRET` for signing and encryption                                                                                                       |
| `ALLOWED_ORIGINS`                                                   | `http://localhost:4200`           | Comma-separated origins allowed by CORS and passkeys                                                                                                        |
| `PORT`                                                              | `8333`                            | HTTP server port                                                                                                                                            |
| `NODE_ENV`                                                          | `development`                     | Environment mode                                                                                                                                            |
| `TRUST_PROXY`                                                       | `false`                           | Trust the right-most `X-Forwarded-For` entry for client IPs                                                                                                 |
| `TLS_ENABLED`                                                       | `false`                           | Serve HTTPS from the Bun server                                                                                                                             |
| `TLS_CERT_PATH`                                                     | `./certs/cert.pem`                | TLS certificate (Bun only)                                                                                                                                  |
| `TLS_KEY_PATH`                                                      | `./certs/key.pem`                 | TLS private key (Bun only)                                                                                                                                  |
| `INKWELD_VERSION`                                                   | The release version               | Overrides the reported server version. Leave unset; the built-in value is updated with each release                                                         |
| `LOG_LEVEL`                                                         | `debug`/`info`                    | Log verbosity (`debug`, `info`, `warn`, `error`, `none`)                                                                                                    |
| `DB_PATH`                                                           | `<DATA_PATH>/inkweld.db`          | SQLite file path (Bun only)                                                                                                                                 |
| `DATA_PATH`                                                         | `./data`                          | Data storage directory (Bun only)                                                                                                                           |
| `SERVE_FRONTEND`                                                    | `true`                            | Serve the frontend from the backend                                                                                                                         |
| `FRONTEND_DIST`                                                     | -                                 | Serve the frontend from this directory instead of embedded assets                                                                                           |
| `APP_MODE`                                                          | `BOTH`                            | Which profiles can be added: `ONLINE` (server only), `LOCAL` (Browser/Cloud Sync only), or `BOTH`                                                           |
| `DEFAULT_SERVER_NAME`                                               | -                                 | Server URL suggested on the setup screen                                                                                                                    |
| `SITE_URL`                                                          | -                                 | Public URL used in email links                                                                                                                              |
| `BASE_URL`                                                          | Derived from request              | Public API URL for MCP OAuth metadata                                                                                                                       |
| `USER_APPROVAL_REQUIRED`                                            | `true`                            | Require admin approval for new users                                                                                                                        |
| `REQUIRE_EMAIL`                                                     | `false`                           | Require an email address at registration                                                                                                                    |
| `PASSWORD_MIN_LENGTH`                                               | `8`                               | Minimum password length                                                                                                                                     |
| `PASSWORD_REQUIRE_UPPERCASE / _LOWERCASE / _NUMBER / _SYMBOL`       | `true`                            | Password character rules                                                                                                                                    |
| `PASSKEYS_ENABLED`                                                  | `true`                            | Master switch for passkey (WebAuthn) support                                                                                                                |
| `PASSWORD_LOGIN_ENABLED`                                            | `false`                           | Allow username/password sign-in (passwordless-first by default)                                                                                             |
| `EMAIL_RECOVERY_ENABLED`                                            | `false`                           | Allow email-based account recovery / magic-link flow                                                                                                        |
| `ALLOW_INKWELD_APP_CLIENT`                                          | `false`                           | Let the official app at inkweld.app (in a browser or PWA) sign in, including with passkeys. See [Sign-in from the Official App](./admin-guide/official-app) |
| `WEBAUTHN_RP_ID`                                                    | `localhost`                       | WebAuthn Relying Party ID (domain only). **Set before going live** — changing it invalidates every passkey.                                                 |
| `WEBAUTHN_RP_NAME`                                                  | `Inkweld`                         | Name shown in passkey prompts                                                                                                                               |
| `GITHUB_ENABLED`                                                    | `false`                           | Enable GitHub OAuth                                                                                                                                         |
| `GITHUB_CLIENT_ID`                                                  | -                                 | GitHub OAuth client ID                                                                                                                                      |
| `GITHUB_CLIENT_SECRET`                                              | -                                 | GitHub OAuth client secret                                                                                                                                  |
| `GITHUB_CALLBACK_URL`                                               | Derived from request              | GitHub OAuth callback URL (`/api/v1/auth/github`)                                                                                                           |
| `INGRESS_ENABLED`                                                   | `false`                           | Trust Home Assistant ingress headers                                                                                                                        |
| `INGRESS_TRUSTED_PROXY`                                             | -                                 | IP of the Home Assistant ingress proxy                                                                                                                      |
| `INGRESS_ADMINS`                                                    | -                                 | HA usernames that are Inkweld admins                                                                                                                        |
| `DEFAULT_ADMIN_USERNAME`                                            | -                                 | Initial admin username (Bun only; needs the password too)                                                                                                   |
| `DEFAULT_ADMIN_PASSWORD`                                            | -                                 | Initial admin password                                                                                                                                      |
| `EMAIL_ENABLED`                                                     | `false`                           | Master switch for email delivery                                                                                                                            |
| `EMAIL_HOST`                                                        | -                                 | SMTP host                                                                                                                                                   |
| `EMAIL_PORT`                                                        | `587`                             | SMTP port                                                                                                                                                   |
| `EMAIL_ENCRYPTION`                                                  | `starttls`                        | SMTP encryption: `starttls`, `tls`, or `none`                                                                                                               |
| `EMAIL_USERNAME`                                                    | -                                 | SMTP username                                                                                                                                               |
| `EMAIL_PASSWORD`                                                    | -                                 | SMTP password                                                                                                                                               |
| `EMAIL_FROM`                                                        | -                                 | Envelope From address                                                                                                                                       |
| `EMAIL_FROM_NAME`                                                   | `Inkweld`                         | Display name shown to email recipients                                                                                                                      |
| `SYNC_QUOTA_ENABLED`                                                | `false`                           | Enforce per-user sync capacity                                                                                                                              |
| `SYNC_QUOTA_DEFAULT_BYTES`                                          | `104857600`                       | Default per-user allowance in bytes                                                                                                                         |
| `PRIVACY_POLICY_CONTENT`                                            | -                                 | Privacy policy text (Markdown) served at `/privacy`                                                                                                         |
| `PRIVACY_POLICY_URL`                                                | -                                 | Where `/privacy` redirects when no text is set                                                                                                              |
| `TERMS_OF_SERVICE_CONTENT`                                          | -                                 | Terms of service text (Markdown) served at `/terms`                                                                                                         |
| `TERMS_OF_SERVICE_URL`                                              | -                                 | Where `/terms` redirects when no text is set                                                                                                                |
| `REQUIRE_POLICY_ACCEPTANCE`                                         | `false`                           | Require users to accept the privacy policy / terms                                                                                                          |
| `CUSTOM_HEAD_HTML`                                                  | -                                 | Raw HTML injected into `<head>` (not sanitized)                                                                                                             |
| `CUSTOM_BODY_HTML`                                                  | -                                 | Raw HTML injected at the end of `<body>` (not sanitized)                                                                                                    |
| `CONTENT_SECURITY_POLICY_MODE`                                      | `enforce`                         | `enforce`, `report-only` or `off`                                                                                                                           |
| `CONTENT_SECURITY_POLICY_TRUSTED_SOURCES`                           | -                                 | Extra origins allowed by the CSP                                                                                                                            |
| `LOGIN_BACKGROUND_URL / HOME_BACKGROUND_URL`                        | -                                 | External background images                                                                                                                                  |
| `BACKGROUND_OVERLAY_OPACITY`                                        | -                                 | Background scrim opacity (`0`–`0.95`)                                                                                                                       |
| `BACKGROUND_BLUR`                                                   | `0`                               | Background blur in pixels (`0`–`40`)                                                                                                                        |
| `USER_BACKGROUND_ENABLED`                                           | `true`                            | Let users pick a background preset                                                                                                                          |
| `USER_BACKGROUND_UPLOAD_ENABLED`                                    | `false`                           | Let users upload a background image                                                                                                                         |
| `MCP_ENABLED`                                                       | `true`                            | Allow MCP clients (still off while the AI kill switch is on)                                                                                                |
| `MCP_MAX_DYNAMIC_CLIENTS`                                           | `500`                             | Cap on dynamically registered MCP OAuth clients                                                                                                             |
| `AI_KILL_SWITCH`                                                    | `true`                            | Disable all AI features when `true`                                                                                                                         |
| `OPENAI_API_KEY`                                                    | -                                 | OpenAI API key                                                                                                                                              |
| `OPENAI_API_BASE`                                                   | `https://api.openai.com/v1`       | OpenAI-compatible endpoint                                                                                                                                  |
| `OPENROUTER_API_KEY`                                                | -                                 | OpenRouter API key                                                                                                                                          |
| `ANTHROPIC_API_KEY`                                                 | -                                 | Anthropic API key (AI review)                                                                                                                               |
| `FALAI_API_KEY`                                                     | -                                 | Fal.ai API key                                                                                                                                              |
| `SD_API_ENDPOINT`                                                   | -                                 | Stable Diffusion WebUI endpoint URL                                                                                                                         |
| `SD_API_KEY`                                                        | -                                 | Stable Diffusion API key, if required                                                                                                                       |
| `WORKERSAI_ACCOUNT_ID`                                              | -                                 | Cloudflare account ID for Workers AI                                                                                                                        |
| `WORKERSAI_API_TOKEN`                                               | -                                 | Cloudflare Workers AI API token                                                                                                                             |
| `AI_IMAGE_ENABLED`                                                  | `true` if `OPENAI_API_KEY` is set | Enable AI image generation                                                                                                                                  |
| `AI_IMAGE_DEFAULT_PROVIDER`                                         | `openai`                          | `openai`, `openrouter`, `stable-diffusion`, `falai` or `workersai`                                                                                          |
| `AI_IMAGE_OPENAI_ENABLED`                                           | `true` if `OPENAI_API_KEY` is set | Enable the OpenAI image provider                                                                                                                            |
| `AI_IMAGE_OPENROUTER_ENABLED`                                       | `false`                           | Enable the OpenRouter image provider                                                                                                                        |
| `AI_IMAGE_FALAI_ENABLED`                                            | `false`                           | Enable the Fal.ai image provider                                                                                                                            |
| `AI_IMAGE_SD_ENABLED`                                               | `false`                           | Enable the Stable Diffusion image provider                                                                                                                  |
| `AI_IMAGE_WORKERSAI_ENABLED`                                        | `false`                           | Enable the Cloudflare Workers AI image provider                                                                                                             |
| `AI_IMAGE_*_MODELS`                                                 | -                                 | JSON array of models offered per provider (empty = built-in list)                                                                                           |
| `AI_IMAGE_CUSTOM_SIZES`                                             | -                                 | JSON array of custom image size profiles                                                                                                                    |
| `AI_LINT_ENABLED`                                                   | `true` if `OPENAI_API_KEY` is set | Enable AI review of documents                                                                                                                               |
| `AI_TEXT_ENABLED`                                                   | `false`                           | Enable text AI features (AI review, prompt optimisation)                                                                                                    |
| `AI_TEXT_DEFAULT_PROVIDER`                                          | -                                 | `openai`, `openrouter` or `anthropic`                                                                                                                       |
| `AI_TEXT_LINT_MODEL`                                                | -                                 | Model used for AI review                                                                                                                                    |
| `AI_TEXT_LINT_PROMPT`                                               | -                                 | Custom system prompt for AI review                                                                                                                          |
| `AI_TEXT_IMAGE_PROMPT_MODEL`                                        | -                                 | Model used to optimise image prompts                                                                                                                        |
| `AI_TEXT_IMAGE_PROMPT_TEMPLATE`                                     | -                                 | Custom system prompt for image prompt optimisation                                                                                                          |
| `AI_TEXT_OPENAI_ENABLED / _OPENROUTER_ENABLED / _ANTHROPIC_ENABLED` | `false`                           | Enable each text provider                                                                                                                                   |
| `AI_TEXT_*_MODELS`                                                  | -                                 | JSON array of text models offered per provider                                                                                                              |

---

## Next Steps

- **[Admin Panel](./admin-guide/overview)** - Manage users, settings, and system health from the web UI
- **[Passkeys](./admin-guide/passkeys)** - Configure passwordless WebAuthn authentication
- **[AI Image Generation](./admin-guide/ai-image-generation)** - Set up AI-powered features
- **[Troubleshooting](./troubleshooting/logging)** - Common issues and solutions
