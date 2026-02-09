# Inkweld Security Analysis Report

**Date**: 2026-02-09
**Scope**: Full codebase security review of Inkweld collaborative writing platform
**Codebase**: TypeScript full-stack (Hono/Bun backend, Angular frontend)

---

## Executive Summary

Inkweld is a self-hosted collaborative creative writing platform with a generally sound security architecture. The codebase employs modern practices including JWT authentication, bcrypt password hashing, AES-256-GCM encryption for sensitive config, Zod schema validation, and PKCE-backed OAuth 2.1 flows. However, several vulnerabilities were identified ranging from critical SQL injection in the admin CLI to architectural weaknesses in session management and CSRF token generation.

**Findings by Severity:**
| Severity | Count |
|----------|-------|
| Critical | 2 |
| High     | 4 |
| Medium   | 5 |
| Low      | 4 |
| Info     | 3 |

---

## Critical Findings

### C1: SQL Injection in D1 Admin CLI

**File**: `backend/admin-cli.ts` (lines 224-341)
**Severity**: Critical
**CVSS**: 9.8

The `D1AdminCLI` class constructs SQL queries via template literal string interpolation, passing user-supplied identifiers directly into query strings without parameterization:

```typescript
// Line 227
`SELECT * FROM users WHERE id = '${identifier}' LIMIT 1`

// Line 234
`SELECT * FROM users WHERE username = '${identifier}' LIMIT 1`

// Line 310
`SELECT * FROM projects WHERE id = '${identifier}' OR slug = '${identifier}' LIMIT 1`
```

The `identifier` parameter originates from CLI arguments (`process.argv`) and flows unsanitized into 11+ SQL statements executed via `wrangler d1 execute`. An attacker with CLI access (or in a CI pipeline that accepts user input) could inject arbitrary SQL to exfiltrate data, modify records, or drop tables.

**Note**: The companion `AdminCLI` class (line 355+) correctly uses Drizzle ORM's parameterized queries (`eq(users.id, identifier)`), making this inconsistency particularly notable.

**Recommendation**: Replace all raw SQL string interpolation in `D1AdminCLI` with parameterized queries or, at minimum, strict input validation against a UUID/alphanumeric pattern.

---

### C2: Hardcoded Fallback Secret for Encryption Key

**File**: `backend/src/config/env.ts` (line 115-118)
**Severity**: Critical
**CVSS**: 9.1

```typescript
databaseKey:
    process.env.DATABASE_KEY ||
    process.env.SESSION_SECRET ||
    'fallback-secret-change-in-production',
```

The `databaseKey` is used for:
1. **JWT signing** (all authentication tokens — `auth.service.ts:74`)
2. **AES-256-GCM encryption** of sensitive config values like API keys (`config.service.ts:48`)
3. **CSRF token HMAC signing** (`csrf.routes.ts:101`)

If neither `DATABASE_KEY` nor `SESSION_SECRET` is set, all cryptographic operations fall back to a publicly known static string. While `auth.service.ts:54` enforces a minimum 32-character length, the fallback string `'fallback-secret-change-in-production'` is 37 characters and satisfies this check. A deployment that omits these environment variables would have completely compromised authentication and encryption.

**Recommendation**: Refuse to start the server in production mode without an explicitly configured secret. Remove the static fallback entirely or limit it to `NODE_ENV=development` with a prominent startup warning.

---

## High Severity Findings

### H1: No JWT Token Revocation Mechanism

**File**: `backend/src/services/auth.service.ts` (lines 177-180)
**Severity**: High

```typescript
destroySession(_c: Context): void {
    // With JWT tokens, logout is handled client-side by removing the token
    // No server-side state to clean up
}
```

JWT tokens have a 30-day expiration (`TOKEN_EXPIRY = 30 * 24 * 60 * 60`) and cannot be revoked server-side. If a token is compromised, there is no way to invalidate it before expiration. The logout endpoint is effectively a no-op — the token remains valid after "logout."

