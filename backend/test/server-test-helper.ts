/**
 * Test helper that starts a real HTTP server for integration tests
 * This is needed for testing session-based authentication since
 * Hono's app.request() doesn't maintain cookies/sessions.
 */
import { serve, type Server } from 'bun';
import { createBunApp } from '../src/bun-app';
import { getDatabase } from '../src/db/index';
import { configService } from '../src/services/config.service';

/**
 * Enable password login for a test suite.
 *
 * Production deployments default `PASSWORD_LOGIN_ENABLED` to `false`
 * (passwordless-first per NIST SP 800-63B Rev. 4). Suites that exercise
 * the legacy password flow (`/login`, `/forgot-password`, `/reset-password`,
 * password registration) must opt in by calling this helper from `beforeAll`.
 *
 * The override is written to the config table; tests share a single in-memory
 * database so the value persists for the lifetime of the test process. Suites
 * verifying gating behaviour when password login is disabled should call
 * `disablePasswordLoginForTests()` to revert.
 */
export async function enablePasswordLoginForTests(): Promise<void> {
  const db = getDatabase();
  await configService.set(db, 'PASSWORD_LOGIN_ENABLED', 'true');
}

/**
 * Revert the `PASSWORD_LOGIN_ENABLED` override to the default (off).
 *
 * Use this in tests that explicitly verify the gating behaviour, then call
 * `enablePasswordLoginForTests()` again in `afterAll` if other suites in the
 * same process depend on password login being enabled.
 */
export async function disablePasswordLoginForTests(): Promise<void> {
  const db = getDatabase();
  await configService.delete(db, 'PASSWORD_LOGIN_ENABLED');
}

/**
 * Force `USER_APPROVAL_REQUIRED=true` for a test. Suites must restore the
 * default in `afterAll` via `disableUserApprovalForTests()` because the
 * test process shares a single in-memory database — leaving this on would
 * make every later registration in any suite require approval.
 */
export async function enableUserApprovalForTests(): Promise<void> {
  const db = getDatabase();
  await configService.set(db, 'USER_APPROVAL_REQUIRED', 'true');
}

/**
 * Revert the `USER_APPROVAL_REQUIRED` override. Pair with
 * `enableUserApprovalForTests()` in `afterAll`.
 */
export async function disableUserApprovalForTests(): Promise<void> {
  const db = getDatabase();
  await configService.delete(db, 'USER_APPROVAL_REQUIRED');
}

let testServer: Server<undefined> | null = null;
let testPort: number = 0;
let app: Awaited<ReturnType<typeof createBunApp>> | null = null;
const TEST_HOST = '127.0.0.1';

async function waitForServer(baseUrl: string, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(baseUrl, { method: 'HEAD' });
      // Any successful fetch (no exception) means the socket is accepting connections.
      return;
    } catch {
      // Server is not accepting connections yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for test server at ${baseUrl}`);
}

/**
 * Start a test server on a random available port
 */
export async function startTestServer(): Promise<{ port: number; baseUrl: string }> {
  const baseUrl = () => `http://${TEST_HOST}:${testPort}`;

  if (testServer) {
    await waitForServer(baseUrl());
    return { port: testPort, baseUrl: baseUrl() };
  }

  // Ensure tests don't require admin approval for new users
  // This makes registration + login flow work for integration tests
  process.env.USER_APPROVAL_REQUIRED ??= 'false';

  // Try to find an available port
  testPort = 18333 + Math.floor(Math.random() * 1000);

  // Create app instance if not exists
  app ??= await createBunApp();

  testServer = serve({
    hostname: TEST_HOST,
    port: testPort,
    fetch: app.fetch,
  });

  await waitForServer(baseUrl());

  console.log(`✅ Test server started on port ${testPort}`);
  return { port: testPort, baseUrl: baseUrl() };
}

/**
 * Stop the test server
 */
export async function stopTestServer(): Promise<void> {
  if (testServer) {
    testServer.stop();
    testServer = null;
    testPort = 0;
    console.log('✅ Test server stopped');
  }
}

/**
 * Helper to make authenticated requests with JWT token
 */
export class TestClient {
  private token: string | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request with automatic authentication header
   */

  async request(
    path: string,
    options: RequestInit = {}
  ): Promise<{ response: Response; json: () => Promise<unknown> }> {
    const url = `${this.baseUrl}${path}`;

    // Add Authorization header if we have a token
    const headers = new Headers(options.headers);
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
      console.log(`[TestClient] Sending token: ${this.token.substring(0, 20)}...`);
    } else {
      console.log('[TestClient] No token to send');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    return {
      response,
      json: async () => {
        if (response.headers.get('content-type')?.includes('application/json')) {
          return response.json();
        }
        return null;
      },
    };
  }

  /**
   * Login as a user and store JWT token
   */
  async login(username: string, password: string): Promise<boolean> {
    const { response, json } = await this.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const data = await json();
      if (data && typeof data === 'object' && 'token' in data) {
        this.token = (data as { token: string }).token;
        console.log('[TestClient] Stored token:', this.token.substring(0, 20) + '...');
        return true;
      }
    }

    return false;
  }

  /**
   * Logout (clear token)
   */
  clearToken(): void {
    this.token = null;
  }
}
