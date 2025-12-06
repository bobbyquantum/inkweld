import { expect, test } from './fixtures';

test.describe('Authentication', () => {
  test('authenticatedPage fixture should work', async ({
    authenticatedPage,
  }) => {
    // Verify we have auth token in localStorage
    const token = await authenticatedPage.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/); // JWT format

    // Verify we have server config
    const config = await authenticatedPage.evaluate(() => {
      const cfg = localStorage.getItem('inkweld-app-config');
      return cfg ? JSON.parse(cfg) : null;
    });
    expect(config).toBeTruthy();
    expect(config.mode).toBe('server');
    expect(config.serverUrl).toBe('http://localhost:9333');

    // Verify we can access an authenticated endpoint
    const response = await authenticatedPage.request.get(
      'http://localhost:9333/api/v1/projects',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Should return 200 (or possibly 404 if no projects, but NOT 401)
    expect(response.status()).not.toBe(401);
  });
});
