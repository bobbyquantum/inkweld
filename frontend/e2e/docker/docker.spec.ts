import { test, expect } from './fixtures';

/**
 * Docker Container Health Tests
 *
 * These tests verify that the Docker container is built correctly
 * and can serve both the frontend and API.
 */
test.describe('Docker Container Health', () => {
  test('should serve health endpoint', async ({ page }) => {
    const response = await page.request.get('http://localhost:8333/health');
    expect(response.ok()).toBe(true);

    const health = await response.json();
    expect(health).toHaveProperty('status', 'ok');
  });

  test('should serve API health endpoint', async ({ page }) => {
    const response = await page.request.get(
      'http://localhost:8333/api/v1/health'
    );
    expect(response.ok()).toBe(true);

    const health = await response.json();
    expect(health).toHaveProperty('status', 'ok');
  });

  test('should serve frontend application', async ({ anonymousPage: page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should load the Angular app
    await expect(page.locator('app-root')).toBeVisible({ timeout: 10000 });
  });

  test('should serve static assets', async ({ page }) => {
    // Check that main.js or similar is served
    const response = await page.request.get('http://localhost:8333/');
    expect(response.ok()).toBe(true);

    const html = await response.text();
    // Should contain Angular app bootstrap
    expect(html).toContain('app-root');
  });
});

test.describe('Docker Container Authentication', () => {
  test('should register a new user', async ({ page }) => {
    const username = `docker-test-${Date.now()}`;
    const password = 'TestPassword123!';

    const response = await page.request.post(
      'http://localhost:8333/api/v1/auth/register',
      {
        data: { username, password },
      }
    );

    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('token');
  });

  test('should login with registered user', async ({ page }) => {
    const username = `docker-login-${Date.now()}`;
    const password = 'TestPassword123!';

    // Register first
    await page.request.post('http://localhost:8333/api/v1/auth/register', {
      data: { username, password },
    });

    // Then login
    const response = await page.request.post(
      'http://localhost:8333/api/v1/auth/login',
      {
        data: { username, password },
      }
    );

    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('token');
  });

  test('authenticated user can access protected endpoints', async ({
    authenticatedPage: page,
  }) => {
    // Try to get user's projects (protected endpoint)
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();

    const response = await page.request.get(
      'http://localhost:8333/api/v1/projects',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.ok()).toBe(true);
  });
});

test.describe('Docker Container Project Operations', () => {
  test('should create and retrieve a project', async ({
    authenticatedPage: page,
  }) => {
    const projectTitle = `Docker Test Project ${Date.now()}`;
    const projectSlug = `docker-test-${Date.now()}`;

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    // Create project via API
    const createResponse = await page.request.post(
      'http://localhost:8333/api/v1/projects',
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: projectTitle,
          slug: projectSlug,
          description: 'Test project created in Docker e2e',
        },
      }
    );

    expect(createResponse.ok()).toBe(true);
    const project = await createResponse.json();
    expect(project.title).toBe(projectTitle);

    // Retrieve project
    const getResponse = await page.request.get(
      'http://localhost:8333/api/v1/projects',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    expect(getResponse.ok()).toBe(true);
    const projects = await getResponse.json();
    expect(projects.some((p: { slug: string }) => p.slug === projectSlug)).toBe(
      true
    );
  });

  test('should navigate to project page in UI', async ({
    authenticatedPage: page,
  }) => {
    const projectTitle = `UI Nav Test ${Date.now()}`;
    const projectSlug = `ui-nav-test-${Date.now()}`;

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    // Create project via API
    await page.request.post('http://localhost:8333/api/v1/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: projectTitle,
        slug: projectSlug,
        description: 'Test project for UI navigation',
      },
    });

    // Navigate to home and find the project
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should see the project in the list
    await expect(page.getByText(projectTitle)).toBeVisible({ timeout: 10000 });

    // Click on the project
    await page.getByText(projectTitle).click();

    // Should navigate to project page
    await expect(page).toHaveURL(new RegExp(`/${projectSlug}`), {
      timeout: 10000,
    });
  });
});

test.describe('Docker Container Database Persistence', () => {
  test('database should be functional', async ({ page }) => {
    // This test verifies that SQLite is working correctly in the container
    // by performing operations that require database writes

    const username = `db-test-${Date.now()}`;
    const password = 'TestPassword123!';

    // Register creates a user in DB
    const registerResponse = await page.request.post(
      'http://localhost:8333/api/v1/auth/register',
      {
        data: { username, password },
      }
    );
    expect(registerResponse.ok()).toBe(true);

    // Login reads from DB
    const loginResponse = await page.request.post(
      'http://localhost:8333/api/v1/auth/login',
      {
        data: { username, password },
      }
    );
    expect(loginResponse.ok()).toBe(true);

    // This proves DB reads/writes work
  });
});
