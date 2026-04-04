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
  test('should show element tree with all element types in offline mode', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project created by the fixture
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Element tree should be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // The default README element should be present
    await expect(page.getByTestId('element-README')).toBeVisible();
  });

  test('should create and open a document element offline', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document element
    await createDocumentElement(page, 'Offline Document');

    // Click it to open the document tab
    await page.getByTestId('element-Offline Document').click();
    await expect(page).toHaveURL(/document\/.+/);

    // ProseMirror editor should be visible and editable
    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();

    // Type content and verify it persists
    await editor.click();
    await editor.pressSequentially('Hello offline world');
    await expect(editor).toContainText('Hello offline world');
  });

  test('should create and open a worldbuilding character offline', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a character element
    await createCharacterElement(page, 'Offline Character');

    // Click it to open the worldbuilding tab
    await page.getByTestId('element-Offline Character').click();
    await expect(page).toHaveURL(/worldbuilding\/.+/);

    // Worldbuilding editor should be visible
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
  });

  test('should create and open a worldbuilding location offline', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a location element
    await createLocationElement(page, 'Offline Location');

    // Click it to open the worldbuilding tab
    await page.getByTestId('element-Offline Location').click();
    await expect(page).toHaveURL(/worldbuilding\/.+/);

    // Worldbuilding editor should be visible
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
  });

  test('should create and open a folder element offline', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a folder element
    await createFolderElement(page, 'Offline Folder');

    // Click it to open the folder tab
    await page.getByTestId('element-Offline Folder').click();
    await expect(page).toHaveURL(/folder\/.+/);
  });

  test('should retain document content after navigating away and back', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create and type in a document
    await createDocumentElement(page, 'Persistent Doc');
    await page.getByTestId('element-Persistent Doc').click();
    await expect(page).toHaveURL(/document\/.+/);

    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Persistent content here');
    await expect(editor).toContainText('Persistent content here');

    // Navigate to home
    await page.getByTestId('toolbar-home-button').click();

    // Navigate back to the document
    await page.getByTestId('element-Persistent Doc').click();
    await expect(page).toHaveURL(/document\/.+/);

    // Content should still be there (loaded from IndexedDB)
    const editorAgain = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editorAgain).toContainText('Persistent content here');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Initial Document Data Created in Local Browser
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Local Document Creation - IndexedDB Storage', () => {
  test('should store document data in IndexedDB when a document element is created', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document element and open it
    await createDocumentElement(page, 'IndexedDB Doc');
    await page.getByTestId('element-IndexedDB Doc').click();
    await expect(page).toHaveURL(/document\/.+/);

    // Extract element ID from URL to construct exact DB name
    const elementId = new URL(page.url()).pathname.split('/').pop()!;
    const expectedDocDb = `testuser:test-project:${elementId}`;

    // Type some content to trigger a Yjs update + IndexedDB persist
    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Stored in IndexedDB');

    // Wait for IndexedDB persistence to flush
    await expect
      .poll(async () => {
        const dbs = await listIndexedDBDatabases(page);
        return dbs.includes(expectedDocDb);
      })
      .toBe(true);
  });

  test('should store worldbuilding data in IndexedDB when a worldbuilding element is opened', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a character element and open it
    await createCharacterElement(page, 'Stored Character');
    await page.getByTestId('element-Stored Character').click();
    await expect(page).toHaveURL(/worldbuilding\/.+/);
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

    // Extract element ID from URL to construct exact DB name
    const elementId = new URL(page.url()).pathname.split('/').pop()!;
    const expectedWbDb = `worldbuilding:testuser:test-project:${elementId}`;

    // Wait for IndexedDB persistence to flush
    await expect
      .poll(async () => {
        const dbs = await listIndexedDBDatabases(page);
        return dbs.includes(expectedWbDb);
      })
      .toBe(true);
  });

  test('should store element tree in IndexedDB as a unified Yjs document', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Add multiple elements to the tree
    await createDocumentElement(page, 'Tree Doc 1');
    await createCharacterElement(page, 'Tree Char 1');
    await createFolderElement(page, 'Tree Folder 1');

    // All elements should be visible in the tree
    await expect(page.getByTestId('element-Tree Doc 1')).toBeVisible();
    await expect(page.getByTestId('element-Tree Char 1')).toBeVisible();
    await expect(page.getByTestId('element-Tree Folder 1')).toBeVisible();

    // Verify the elements tree Yjs document exists in IndexedDB
    const expectedElementsDb = 'local:testuser:test-project:elements';
    await expect
      .poll(async () => {
        const dbs = await listIndexedDBDatabases(page);
        return dbs.includes(expectedElementsDb);
      })
      .toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Detection of Unsynchronized Documents
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Unsynchronized Document Detection', () => {
  test('should detect when a document referenced in the tree has no local IndexedDB data', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document element and open it to trigger IndexedDB persistence
    await createDocumentElement(page, 'Synced Doc');
    await page.getByTestId('element-Synced Doc').click();
    await expect(page).toHaveURL(/document\/.+/);

    // Extract element ID from URL to construct exact DB name
    const elementId = new URL(page.url()).pathname.split('/').pop()!;
    const expectedDocDb = `testuser:test-project:${elementId}`;

    // Type content so the doc has data in IndexedDB
    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Real document content');

    // Wait for IndexedDB persistence to flush
    await expect
      .poll(async () => {
        return checkIndexedDBAvailability(page, expectedDocDb);
      })
      .toBe(true);

    // A fabricated document ID that was never synced — simulates the
    // scenario where another user added an element to the shared tree
    // and our browser received the reference but never got the content
    const phantomDocId = 'testuser:test-project:phantom-element-id-12345';
    const phantomAvailable = await checkIndexedDBAvailability(
      page,
      phantomDocId
    );

    // The phantom document should NOT be available — it was never synced
    expect(phantomAvailable).toBe(false);

    // But the real document should be available
    const realDocAvailable = await checkIndexedDBAvailability(
      page,
      expectedDocDb
    );
    expect(realDocAvailable).toBe(true);
  });

  test('should detect unavailability after deleting a documents IndexedDB data', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document and write content
    await createDocumentElement(page, 'To Be Removed');
    await page.getByTestId('element-To Be Removed').click();
    await expect(page).toHaveURL(/document\/.+/);

    // Extract element ID from URL to construct exact DB name
    const elementId = new URL(page.url()).pathname.split('/').pop()!;
    const expectedDocDb = `testuser:test-project:${elementId}`;

    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Content that will be lost');

    // Wait for IndexedDB persistence to flush
    await expect
      .poll(async () => {
        return checkIndexedDBAvailability(page, expectedDocDb);
      })
      .toBe(true);

    // Navigate away from the document
    await page.getByTestId('toolbar-home-button').click();

    // Delete the IndexedDB for this document — simulating the scenario where
    // the element tree knows about this document, but the content was never
    // synced to our browser (e.g., another user created it remotely and we
    // lost connection before the content arrived)
    const beforeDelete = await checkIndexedDBAvailability(page, expectedDocDb);

    // Delete the database
    await page.evaluate(async (docId: string) => {
      await new Promise<void>((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase(docId);
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => reject(new Error(String(deleteReq.error)));
      });
    }, expectedDocDb);

    const afterDelete = await checkIndexedDBAvailability(page, expectedDocDb);

    // Document was available before, unavailable after deletion
    expect(beforeDelete).toBe(true);
    expect(afterDelete).toBe(false);
  });

  test('should show empty editor when opening a document with no IndexedDB data', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document, open it, and type content
    await createDocumentElement(page, 'Phantom Test');
    await page.getByTestId('element-Phantom Test').click();
    await expect(page).toHaveURL(/document\/.+/);

    // Extract element ID from URL to construct exact DB name
    const elementId = new URL(page.url()).pathname.split('/').pop()!;
    const expectedDocDb = `testuser:test-project:${elementId}`;

    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Original content');

    // Wait for IndexedDB persistence to flush
    await expect
      .poll(async () => {
        return checkIndexedDBAvailability(page, expectedDocDb);
      })
      .toBe(true);

    // Navigate to home to close the document tab
    await page.getByTestId('toolbar-home-button').click();
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Delete only this document's IndexedDB to simulate unsynced state
    await page.evaluate(async (docId: string) => {
      await new Promise<void>(resolve => {
        const req = indexedDB.deleteDatabase(docId);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    }, expectedDocDb);

    // Re-open the document — it still exists in the element tree
    // but has no IndexedDB backing (simulates unsynchronized state)
    await page.getByTestId('element-Phantom Test').click();
    await expect(page).toHaveURL(/document\/.+/);

    // The editor should load but with empty content
    // (the original content was in the deleted IndexedDB)
    const editorAfter = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editorAfter).toBeVisible();

    // The original content should NOT be present
    await expect(editorAfter).not.toContainText('Original content');
  });
});