This means:
- Stolen tokens grant 30 days of unauthorized access
- Admin account compromise cannot be mitigated without rotating the signing secret (which invalidates all sessions)
- A disabled/banned user retains access until their token expires

**Recommendation**: Implement a server-side session store or token blacklist. At minimum, add a `tokenIssuedAt` check against the user's `passwordChangedAt` timestamp to allow password-change-based invalidation.

---

### H2: No Rate Limiting on Authentication Endpoints

**Files**: `backend/src/routes/auth.routes.ts`, `backend/src/services/password-reset.service.ts`
**Severity**: High

No rate limiting or brute force protection exists anywhere in the codebase. The login endpoint (`POST /api/v1/auth/login`), registration endpoint (`POST /api/v1/auth/register`), and password reset endpoint are all unthrottled.

This enables:
- Credential stuffing and brute force attacks against login
- User enumeration via registration timing differences
- Password reset token brute forcing (though 256-bit tokens mitigate this)
- Denial of service through resource exhaustion

**Recommendation**: Add rate limiting middleware (e.g., `hono-rate-limiter`) to authentication endpoints. Suggested thresholds: 5 login attempts per minute per IP, 3 registration attempts per hour per IP, 3 password reset requests per hour per email.

---

### H3: CSRF Token Generation Uses Math.random()

**File**: `backend/src/middleware/csrf.ts` (lines 8-10)
**Severity**: High

```typescript
export function generateCSRFToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
```

`Math.random()` is not cryptographically secure. The tokens are predictable given knowledge of the timing and the PRNG state. This undermines the CSRF protection entirely.

**Note**: A separate CSRF implementation in `backend/src/routes/csrf.routes.ts` correctly uses `crypto.randomUUID()` and HMAC-SHA256. The vulnerable implementation in the middleware file may be legacy code still in use.

**Recommendation**: Replace `Math.random()` with `crypto.randomUUID()` or `crypto.getRandomValues()`. Consider consolidating on the HMAC-based approach from `csrf.routes.ts`.

---

### H4: Server-Side Request Forgery (SSRF) via Stable Diffusion Endpoint

**Files**: `backend/src/routes/ai-providers.routes.ts` (lines 414-435), `backend/src/services/image-providers/stable-diffusion-provider.ts` (lines 109, 176)
**Severity**: High

Admin users can set an arbitrary URL as the Stable Diffusion endpoint, which is then used in server-side `fetch()` calls without URL validation:

```typescript
// ai-providers.routes.ts - stores arbitrary URL
const { endpoint } = c.req.valid('json');
await configService.set(db, provider.endpointConfigKey, endpoint);

// stable-diffusion-provider.ts - fetches from stored URL
const response = await fetch(`${this.endpoint}/sdapi/v1/sd-models`, ...);
const response = await fetch(`${this.endpoint}/sdapi/v1/txt2img`, ...);
```

A compromised admin account (or in combination with C2 above) could point this at internal services (e.g., cloud metadata endpoints at `http://169.254.169.254/`, internal APIs, or localhost services) to:
- Exfiltrate cloud credentials from instance metadata
- Scan internal network topology
- Access internal services not exposed to the internet

**Recommendation**: Validate the endpoint URL against a scheme allowlist (https only in production), block RFC 1918 private ranges and link-local addresses, and block DNS rebinding by resolving the hostname and checking the IP before making the request.

---

## Medium Severity Findings

### M1: JWT Tokens Stored in localStorage (XSS Token Theft)

**File**: `frontend/src/app/services/auth/auth-token.service.ts` (lines 33-35)
**Severity**: Medium

```typescript
setToken(token: string): void {
    localStorage.setItem(this.getTokenKey(), token);
}
```

JWT tokens are stored in `localStorage`, which is accessible to any JavaScript running in the page context. If an XSS vulnerability is exploited (see M2), the attacker can exfiltrate long-lived authentication tokens. Unlike `HttpOnly` cookies, `localStorage` tokens cannot be protected from script access.

