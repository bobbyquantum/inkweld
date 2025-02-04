import { test } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

test.describe('PWA Screenshots', () => {
  const mockProject = {
    id: '123',
    name: 'Demo Project',
    description: 'A sample project for PWA screenshots',
    elements: [
      {
        id: '1',
        name: 'Root',
        type: 'container',
        children: ['2', '3'],
      },
      {
        id: '2',
        name: 'Header',
        type: 'text',
        content: 'Welcome to Demo Project',
      },
      {
        id: '3',
        name: 'Content',
        type: 'text',
        content: 'This is a sample project content.',
      },
    ],
  };

  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    const screenshotsDir = join(process.cwd(), 'public', 'screenshots');
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  test('capture desktop screenshot', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Mock API response for project data
    await page.route('**/api/projects/**', async route => {
      await route.fulfill({ json: mockProject });
    });

    // Navigate to project page
    await page.goto('/projects/123');

    // Wait for content to load and any animations to complete
    await page.waitForSelector('text=Demo Project');
    await page.waitForTimeout(1000); // Wait for any animations

    // Take screenshot
    await page.screenshot({
      path: join(process.cwd(), 'public', 'screenshots', 'desktop.png'),
      fullPage: true,
    });
  });

  test('capture mobile screenshot', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 750, height: 1334 });

    // Mock API response for project data
    await page.route('**/api/projects/**', async route => {
      await route.fulfill({ json: mockProject });
    });

    // Navigate to project page
    await page.goto('/projects/123');

    // Wait for content to load and any animations to complete
    await page.waitForSelector('text=Demo Project');
    await page.waitForTimeout(1000); // Wait for any animations

    // Take screenshot
    await page.screenshot({
      path: join(process.cwd(), 'public', 'screenshots', 'mobile.png'),
      fullPage: true,
    });
  });
});
