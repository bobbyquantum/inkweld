/**
 * Centralised test credentials for e2e tests.
 *
 * These are intentionally hardcoded fake/test-only values.
 * They carry no secrecy requirements and are safe to commit.
 *
 * Sonar rule S2068 is suppressed for this file only
 * (see sonar-project.properties).
 */

export const TEST_PASSWORDS = {
  /** Admin password for online / docker e2e tests */
  ADMIN: 'E2eAdminPassword123!',
  /** Admin password for MCP e2e tests */
  MCP_ADMIN: 'McpAdminPassword123!',
  /** Generic test-user password */
  USER: 'TestPassword123!',
  /** MCP-specific test-user password */
  MCP_USER: 'McpTestPassword123!',
  /** Password that satisfies all validation rules */
  VALID: 'ValidPass123!',
  /** Password used for "already existing" user scenarios */
  EXISTING: 'ExistingPass123!',
  /** Deliberately wrong password for negative tests */
  WRONG: 'wrong-password',
  /** Convention used by mock-API: always accepted */
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
