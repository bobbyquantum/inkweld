/**
 * Tab Restore Tests - Local Mode
 *
 * Leaving a project and coming back through the project list must reopen the
 * tabs that were open, with the tab that was active when the user left
 * selected again. A regression here saved an empty tab list over the cache on
 * re-entry, so the user always came back to a bare Home tab.
 */
import { type Page } from '@playwright/test';

import { openProjectFromGrid } from '../common/test-helpers';
import { expect, test } from './fixtures';

async function openProject(page: Page): Promise<void> {
  if (await page.getByTestId('project-card').first().isVisible()) {
    await openProjectFromGrid(page);
  }
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

async function createDocument(page: Page, name: string): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-item').click();

  const dialogInput = page.getByTestId('element-name-input');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

async function exitAndReenter(page: Page): Promise<void> {
  await page.getByTestId('sidebar-exit-button').click();
  await page.waitForURL('/');
  await openProject(page);
}

test.describe('Tab restore', () => {
  test('reopens open tabs and the active tab after leaving the project', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createDocument(page, 'Chapter One');
    await createDocument(page, 'Chapter Two');

    await test.step('open both documents, leave the first one active', async () => {
      await page.getByTestId('element-Chapter One').click();
      await page.getByTestId('element-Chapter Two').click();
      await page.getByTestId('tab-Chapter One').click();
      await expect(page).toHaveURL(/\/document\/[^/]+$/);
    });

    const activeDocumentUrl = page.url();

    await test.step('tabs and active tab survive exit and re-entry', async () => {
      await exitAndReenter(page);

      await expect(page.getByTestId('tab-Chapter One')).toBeVisible();
      await expect(page.getByTestId('tab-Chapter Two')).toBeVisible();
      await expect(page).toHaveURL(activeDocumentUrl);
    });

    await test.step('Home stays selected when Home was active', async () => {
      await page.getByTestId('home-tab-button').click();
      await expect(page.getByTestId('home-tab-content')).toBeVisible();

      await exitAndReenter(page);

      await expect(page.getByTestId('tab-Chapter One')).toBeVisible();
      await expect(page.getByTestId('home-tab-content')).toBeVisible();
      await expect(page).not.toHaveURL(/\/document\//);
    });
  });
});
