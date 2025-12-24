/**
 * Test helper that starts a real HTTP server for integration tests
 * This is needed for testing session-based authentication since
 * Hono's app.request() doesn't maintain cookies/sessions.
 */
import { serve, type Server } from 'bun';
import { createBunApp } from '../src/bun-app';

let testServer: Server | null = null;
let testPort: number = 0;
let app: ReturnType<typeof createBunApp> | null = null;

/**
 * Start a test server on a random available port
 */
export async function startTestServer(): Promise<{ port: number; baseUrl: string }> {
  if (testServer) {
    return { port: testPort, baseUrl: `http://localhost:${testPort}` };
  }

  // Try to find an available port
  testPort = 18333 + Math.floor(Math.random() * 1000);

  // Create app instance if not exists
  if (!app) {
    app = await createBunApp();
  }

  testServer = serve({
    port: testPort,
    fetch: app.fetch,
  });

  console.log(`✅ Test server started on port ${testPort}`);
  return { port: testPort, baseUrl: `http://localhost:${testPort}` };
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
  private baseUrl: string;

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
