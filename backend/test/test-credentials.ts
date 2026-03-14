/**
 * Centralised test credentials for backend tests.
 *
 * These are intentionally hardcoded fake/test-only values.
 * They carry no secrecy requirements and are safe to commit.
 *
 * Sonar rule S2068 is suppressed for this file only
 * (see sonar-project.properties).
 */

export const TEST_PASSWORDS = {
  /** Default password used in most backend tests */
  DEFAULT: 'testpassword123',
  /** Admin password for e2e tests (must match frontend e2e credentials) */
  E2E_ADMIN: 'E2eAdminPassword123!',
  /** Alternative password */
  ALT: 'password123',
  /** Wrong password for negative tests */
  WRONG: 'wrongpassword',
  /** Used in validatePassword tests */
  CORRECT: 'correctpassword',
  /** Old password for update-password tests */
  OLD: 'oldpassword',
  /** New password for update-password tests */
  NEW: 'newpassword',
} as const;

export const TEST_API_KEYS = {
  OPENAI: 'test-openai-key-12345',
  GENERIC: 'test-key',
  FALAI: 'test-falai-key',
  FALAI_ALT: 'test-api-key',
} as const;
