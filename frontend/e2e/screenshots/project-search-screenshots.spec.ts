/**
 * Project Search Screenshot Tests
 *
 * Captures the project-wide search dialog (Cmd/Ctrl + Shift + F) with
 * highlighted results from several documents, in light and dark mode.
 * Output: docs/site/static/img/features/project-search-results-{light,dark}.png
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  pressShortcut,
} from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

const DOCUMENTS = [
  {
    name: 'Chapter One - The Storm',
    body: 'The keeper climbed the lighthouse stairs as the storm rolled in from the west. Below, the harbour lights went out one by one.',
  },
  {
    name: 'Chapter Two - The Wreck',
    body: 'By morning the lighthouse was dark. Ada found the supply boat broken on the rocks, its cargo scattered along the shore.',
  },
  {
    name: 'Notes - Setting',
    body: 'The lighthouse stands on a granite spur at the mouth of the bay. Its lamp has not failed in forty years.',
  },
] as const;

async function setupProjectWithDocuments(
  page: Page,
  projectSlug: string
): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[data-testid="empty-state"]', {
    state: 'visible',
  });

  await createProjectWithTwoSteps(page, 'The Lighthouse', projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));
  await expect(page.getByTestId('project-tree')).toBeVisible();

  // Documents are created one at a time: each one opens in the editor, which
  // has to receive its text before the next dialog is opened.
  for (const doc of DOCUMENTS) {
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();

    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(doc.name);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });

    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill(doc.body);
    await expect(editor).toContainText(doc.body);
  }
}

async function captureSearchResults(page: Page, path: string): Promise<void> {
  await pressShortcut(page, 'Shift+f');
  const dialog = page.getByTestId('project-search-dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('project-search-input').fill('lighthouse');

  const results = page.getByTestId('project-search-results');
  await expect(
    results.locator('[data-testid^="project-search-result-"]')
  ).toHaveCount(DOCUMENTS.length);
  await expect(page.getByTestId('project-search-progress')).toBeHidden();

  await captureElementScreenshot(page, [dialog], path, 16);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test.describe('Project Search Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('project search screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupProjectWithDocuments(page, 'search-demo-light');
    await captureSearchResults(
      page,
      join(screenshotsDir, 'project-search-results-light.png')
    );
  });

  test('project search screenshots — dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectWithDocuments(page, 'search-demo-dark');
    await captureSearchResults(
      page,
      join(screenshotsDir, 'project-search-results-dark.png')
    );
  });
});
