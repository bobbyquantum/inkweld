import { expect, test } from './fixtures';

/**
 * Simple test to verify online/full-stack infrastructure is working
 */
test.describe('Online Infrastructure', () => {
  test('should access backend health endpoint', async ({ page }) => {
    const response = await page.request.get(
      'http://localhost:9333/api/v1/health'
    );
    expect(response.ok()).toBeTruthy();
  });

  test('should register and login to server', async ({ browser }) => {
    // Create a fresh context to ensure no state leakage
    const context = await browser.newContext();
    const page = await context.newPage();

    const testUsername = `e2etest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    // First, verify the backend config has USER_APPROVAL_REQUIRED=false
    const configResponse = await page.request.get(
      'http://localhost:9333/api/v1/config'
    );
    expect(configResponse.ok()).toBeTruthy();

    // Register via API first (more reliable than UI flow)
    const registerResponse = await page.request.post(
      'http://localhost:9333/api/v1/auth/register',
      {
        data: {
          username: testUsername,
          password: testPassword,
        },
      }
    );

    expect(registerResponse.ok()).toBeTruthy();
    const registerData = (await registerResponse.json()) as {
      token?: string;
      requiresApproval?: boolean;
      user: { username: string };
    };

    // If approval is required, the test cannot continue
    // This should not happen with USER_APPROVAL_REQUIRED=false
    if (registerData.requiresApproval) {
      throw new Error(
        `Registration requires approval - expected USER_APPROVAL_REQUIRED=false but got requiresApproval=true`
      );
    }

    expect(registerData.token).toBeDefined();

    // Set server mode with token (v2 config format)
    await page.addInitScript(
      ({ token, serverUrl }: { token: string; serverUrl: string }) => {
        const now = Date.now();
        localStorage.clear();
        localStorage.setItem(
          'inkweld-app-config',
          JSON.stringify({
            version: 2,
            activeConfigId: 'server-1',
            configurations: [
              {
                id: 'server-1',
                type: 'server',
                displayName: 'Test Server',
                serverUrl,
                addedAt: now,
                lastUsedAt: now,
              },
            ],
          })
        );
        localStorage.setItem('srv:server-1:auth_token', token);
      },
      { token: registerData.token!, serverUrl: 'http://localhost:9333' }
    );

    // Navigate to app
    await page.goto('/', { waitUntil: 'networkidle' });

    // Verify we can access the app and are logged in
    await expect(page).toHaveTitle(/Home|Inkweld/i);

    // Verify we're not on a login or approval page
    const url = page.url();
    expect(url).not.toContain('/login');
    expect(url).not.toContain('/approval-pending');

    // Cleanup
    await context.close();
  });
});