Combined with H1 (no token revocation), a stolen token provides 30 days of irrevocable access.

**Recommendation**: Consider migrating to `HttpOnly`, `Secure`, `SameSite=Strict` cookies for token storage. If localStorage must be used, reduce token lifetime significantly and implement token rotation.

---

### M2: bypassSecurityTrustHtml Usage

**File**: `frontend/src/app/pages/about/changelog/changelog.component.ts` (line 39)
**Severity**: Medium

```typescript
content: this.sanitizer.bypassSecurityTrustHtml(v.content)
```

The changelog content from the server is rendered with Angular's DomSanitizer bypass. If the changelog content source is ever compromised or if a stored XSS vector is introduced through the changelog data, this would execute arbitrary JavaScript in the user's browser, enabling token theft (see M1).

**Recommendation**: Use Angular's built-in sanitization rather than bypassing it. If HTML rendering is required, use a whitelist-based sanitizer like DOMPurify before calling `bypassSecurityTrustHtml`.

---

### M3: CSRF Protection Bypassed for Auth Endpoints

**File**: `backend/src/middleware/csrf.ts` (lines 28-33)
**Severity**: Medium

```typescript
// Skip CSRF check for auth endpoints (they use session)
const path = c.req.path;
if (path.includes('/api/auth/')) {
    await next();
    return;
}
```

All auth endpoints are exempt from CSRF verification. While the login endpoint itself is not typically CSRF-sensitive (it issues a new token), the logout endpoint and registration endpoint are exempted too. CSRF attacks could:
- Force logout of authenticated users (denial of service)
- Create accounts on behalf of users if registration is open

The `path.includes()` check is also overly broad — any path containing `/api/auth/` anywhere in the string will bypass CSRF.

**Recommendation**: Use `path.startsWith('/api/v1/auth/')` for more precise matching. Apply CSRF protection to at minimum the logout endpoint.

---

### M4: Permissive CORS Configuration on MCP/OAuth Endpoints

**File**: `backend/src/bun-app.ts` (lines 133-146)
**Severity**: Medium

```typescript
app.use('/.well-known/*', cors({ origin: '*', ... }));
app.use('/oauth/*', cors({ origin: '*', ... }));
app.use('/register', cors({ origin: '*', ... }));
app.use('/api/v1/ai/mcp', cors({ origin: '*', ... }));
app.use('/api/v1/ai/mcp/*', cors({ origin: '*', ... }));
```

Multiple endpoint groups are configured with `origin: '*'`. While some of these (`.well-known`, OAuth metadata) are legitimately public, the `/register` endpoint with wildcard CORS allows cross-origin registration requests from any website. The MCP endpoints with wildcard CORS accept mutations (POST, DELETE) from any origin.

**Recommendation**: Restrict `/register` to the configured `allowedOrigins`. For MCP endpoints, consider using token-based authentication in lieu of CORS relaxation, or document this as a known requirement.

---

### M5: CSRF Token Endpoint Fallback Secret

**File**: `backend/src/routes/csrf.routes.ts` (line 101)
**Severity**: Medium

```typescript
const secret = config.databaseKey || 'inkweld-csrf-secret';
```

If `config.databaseKey` is falsy (empty string), the CSRF HMAC falls back to a hardcoded secret. This is a secondary instance of the pattern described in C2.

**Recommendation**: Remove the fallback and fail if no secret is configured.

---

## Low Severity Findings

### L1: First User Auto-Admin Privilege Escalation Window

**File**: `backend/src/routes/auth.routes.ts` (lines 88-110)
**Severity**: Low

The first user to register automatically becomes an admin with full privileges. On a fresh deployment, if registration is open (which it is by default since `USER_APPROVAL_REQUIRED` defaults to `false`), any user who registers first gains admin access.

**Recommendation**: Document this behavior prominently. Consider requiring a one-time setup token or CLI-based admin creation for the first user.

---

