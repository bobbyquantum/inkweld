import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';

test.describe('PWA Screenshots', () => {
  const mockProject = {
    id: '123',
    title: 'Demo Project',
    description: 'A sample project for PWA screenshots',
    username: 'testuser',
    slug: 'demo-project',
  };

  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    const screenshotsDir = join(process.cwd(), 'public', 'screenshots');
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  test('capture desktop screenshot', async ({ authenticatedPage: page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Mock API response for project data
    await page.route('**/api/v1/projects/**', async route => {
      await route.fulfill({ json: mockProject });
    });

    // Navigate to project page
    await page.goto(`/${mockProject.username}/${mockProject.slug}`);
    await page.waitForSelector('text=Demo Project', { state: 'visible' });
    await page.waitForTimeout(1000); // Wait for any animations

    // Take screenshot
    await page.screenshot({
      path: join(process.cwd(), 'public', 'screenshots', 'desktop.png'),
      fullPage: true,
    });
  });

  test('capture mobile screenshot', async ({ authenticatedPage: page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 750, height: 1334 });

    // Mock API response for project data
    await page.route('**/api/v1/projects/**', async route => {
      await route.fulfill({ json: mockProject });
    });

    // Navigate to project page
    await page.goto(`/${mockProject.username}/${mockProject.slug}`);

    // Wait for content to load and any animations to complete
    await page.waitForSelector('text=Demo Project', { state: 'visible' });
    await page.waitForTimeout(1000); // Wait for any animations

    // Take screenshot
    await page.screenshot({
      path: join(process.cwd(), 'public', 'screenshots', 'mobile.png'),
      fullPage: true,
    });
  });
});
