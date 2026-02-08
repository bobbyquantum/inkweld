import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { test } from './fixtures';

/**
 * Base directory for generated screenshots.
 * Screenshots are stored in docs/site/static/img/generated/ and gitignored.
 */
const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

test.describe('Documents List Tab Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('capture documents list - empty state light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    // Create a basic project (no demo template - will have no documents)
    await createProjectWithTwoSteps(
      page,
      'Empty Docs Project',
      'empty-docs-project'
    );
    await page.waitForURL(/\/demouser\/empty-docs-project/);
    await page.waitForTimeout(500);

    // Navigate to documents list tab
    await page.goto('/demouser/empty-docs-project/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Wait for empty state to render
    await page.waitForSelector('.empty-card, .documents-header', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'documents-list-empty-light.png'),
      fullPage: true,
    });
  });

  test('capture documents list - empty state dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(page, 'Empty Docs Dark', 'empty-docs-dark');
    await page.waitForURL(/\/demouser\/empty-docs-dark/);
    await page.waitForTimeout(500);

    await page.goto('/demouser/empty-docs-dark/documents-list');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForSelector('.empty-card, .documents-header', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'documents-list-empty-dark.png'),
      fullPage: true,
    });
  });

  test('capture documents list - with documents light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    // Create project with worldbuilding-demo template (includes documents)
    await createProjectWithTwoSteps(
      page,
      'Docs Showcase',
      'docs-showcase',
      'A project with sample documents',
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/demouser\/docs-showcase/);
    await page.waitForTimeout(500);

    // Navigate to documents list
    await page.goto('/demouser/docs-showcase/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Wait for content (table or empty)
    await page.waitForSelector(
      '.documents-table, .empty-card, .documents-header',
      {
        state: 'visible',
      }
    );
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'documents-list-desktop-light.png'),
      fullPage: true,
    });
  });

  test('capture documents list - with documents dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Docs Showcase Dark',
      'docs-showcase-dark',
      'A project with sample documents',
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/demouser\/docs-showcase-dark/);
    await page.waitForTimeout(500);

    await page.goto('/demouser/docs-showcase-dark/documents-list');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForSelector(
      '.documents-table, .empty-card, .documents-header',
      {
        state: 'visible',
      }
    );
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'documents-list-desktop-dark.png'),
      fullPage: true,
    });
  });
});