### L2: Error Messages Leak Implementation Details

**File**: `backend/src/routes/csrf.routes.ts` (line 113)
**Severity**: Low

```typescript
error: config.nodeEnv === 'production' ? undefined : String(error),
```

While production mode suppresses error details, development mode (the default `NODE_ENV`) exposes full error stack traces. A deployment that forgets to set `NODE_ENV=production` will leak internal paths, library versions, and error details.

**Recommendation**: Default to production-safe error handling. Only expose details when `NODE_ENV` is explicitly set to `development`.

---

### L3: Async Environment Loading Race Condition

**File**: `backend/src/config/env.ts` (lines 91-93)
**Severity**: Low

```typescript
// Note: This is async but we call it synchronously for side effects
loadEnvironment();
```

The `.env` file is loaded asynchronously but the `config` object is exported synchronously with default values. If any code executes before the async load completes, it will use fallback values (including the hardcoded fallback secret from C2).

**Recommendation**: Ensure environment loading completes before the application starts accepting requests. Use a synchronous `dotenv.config()` call or await the promise during bootstrap.

---

### L4: SQL Injection in Test/Setup Scripts

**File**: `backend/scripts/init-d1-local.ts` (lines 84-93)
**Severity**: Low

Similar to C1, the D1 initialization script uses template literals for SQL construction. While these are only test fixtures, they establish a dangerous pattern that could be copy-pasted into production code.

**Recommendation**: Use parameterized queries consistently, even in test scripts.

---

## Informational Findings

### I1: In-Memory CSRF Token Storage

**File**: `backend/src/middleware/csrf.ts` (line 6)

```typescript
const csrfTokens = new Map<string, string>();
```

CSRF tokens are stored in an in-memory `Map`. This will not work in multi-process or clustered deployments, and tokens are lost on server restart.

---

### I2: 30-Day Session Lifetime

**File**: `backend/src/services/auth.service.ts` (line 11)

A 30-day token lifetime is generous. For a self-hosted application managing creative writing (potentially sensitive unpublished manuscripts), a shorter default with a "remember me" opt-in would reduce the exposure window.

---

### I3: Password Policy Default Minimum Length

**File**: `backend/src/services/config.service.ts` (line 141)

The default minimum password length is 8 characters with complexity requirements enabled by default. This is adequate but could be increased to 12+ given modern password cracking capabilities.

---

## Security Strengths

The codebase demonstrates several good security practices:

1. **Zod schema validation** on all API inputs via `@hono/zod-openapi`
2. **bcrypt password hashing** with 10 salt rounds (`user.service.ts`)
3. **AES-256-GCM authenticated encryption** for sensitive config values with scrypt key derivation (`config.service.ts`)
4. **Timing-safe token comparison** in password reset flow (`password-reset.service.ts:25-28`)
5. **PKCE support** in OAuth 2.1 flows with SHA-256 code challenges (`mcp-oauth.service.ts`)
6. **Secure random generation** using `crypto.randomBytes()` and `crypto.randomUUID()` in most places
7. **User enumeration prevention** in password reset (returns same response regardless of email existence)
8. **Secure headers** middleware via `hono/secure-headers`
9. **Path traversal protection** in SPA handler with `.` and `..` segment filtering (`bun-app.ts:434-437`)
10. **Admin approval workflow** for new user registration (configurable)
11. **AI kill switch** defaulting to disabled for safety

---

## Recommended Priority Actions

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | C2: Enforce mandatory secret configuration | Low |
| 2 | C1: Parameterize D1 Admin CLI queries | Medium |
| 3 | H2: Add rate limiting to auth endpoints | Medium |
| 4 | H1: Implement token revocation mechanism | High |
| 5 | H3: Fix CSRF token generation | Low |
| 6 | H4: Validate SSRF-prone endpoint URLs | Medium |
| 7 | M1: Consider HttpOnly cookie token storage | High |
| 8 | M3: Tighten CSRF bypass path matching | Low |
