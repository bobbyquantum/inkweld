/**
 * Test helper that starts a real HTTP server for integration tests
 * This is needed for testing session-based authentication since
 * Hono's app.request() doesn't maintain cookies/sessions.
 */
import { serve, type Server } from 'bun';
import { app } from './setup.shared.js';

let testServer: Server | null = null;
let testPort: number = 0;

/**
 * Start a test server on a random available port
 */
export async function startTestServer(): Promise<{ port: number; baseUrl: string }> {
  if (testServer) {
    return { port: testPort, baseUrl: `http://localhost:${testPort}` };
  }

  // Try to find an available port
  testPort = 18333 + Math.floor(Math.random() * 1000);

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
 * Helper to make authenticated requests with cookie persistence
 */
export class TestClient {
  private cookies: string[] = [];
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request with automatic cookie handling
   */
  async request(
    path: string,
    options: RequestInit = {}
  ): Promise<{ response: Response; json: () => Promise<any> }> {
    const url = `${this.baseUrl}${path}`;

    // Add cookies to request
    const headers = new Headers(options.headers);
    if (this.cookies.length > 0) {
      headers.set('Cookie', this.cookies.join('; '));
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Store cookies from response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Parse and store cookies
      const cookieParts = setCookie.split(';')[0];
      const cookieName = cookieParts.split('=')[0];

      // Remove old cookie with same name and add new one
      this.cookies = this.cookies.filter((c) => !c.startsWith(`${cookieName}=`));
      this.cookies.push(cookieParts);
    }

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
   * Login as a user and store session cookie
   */
  async login(username: string, password: string): Promise<boolean> {
    const { response } = await this.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    return response.ok;
  }

  /**
   * Logout (clear cookies)
   */
  clearCookies(): void {
    this.cookies = [];
  }
}
