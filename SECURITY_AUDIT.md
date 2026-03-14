# Inkweld Security Audit & Remediation Plan

**Date:** 2026-03-14
**Scope:** Full backend security audit of authentication, authorization, file handling, AI integrations, MCP protocol, and WebSocket endpoints.

---

## Executive Summary

The audit identified **23 security findings** across the Inkweld backend: 4 Critical, 7 High, 8 Medium, and 4 Low severity issues. The most urgent findings involve OAuth client secret validation bypass, missing rate limiting on auth endpoints, path traversal in media uploads, and IDOR vulnerabilities in AI image generation.

---

## Findings & Remediation Plan

### CRITICAL

#### C1. Missing OAuth Client Secret Validation at Token Endpoint
- **File:** `backend/src/routes/oauth.routes.ts` (lines 766-790)
- **Issue:** The `/oauth/token` endpoint accepts `client_secret` but never validates it. The `validateClientSecret()` method exists in `mcp-oauth.service.ts:326-338` but is never called. An attacker who captures an authorization code can exchange it without the client secret.
- **Fix:** Call `validateClientSecret()` for confidential clients before calling `exchangeAuthorizationCode()`.

#### C2. OAuth Client ID Mismatch Allowed During Token Exchange
- **File:** `backend/src/services/mcp-oauth.service.ts` (lines 506-516)
- **Issue:** When the client ID in the token request doesn't match the one from the authorization code, the code logs a warning but continues. This violates OAuth 2.0 spec and could enable privilege escalation.
- **Fix:** Reject with `invalid_grant` when client IDs don't match. Remove the "allow due to valid PKCE" logic.

#### C3. Path Traversal in Media File Upload
- **File:** `backend/src/routes/media.routes.ts` (line 257)
- **Issue:** `file.name` from the upload is passed directly to `storage.saveProjectFile()` without sanitization. While `ensureWithinBase()` provides a safety net, explicit filename validation is missing at the route level.
- **Fix:** Add filename validation in `media.routes.ts` before storage — strip path separators, enforce alphanumeric/dot/hyphen/underscore pattern, reject `..` sequences.

#### C4. Insufficient Filename Validation in R2 Storage
- **File:** `backend/src/services/r2-storage.service.ts` (lines 15-18)
- **Issue:** `validateKeyComponent()` only checks for `..` and null bytes but allows `/` and `\` characters, enabling path manipulation in R2 keys.
- **Fix:** Add `/` and `\` to the blocked characters list, aligning with `FileStorageService.validatePathComponent()`.

---

### HIGH

#### H1. No Rate Limiting on Authentication Endpoints
- **Files:** `backend/src/routes/auth.routes.ts`, `password-reset.routes.ts`, `admin.routes.ts`
- **Issue:** Login, registration, password reset, and admin endpoints have no rate limiting. Enables brute force attacks and credential stuffing.
- **Fix:** Implement IP-based rate limiting middleware. Suggested limits: 5 failed logins/15min per IP, 3 password resets/hour per email, 10 registrations/hour per IP.

#### H2. Account Enumeration via Password Reset Response
- **File:** `backend/src/services/password-reset.service.ts` (lines 37-96)
- **Issue:** Returns `{ emailSent: false }` for non-existent emails vs `{ emailSent: true }` for valid ones, enabling email enumeration.
- **Fix:** Always return `{ success: true }` with identical response shape regardless of email existence. Remove `emailSent` from the API response.

#### H3. Weak JWT Secret Fallback in Development
- **File:** `backend/src/config/env.ts` (lines 114-130)
- **Issue:** Falls back to `'fallback-secret-for-development-only'` when `DATABASE_KEY` is unset in non-production. Risk of accidental production deployment with weak secret.
- **Fix:** Throw an error in all environments if no secret is configured, or generate a random ephemeral secret with a loud warning.

#### H4. No Session Invalidation on Password Change or User Disable
- **Files:** `backend/src/services/user.service.ts` (lines 169-172), `backend/src/routes/admin.routes.ts` (lines 464-481)
- **Issue:** Changing a password or disabling a user does not invalidate existing JWT tokens (30-day expiry). Compromised tokens remain valid.
- **Fix:** Add a `passwordChangedAt` / `disabledAt` timestamp to the users table. Check it against token `iat` during auth middleware validation. Alternatively, implement a session revocation list.

#### H5. IDOR in AI Image Generation — Missing Project Ownership Check
- **File:** `backend/src/routes/ai-image.routes.ts` (lines 394-410)
- **Issue:** Reference images are loaded from a project using `projectKey` (username/slug) without validating the authenticated user has access to that project.
- **Fix:** Add project ownership/collaborator check before loading reference images.

#### H6. Inconsistent Path Validation Between Storage Backends
- **Files:** `backend/src/services/file-storage.service.ts` (lines 19-28), `backend/src/services/r2-storage.service.ts` (lines 15-18)
- **Issue:** `FileStorageService` blocks `/` and `\` in filenames; `R2StorageService` does not. Security guarantees differ per deployment.
- **Fix:** Create a shared `validateFilename()` utility used by both backends. Ensure identical validation rules.

#### H7. Missing Filename Validation in Image Deletion
- **File:** `backend/src/routes/image.routes.ts` (line 140)
- **Issue:** Old cover image filename from the database is used directly in `deleteProjectFile()` without validation.
- **Fix:** Validate the filename format before passing to delete operations.

---

### MEDIUM

#### M1. CSRF Tokens Stored In-Memory
- **File:** `backend/src/middleware/csrf.ts` (lines 14-20)
- **Issue:** CSRF tokens are stored in a `Map`, lost on restart, and don't work across multiple server instances.
- **Fix:** Store CSRF tokens in the database, or switch to a stateless double-submit cookie pattern with HMAC validation.

#### M2. No CSRF Check on OAuth Authorization POST
- **File:** `backend/src/middleware/csrf.ts` (lines 62-65), `backend/src/routes/oauth.routes.ts` (lines 646-705)
- **Issue:** CSRF middleware skips all `/api/auth/` paths. The `POST /oauth/authorize` endpoint modifies state without CSRF validation.
- **Fix:** Add CSRF validation to the OAuth authorization POST endpoint. Narrow the CSRF exemption to only specific auth endpoints that need it.

#### M3. Password Length Validation Mismatch
- **Files:** `backend/src/schemas/auth.schemas.ts` (line 46), `backend/src/services/password-validation.service.ts`
- **Issue:** Registration schema allows 6-character passwords; password validation service defaults to 8 minimum.
- **Fix:** Align both to the same minimum (recommend 10+). Use the password validation service for registration too.

#### M4. Email Header Injection via Admin Config
- **File:** `backend/src/services/email.service.ts` (lines 140-146)
- **Issue:** `EMAIL_FROM_NAME` config value is interpolated into the `from` header without sanitization. An admin could inject CRLF sequences.
- **Fix:** Sanitize `fromName` by stripping `\r`, `\n`, `"`, and other control characters.

