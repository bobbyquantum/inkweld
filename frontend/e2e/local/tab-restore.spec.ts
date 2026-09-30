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
  // Wait for the grid: openProject's isVisible() check doesn't wait, and
  // skipping the click would leave us waiting for the tree on the home page.
  await expect(page.getByTestId('project-card').first()).toBeVisible();
  await openProjectFromGrid(page);
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

test.describe('Tab restore', () => {
  test('reopens open tabs and the active tab after leaving the project', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createDocument(page, 'Chapter One');
    await createDocument(page, 'Chapter Two');

    let chapterOneUrl = '';

    await test.step('open both documents, leave the first one active', async () => {
      // Creating a document opens it; start from Home so the first document
      // URL we see can only be Chapter One's.
      await page.getByTestId('home-tab-button').click();
      await expect(page).not.toHaveURL(/\/document\//);

      await page.getByTestId('element-Chapter One').click();
      await expect(page).toHaveURL(/\/document\/[^/]+$/);
      chapterOneUrl = page.url();

      await page.getByTestId('element-Chapter Two').click();
      await expect(page).toHaveURL(/\/document\/[^/]+$/);
      await expect(page).not.toHaveURL(chapterOneUrl);

      await page.getByTestId('tab-Chapter One').click();
      await expect(page).toHaveURL(chapterOneUrl);
    });

    await test.step('tabs and active tab survive exit and re-entry', async () => {
      await exitAndReenter(page);

      await expect(page.getByTestId('tab-Chapter One')).toBeVisible();
      await expect(page.getByTestId('tab-Chapter Two')).toBeVisible();
      await expect(page).toHaveURL(chapterOneUrl);
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

/** The active tab id saved to the tab cache for the test project. */
async function savedSelectedTabId(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('local:documentCache');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error('IndexedDB request failed'));
    });
    try {
      if (!db.objectStoreNames.contains('openedDocuments')) return null;
      return await new Promise<unknown>((resolve, reject) => {
        const req = db
          .transaction('openedDocuments')
          .objectStore('openedDocuments')
          .get('testuser/test-project/documents/selected');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error ?? new Error('IndexedDB request failed'));
      });
    } finally {
      db.close();
    }
  });
}

/**
 * Closing and reopening the app (e.g. the Android app, which always starts
 * at "/") must also reopen the active document. On phones there is no tab
 * bar, which used to do both the saving of the selection and the reopening.
 */
test.describe('Tab restore after reopening the app', () => {
  for (const layout of ['desktop', 'phone'] as const) {
    test(`reopens the active document after a full reload (${layout})`, async ({
      localPageWithProject: page,
    }) => {
      // Create the documents at desktop width, where the tree is always shown.
      await openProject(page);
      await createDocument(page, 'Chapter One');
      await createDocument(page, 'Chapter Two');
      await page.getByTestId('home-tab-button').click();
      await expect(page).not.toHaveURL(/\/document\//);

      if (layout === 'phone') {
        await page.setViewportSize({ width: 412, height: 915 });
        // At phone width the project tree sits behind the hamburger.
        await page
          .locator('mat-toolbar.mobile-toolbar button[mat-icon-button]')
          .first()
          .click();
      }

      // Chapter One is already open (creating it opened it), so this only
      // changes the selection.
      await page.getByTestId('element-Chapter One').click();
      await expect(page).toHaveURL(/\/document\/[^/]+$/);
      const chapterOneUrl = page.url();
      const chapterOneId = chapterOneUrl.split('/').at(-1);
      await expect.poll(() => savedSelectedTabId(page)).toBe(chapterOneId);

      await page.goto('/');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      await openProjectFromGrid(page);

      await expect(page).toHaveURL(chapterOneUrl);
    });
  }
});

/**
 * Which folders are open in the project tree is remembered per device, so
 * coming back to the project (in-app or after a reload) doesn't collapse
 * everything.
 */
test.describe('Project tree state restore', () => {
  async function createFolder(page: Page, name: string): Promise<void> {
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-folder').click();
    const dialogInput = page.getByTestId('element-name-input');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill(name);
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId(`element-${name}`)).toBeVisible();
  }

  test('keeps expanded folders after leaving and after a reload', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createFolder(page, 'Open Folder');
    await createFolder(page, 'Closed Folder');

    const openFolder = page.getByTestId('element-Open Folder');
    const closedFolder = page.getByTestId('element-Closed Folder');

    await page.locator('[data-expand-folder="Open Folder"]').click();
    await expect(openFolder).toHaveAttribute('aria-expanded', 'true');
    await expect(closedFolder).toHaveAttribute('aria-expanded', 'false');

    await test.step('survives exit and re-entry', async () => {
      await exitAndReenter(page);
      await expect(openFolder).toHaveAttribute('aria-expanded', 'true');
      await expect(closedFolder).toHaveAttribute('aria-expanded', 'false');
    });

    await test.step('survives a full reload', async () => {
      await page.goto('/');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      await openProjectFromGrid(page);
      await expect(openFolder).toHaveAttribute('aria-expanded', 'true');
      await expect(closedFolder).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
