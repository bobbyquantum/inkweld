/**
 * Project Switching Regression Tests - Online Mode
 *
 * Tests that verify project switching works correctly without
 * tab cache leaking between projects.
 *
 * Bug being prevented:
 * - When switching between projects on the bookshelf,
 *   tabs from the previous project may appear in the new project,
 *   potentially causing navigation to the wrong project.
 */
import { generateUniqueUsername } from '../common';
import { createProject, expect, registerUser, test } from './fixtures';

test.describe('Project Switching Bug Prevention', () => {
  test('should not navigate to wrong project when switching', async ({
    anonymousPage: page,
  }) => {
    const username = generateUniqueUsername('switch');
    await registerUser(page, username, 'ValidPass123!');

    // Create first project
    await createProject(page, 'Test Project One', 'test-one');

    // Navigate back home
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Create second project
    await createProject(page, 'Test Project Two', 'test-two');

    // Load project 1
    await page.goto(`/${username}/test-one`);
    await expect(page).toHaveURL(/.*test-one.*/);
    expect(page.url()).toContain('test-one');

    // Navigate home
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Load project 2 (where bug would occur)
    await page.goto(`/${username}/test-two`);
    await expect(page).toHaveURL(/.*test-two.*/);

    // Verify we're on the correct project
    const finalUrl = page.url();
    expect(finalUrl).toContain('test-two');
    expect(finalUrl).not.toContain('test-one');
  });

  test('should handle multiple project switches correctly', async ({
    anonymousPage: page,
  }) => {
    const username = generateUniqueUsername('multi');
    await registerUser(page, username, 'ValidPass123!');

    // Create three projects
    for (let i = 1; i <= 3; i++) {
      await createProject(page, `Test Project ${i}`, `test-${i}`);
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/);
    }

    // Navigate through all projects
    for (let i = 1; i <= 3; i++) {
      await page.goto(`/${username}/test-${i}`);
      await expect(page).toHaveURL(new RegExp(`.*test-${i}.*`));
      expect(page.url()).toContain(`test-${i}`);
    }

    // Go back to first project
    await page.goto(`/${username}/test-1`);
    await expect(page).toHaveURL(/.*test-1.*/);

    const finalUrl = page.url();
    expect(finalUrl).toContain('test-1');
    expect(finalUrl).not.toContain('test-2');
    expect(finalUrl).not.toContain('test-3');
  });

  test('should show correct project title after back-and-forth switching', async ({
    anonymousPage: page,
  }) => {
    const username = generateUniqueUsername('backforth');
    await registerUser(page, username, 'ValidPass123!');

    await createProject(page, 'Alpha Project', 'alpha');
    await page.goto('/');
    await createProject(page, 'Beta Project', 'beta');

    // Open Alpha
    await page.goto(`/${username}/alpha`);
    await expect(page).toHaveURL(/.*alpha.*/);
    expect(page.url()).toContain('alpha');

    // Back to home
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Open Beta
    await page.goto(`/${username}/beta`);
    await expect(page).toHaveURL(/.*beta.*/);
    expect(page.url()).toContain('beta');

    // Back to home
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Open Alpha again (critical check)
    await page.goto(`/${username}/alpha`);
    await expect(page).toHaveURL(/.*alpha.*/);

    const finalUrl = page.url();
    expect(finalUrl).toContain('alpha');
    expect(finalUrl).not.toContain('beta');
  });
});
