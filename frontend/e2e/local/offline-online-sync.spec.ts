/**
 * Offline/Online Sync Behavior Tests - Local Mode
 *
 * Verifies three critical sync behaviors:
 *
 * 1. In offline mode, element tree, documents, and worldbuilding elements
 *    are always available (persisted via IndexedDB with Yjs).
 *
 * 2. When elements are created (offline or online-first), the initial
 *    document data is stored locally in the browser's IndexedDB.
 *
 * 3. If a document reference exists in the element tree but its content
 *    was never synced to IndexedDB (e.g., another user added it remotely
 *    and we lost connection before the content arrived), we can detect
 *    that the document is unavailable locally.
 *
 * All tests run in pure local mode — any API/WebSocket request fails the test.
 *
 * NOTE: Tests are consolidated into three `test()` blocks (one per describe)
 * using `test.step()`, so the project-open cost is paid once per group rather
 * than 14 times. Each step uses uniquely-named elements to avoid collisions.
 */

import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all IndexedDB database names in the browser context.
 */
async function listIndexedDBDatabases(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      return dbs.map(db => db.name).filter((n): n is string => n != null);
    }
    return [];
  });
}

/**
 * Check if an IndexedDB database exists and has object stores (i.e. has been synced).
 */
async function checkIndexedDBAvailability(
  page: Page,
  docId: string
): Promise<boolean> {
  return page.evaluate(async (id: string) => {
    return new Promise<boolean>(resolve => {
      try {
        const request = indexedDB.open(id);
        request.onsuccess = () => {
          const db = request.result;
          const hasData = db.objectStoreNames.length > 0;
          db.close();
          resolve(hasData);
        };
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }, docId);
}

/**
 * Create a document element and wait for it to appear in the tree.
 */
async function createDocumentElement(page: Page, name: string) {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-item').click();
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

/**
 * Create a worldbuilding character element and wait for it to appear.
 */
async function createCharacterElement(page: Page, name: string) {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-character-v1').click();
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

/**
 * Create a worldbuilding location element and wait for it to appear.
 */
async function createLocationElement(page: Page, name: string) {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-location-v1').click();
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

/**
 * Create a folder element and wait for it to appear.
 */
async function createFolderElement(page: Page, name: string) {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-folder').click();
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Offline Availability
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Offline Mode - Element Availability', () => {
  test.slow();

  test('element tree, documents, worldbuilding, folders are all available offline', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await test.step('element tree shows default README', async () => {
      await expect(page.getByTestId('project-tree')).toBeVisible();
      await expect(page.getByTestId('element-README')).toBeVisible();
    });

    await test.step('create and open a document element offline', async () => {
      await createDocumentElement(page, 'Offline Document');
      await page.getByTestId('element-Offline Document').click();
      await expect(page).toHaveURL(/document\/.+/);

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();

      await editor.click();
      await page.keyboard.insertText('Hello offline world');
      await expect(editor).toContainText('Hello offline world');
    });

    await test.step('create and open a worldbuilding character offline', async () => {
      await createCharacterElement(page, 'Offline Character');
      await page.getByTestId('element-Offline Character').click();
      await expect(page).toHaveURL(/worldbuilding\/.+/);
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
    });

    await test.step('create and open a worldbuilding location offline', async () => {
      await createLocationElement(page, 'Offline Location');
      await page.getByTestId('element-Offline Location').click();
      await expect(page).toHaveURL(/worldbuilding\/.+/);
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
    });

    await test.step('create and open a folder element offline', async () => {
      await createFolderElement(page, 'Offline Folder');
      await page.getByTestId('element-Offline Folder').click();
      await expect(page).toHaveURL(/folder\/.+/);
    });

    await test.step('document content is retained after navigating away and back', async () => {
      await createDocumentElement(page, 'Persistent Doc');
      await page.getByTestId('element-Persistent Doc').click();
      await expect(page).toHaveURL(/document\/.+/);

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.insertText('Persistent content here');
      await expect(editor).toContainText('Persistent content here');

      await page.getByTestId('toolbar-home-button').click();
      await page.getByTestId('element-Persistent Doc').click();
      await expect(page).toHaveURL(/document\/.+/);

      const editorAgain = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editorAgain).toContainText('Persistent content here');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Initial Document Data Created in Local Browser
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Local Document Creation - IndexedDB Storage', () => {
  test.slow();

  test('document, worldbuilding, and tree data persist to IndexedDB', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await test.step('document content is stored in IndexedDB', async () => {
      await createDocumentElement(page, 'IndexedDB Doc');
      await page.getByTestId('element-IndexedDB Doc').click();
      await expect(page).toHaveURL(/document\/.+/);

      const elementId = new URL(page.url()).pathname.split('/').pop()!;
      const expectedDocDb = `testuser:test-project:${elementId}`;

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.insertText('Stored in IndexedDB');

      await expect
        .poll(async () => {
          const dbs = await listIndexedDBDatabases(page);
          return dbs.includes(expectedDocDb);
        })
        .toBe(true);
    });

    await test.step('worldbuilding data is stored in IndexedDB', async () => {
      await createCharacterElement(page, 'Stored Character');
      await page.getByTestId('element-Stored Character').click();
      await expect(page).toHaveURL(/worldbuilding\/.+/);
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

      const elementId = new URL(page.url()).pathname.split('/').pop()!;
      const expectedWbDb = `worldbuilding:testuser:test-project:${elementId}`;

      await expect
        .poll(async () => {
          const dbs = await listIndexedDBDatabases(page);
          return dbs.includes(expectedWbDb);
        })
        .toBe(true);
    });

    await test.step('element tree is stored in IndexedDB as a unified Yjs document', async () => {
      await createDocumentElement(page, 'Tree Doc 1');
      await createCharacterElement(page, 'Tree Char 1');
      await createFolderElement(page, 'Tree Folder 1');

      await expect(page.getByTestId('element-Tree Doc 1')).toBeVisible();
      await expect(page.getByTestId('element-Tree Char 1')).toBeVisible();
      await expect(page.getByTestId('element-Tree Folder 1')).toBeVisible();

      const expectedElementsDb = 'local:testuser:test-project:elements';
      await expect
        .poll(async () => {
          const dbs = await listIndexedDBDatabases(page);
          return dbs.includes(expectedElementsDb);
        })
        .toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Detection of Unsynchronized Documents
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Unsynchronized Document Detection', () => {
  test.slow();

  test('availability detection: phantom IDs, deletion, empty editors, and synced warnings', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await test.step('phantom doc IDs are detected as unavailable; real ones available', async () => {
      await createDocumentElement(page, 'Synced Doc');
      await page.getByTestId('element-Synced Doc').click();
      await expect(page).toHaveURL(/document\/.+/);

      const elementId = new URL(page.url()).pathname.split('/').pop()!;
      const expectedDocDb = `testuser:test-project:${elementId}`;

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.insertText('Real document content');

      await expect
        .poll(async () => {
          return checkIndexedDBAvailability(page, expectedDocDb);
        })
        .toBe(true);

      const phantomDocId = 'testuser:test-project:phantom-element-id-12345';
      const phantomAvailable = await checkIndexedDBAvailability(
        page,
        phantomDocId
      );
      expect(phantomAvailable).toBe(false);

      const realDocAvailable = await checkIndexedDBAvailability(
        page,
        expectedDocDb
      );
      expect(realDocAvailable).toBe(true);
    });

    await test.step('deleting an IndexedDB DB makes the doc unavailable', async () => {
      await createDocumentElement(page, 'To Be Removed');
      await page.getByTestId('element-To Be Removed').click();
      await expect(page).toHaveURL(/document\/.+/);

      const elementId = new URL(page.url()).pathname.split('/').pop()!;
      const expectedDocDb = `testuser:test-project:${elementId}`;

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.insertText('Content that will be lost');

      await expect
        .poll(async () => {
          return checkIndexedDBAvailability(page, expectedDocDb);
        })
        .toBe(true);

      await page.getByTestId('toolbar-home-button').click();

      const beforeDelete = await checkIndexedDBAvailability(
        page,
        expectedDocDb
      );

      await page.evaluate(async (docId: string) => {
        await new Promise<void>((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(docId);
          deleteReq.onsuccess = () => resolve();
          deleteReq.onerror = () => reject(new Error(String(deleteReq.error)));
        });
      }, expectedDocDb);

      const afterDelete = await checkIndexedDBAvailability(page, expectedDocDb);

      expect(beforeDelete).toBe(true);
      expect(afterDelete).toBe(false);
    });

    await test.step('opening a doc with no IndexedDB shows empty editor', async () => {
      await createDocumentElement(page, 'Phantom Test');
      await page.getByTestId('element-Phantom Test').click();
      await expect(page).toHaveURL(/document\/.+/);

      const elementId = new URL(page.url()).pathname.split('/').pop()!;
      const expectedDocDb = `testuser:test-project:${elementId}`;

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.insertText('Original content');

      await expect
        .poll(async () => {
          return checkIndexedDBAvailability(page, expectedDocDb);
        })
        .toBe(true);

      await page.getByTestId('toolbar-home-button').click();
      await expect(page.getByTestId('element-Phantom Test')).toBeVisible();

      await page.evaluate(async (docId: string) => {
        await new Promise<void>(resolve => {
          const req = indexedDB.deleteDatabase(docId);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }, expectedDocDb);

      await page.getByTestId('element-Phantom Test').click();
      await expect(page).toHaveURL(/document\/.+/);

      const editorAfter = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editorAfter).toBeVisible();
      await expect(editorAfter).not.toContainText('Original content');
    });

    await test.step('worldbuilding elements that synced do NOT show warning', async () => {
      await createCharacterElement(page, 'Synced Character');
      await page.getByTestId('element-Synced Character').click();
      await expect(page).toHaveURL(/worldbuilding\/.+/);
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

      await expect(
        page.getByTestId('unsynchronized-document-warning')
      ).not.toBeVisible();
    });

    await test.step('document elements that synced do NOT show warning', async () => {
      await createDocumentElement(page, 'Synced Document');
      await page.getByTestId('element-Synced Document').click();
      await expect(page).toHaveURL(/document\/.+/);

      const editor = page
        .getByTestId('document-editor')
        .locator('[contenteditable="true"]');
      await expect(editor).toBeVisible();

      await expect(
        page.getByTestId('unsynchronized-document-warning')
      ).not.toBeVisible();
    });
  });
});