#### M5. WebSocket Authentication Lacks CSRF Protection
- **File:** `backend/src/routes/yjs.routes.ts` (lines 1-70)
- **Issue:** No CSRF token validation on the HTTP upgrade request. Browser-based CSRF could initiate WebSocket connections.
- **Fix:** Validate Origin header on WebSocket upgrade requests against allowed origins.

#### M6. Missing CSRF on WebSocket Upgrade; Information Leakage via Close Codes
- **File:** `backend/src/routes/yjs.routes.ts` (lines 79-98)
- **Issue:** Specific WebSocket close codes (4001, 4002, 4003) reveal whether a token is invalid, document ID is bad, or project doesn't exist.
- **Fix:** Use a single generic close code (4000) with a generic message for all auth failures.

#### M7. No Audit Logging for Admin Actions
- **File:** `backend/src/routes/admin.routes.ts` (lines 373-517)
- **Issue:** Admin operations (set-admin, disable-user, delete-user) have no audit trail.
- **Fix:** Add structured audit logging for all admin state-changing operations.

#### M8. File Type Validation Relies on Client-Provided MIME Type
- **File:** `backend/src/routes/media.routes.ts` (lines 224-250)
- **Issue:** Upload MIME type validation uses the client-provided `file.type`, which can be spoofed.
- **Fix:** Use a library like `file-type` to inspect file magic bytes server-side. Set Content-Type based on server-validated type.

---

### LOW

#### L1. OAuth Redirect URI Not Validated as HTTPS in Production
- **File:** `backend/src/services/mcp-oauth.service.ts` (lines 392-396)
- **Fix:** Enforce HTTPS for redirect URIs in production environments.

#### L2. Open Redirect Risk in OAuth Consent Flow
- **File:** `backend/src/routes/oauth.routes.ts` (lines 689-698)
- **Fix:** Re-validate redirect URI against registered URIs before building redirect response.

#### L3. Base64 Image Data Accepted Without Content Validation
- **File:** `backend/src/utils/reference-image-loader.ts` (lines 47-69)
- **Fix:** Validate base64 data is actually valid image content (check magic bytes).

#### L4. API Error Messages May Leak Sensitive Data
- **File:** `backend/src/routes/ai-text.routes.ts` (line 503)
- **Fix:** Sanitize error messages from external APIs before logging or returning.

---

## Implementation Priority

### Phase 1 — Immediate (blocks production)
| ID | Fix | Effort |
|----|-----|--------|
| C1 | Add client_secret validation to OAuth token endpoint | Small |
| C2 | Reject client ID mismatches in token exchange | Small |
| C3 | Add filename validation in media upload route | Small |
| C4 | Align R2 storage validation with FileStorageService | Small |
| H1 | Implement rate limiting middleware | Medium |
| H2 | Fix account enumeration in password reset | Small |
| H3 | Remove weak JWT secret fallback | Small |

### Phase 2 — High Priority (within 1 week)
| ID | Fix | Effort |
|----|-----|--------|
| H4 | Session invalidation on password change / user disable | Medium |
| H5 | Add project ownership check in AI image generation | Small |
| H6 | Create shared filename validation utility | Small |
| H7 | Validate filename before image deletion | Small |
| M1 | Move CSRF tokens to database or stateless pattern | Medium |
| M2 | Add CSRF to OAuth authorize POST | Small |
| M3 | Align password length validation | Small |

### Phase 3 — Important (within 2 weeks)
| ID | Fix | Effort |
|----|-----|--------|
| M4 | Sanitize email header values | Small |
| M5 | Validate Origin on WebSocket upgrade | Small |
| M6 | Normalize WebSocket close codes | Small |
| M7 | Add admin action audit logging | Medium |
| M8 | Server-side MIME type validation | Medium |
| L1-L4 | Low-severity fixes | Small each |
