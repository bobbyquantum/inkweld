# Plan: Centralise & Suppress Hardcoded Test Credentials

## Problem
~30+ hardcoded passwords, fake API keys, and session secrets are scattered across e2e and backend test files. Sonar flags them as credential issues; they're currently marked as false positives individually.

## Approach: Centralise into constants + Sonar-suppress the constants file

Rather than environment variables (overkill for credentials that are intentionally fake/test-only and checked into the repo), the cleanest fix is:

1. **One source of truth** — a single `test-credentials.ts` constants file per test area
2. **Sonar suppression** — suppress the credentials rule only on those constants files
3. **All spec/fixture files** reference the constants instead of inline strings

This keeps tests readable, grep-able, and removes Sonar noise without adding env-var ceremony for values that have zero secrecy requirements.

---

## Steps

### Step 1 — Create `frontend/e2e/common/test-credentials.ts`

Centralise all frontend e2e passwords, fake API keys, and session secrets into one file:

```ts
// NOSONAR — these are intentionally hardcoded test/fake credentials
// They are not real secrets and are safe to commit

export const TEST_PASSWORDS = {
  ADMIN: 'E2eAdminPassword123!',
  MCP_ADMIN: 'McpAdminPassword123!',
  USER: 'TestPassword123!',
  MCP_USER: 'McpTestPassword123!',
  VALID: 'ValidPass123!',
  EXISTING: 'ExistingPass123!',
  WRONG: 'wrong-password',
  MOCK_CORRECT: 'correct-password',
} as const;

export const TEST_API_KEYS = {
  FAKE_OPENAI: 'sk-fake-test-key-1234567890abcdefghijklmnopqrstuv',
  FAKE_OPENROUTER: 'sk-or-v1-fake-test-key-1234567890abcdefghijklmnopqrstuv',
  FAKE_FALAI: 'fal-ai-fake-test-key-1234567890abcdefghijklmnopqrstuv',
} as const;

export const TEST_SESSION_SECRETS = {
  ONLINE: 'test-session-secret-for-e2e-testing-minimum-32-characters',
  MCP: 'test-session-secret-for-e2e-mcp-testing-minimum-32-chars',
  DOCKER: 'test-session-secret-for-docker-e2e-testing-min-32-chars',
} as const;
```

### Step 2 — Create `backend/test/test-credentials.ts`

Same pattern for backend tests:

```ts
export const TEST_PASSWORDS = {
  DEFAULT: 'testpassword123',
  ALT: 'password123',
  WRONG: 'wrongpassword',
  CORRECT: 'correctpassword',
  OLD: 'oldpassword',
  NEW: 'newpassword',
} as const;

export const TEST_API_KEYS = {
  OPENAI: 'test-openai-key-12345',
  GENERIC: 'test-key',
  FALAI: 'test-falai-key',
  FALAI_ALT: 'test-api-key',
} as const;
```

### Step 3 — Update all consuming files

Replace every inline password/key string with the corresponding constant import. Files to update:

**Frontend e2e** (~12 files):
- `e2e/mcp/mcp-setup.ts` — `TEST_PASSWORDS.MCP_ADMIN`
- `e2e/online-setup.ts` — `TEST_PASSWORDS.ADMIN`, `TEST_API_KEYS.FAKE_OPENAI`
- `e2e/docker/global-setup.ts` — `TEST_PASSWORDS.ADMIN`, `TEST_API_KEYS.FAKE_OPENAI`, `TEST_SESSION_SECRETS.DOCKER`
- `e2e/online/fixtures.ts` — `TEST_PASSWORDS.ADMIN`, `TEST_PASSWORDS.USER`
- `e2e/mcp/fixtures.ts` — `TEST_PASSWORDS.MCP_USER`
- `e2e/mcp/mcp-auth.spec.ts` — `TEST_PASSWORDS.USER`
- `e2e/mcp/mcp-discovery.spec.ts` — `TEST_PASSWORDS.USER`
- `e2e/online/auth/registration.spec.ts` — `TEST_PASSWORDS.EXISTING`
- `e2e/online/error-handling.spec.ts` — `TEST_PASSWORDS.VALID`
- `e2e/online/auth/login.spec.ts` — `TEST_PASSWORDS.WRONG`
- `e2e/online/image-generation.spec.ts` — `TEST_API_KEYS.*`
- `e2e/screenshots/mock-api/auth.ts` — `TEST_PASSWORDS.MOCK_CORRECT`
- `e2e/common/test-helpers.ts` — remove `VALID_PASSWORD` from `TEST_CONSTANTS` (use `TEST_PASSWORDS.VALID` instead)
- `playwright.online.config.ts` — `TEST_SESSION_SECRETS.ONLINE`
- `playwright.mcp.config.ts` — `TEST_SESSION_SECRETS.MCP`

**Backend** (~5 files):
- `test/auth.test.ts`
- `test/ai-providers.test.ts`
- `test/user.test.ts`
- `test/media.test.ts`
- `test/collaboration.test.ts`
- `test/falai-provider.test.ts`

### Step 4 — Suppress Sonar on the constants files only

Add to `sonar-project.properties`:

```properties
# Test credential constants are intentionally hardcoded fake values
sonar.issue.ignore.multicriteria=e1
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/test-credentials.ts
```

This targets **only** the two constants files, so any *new* hardcoded password elsewhere still gets flagged.

### Step 5 — Remove existing false-positive markers

Remove any per-issue Sonar false-positive dismissals that were previously applied to the individual files (they'll no longer trigger since the strings are gone from those files).

### Step 6 — Verify

- Run the existing e2e and backend test suites to confirm nothing broke
- Grep for any remaining raw password strings outside the constants files

---

## What this does NOT do (and why)

| Alternative | Why not |
|---|---|
| `.env.test` file with env vars | Adds indirection for values that are intentionally public test fixtures. No secret to protect. |
| Vault / secret manager | Massive overkill for fake credentials. |
| Random password generation at runtime | Makes tests non-deterministic and harder to debug. |
| Playwright `--pass-through-secrets` | Doesn't exist; Playwright has no built-in secret management for test data. |

## Estimated scope

- 2 new files (constants)
- ~17 files updated (import + replace)
- 1 file updated (sonar config)
- Net effect: single-place-to-change for all test credentials, clean Sonar dashboard
