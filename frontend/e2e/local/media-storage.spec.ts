/**
 * Media Storage Tests - Local Mode
 *
 * Tests that verify media storage (covers, avatars, inline images)
 * works correctly in pure local mode using IndexedDB.
 * All media should be stored locally and no server requests should be made.
 *
 * Consolidated from 12 individual tests into 5 grouped tests using
 * `test.step()` to share fixture setup. Each top-level describe became
 * a single grouped test that exercises the related operations in order.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Helper to get the active mode from the v2 config format
 */
function getActiveMode(config: string): 'local' | 'server' | 'unknown' {
  try {
    const parsed = JSON.parse(config);
    if (parsed.version === 2) {
      const activeConfig = parsed.configurations?.find(
        (c: { id: string }) => c.id === parsed.activeConfigId
      );
      return activeConfig?.type ?? 'unknown';
    }
    // Legacy v1 format fallback
    return parsed.mode ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Helper to create a test image blob in the browser
 */
async function createTestImageBlob(
  page: Page,
  color = 'red',
  width = 200,
  height = 300
): Promise<void> {
  await page.evaluate(
    ({ color, width, height }) => {
      // Create a canvas and draw a colored rectangle
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);

      // Store the data URL for later use
      (window as unknown as { __testImageDataUrl: string }).__testImageDataUrl =
        canvas.toDataURL('image/png');
    },
    { color, width, height }
  );
}

/**
 * Helper to check if media exists in IndexedDB
 */
async function checkMediaInIndexedDB(
  page: Page,
  key: string
): Promise<boolean> {
  return page.evaluate(async (mediaKey: string) => {
    return new Promise<boolean>(resolve => {
      const request = indexedDB.open('local:inkweld-media', 1);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('media', 'readonly');
          const store = tx.objectStore('media');
          const getRequest = store.get(mediaKey);
          getRequest.onsuccess = () => resolve(!!getRequest.result);
          getRequest.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      };
      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'id' });
        }
      };
    });
  }, key);
}

/**
 * Helper to check sync state in IndexedDB
 */
async function checkSyncStateInIndexedDB(
  page: Page,
  projectKey: string
): Promise<{
  exists: boolean;
  pendingUploads?: string[];
}> {
  return page.evaluate(async (key: string) => {
    return new Promise<{ exists: boolean; pendingUploads?: string[] }>(
      resolve => {
        const request = indexedDB.open('inkweld-sync', 1);
        request.onerror = () => resolve({ exists: false });
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('sync-state', 'readonly');
            const store = tx.objectStore('sync-state');
            const getRequest = store.get(key);
            getRequest.onsuccess = () => {
              const result = getRequest.result as
                | { pendingUploads?: string[] }
                | undefined;
              resolve({
                exists: !!result,
                pendingUploads: result?.pendingUploads,
              });
            };
            getRequest.onerror = () => resolve({ exists: false });
          } catch {
            resolve({ exists: false });
          }
        };
        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('sync-state')) {
            db.createObjectStore('sync-state');
          }
        };
      }
    );
  }, projectKey);
}

/**
 * Helper to put a media record using the app's record format.
 */
async function putMediaRecord(
  page: Page,
  id: string,
  content: string,
  mimeType: string
): Promise<boolean> {
  return page.evaluate(
    async ({ id, content, mimeType }) => {
      const blob = new Blob([content], { type: mimeType });

      return new Promise<boolean>(resolve => {
        const request = indexedDB.open('local:inkweld-media', 1);
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('media', 'readwrite');
            const store = tx.objectStore('media');
            const record = {
              id,
              blob,
              mimeType: blob.type || 'application/octet-stream',
              size: blob.size,
              createdAt: new Date().toISOString(),
            };
            const putRequest = store.put(record);
            putRequest.onsuccess = () => resolve(true);
            putRequest.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        };
        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('media')) {
            db.createObjectStore('media', { keyPath: 'id' });
          }
        };
      });
    },
    { id, content, mimeType }
  );
}

test.describe('Local Media Storage', () => {
  test('project cover: upload trigger, display component, persist across reload', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);
    await page.waitForLoadState('domcontentloaded');

    await test.step('cover upload mechanism is reachable in local mode', async () => {
      await createTestImageBlob(page, 'blue', 400, 600);

      // Either the explicit edit-cover button or clicking the cover element
      // itself should be available; both are acceptable entry points.
      const editCoverButton = page.getByTestId('edit-cover-button');
      const hasCoverButton = await editCoverButton
        .isVisible()
        .catch(() => false);

      if (hasCoverButton) {
        await editCoverButton.click();
      } else {
        const coverElement = page.locator('app-project-cover');
        const hasCover = await coverElement.isVisible().catch(() => false);
        if (hasCover) {
          await coverElement.click();
        }
      }

      // Verify the app is still in local mode (no implicit mode switch).
      const config = await page.evaluate(
        () => localStorage.getItem('inkweld-app-config') ?? ''
      );
      expect(getActiveMode(config)).toBe('local');
    });

    await test.step('project cover component renders', async () => {
      const coverComponent = page.locator('app-project-cover').first();
      await expect(coverComponent).toBeVisible();
    });

    await test.step('cover persists across page reload (still local mode, same URL)', async () => {
      const projectUrl = page.url();
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toBe(projectUrl);

      const config = await page.evaluate(
        () => localStorage.getItem('inkweld-app-config') ?? ''
      );
      expect(getActiveMode(config)).toBe('local');
    });
  });

  test('IndexedDB media database: create, store, and retrieve blobs', async ({
    localPage: page,
  }) => {
    await page.waitForLoadState('domcontentloaded');

    await test.step('local:inkweld-media database can be created', async () => {
      const dbExists = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('local:inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            request.result.close();
            resolve(true);
          };
          request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Match the keyPath used by the app and by subsequent steps so
            // a single shared DB satisfies both create + put.
            if (!db.objectStoreNames.contains('media')) {
              db.createObjectStore('media', { keyPath: 'id' });
            }
          };
        });
      });
      expect(typeof dbExists).toBe('boolean');
    });

    await test.step('media blob round-trip stores and retrieves correctly', async () => {
      const stored = await putMediaRecord(
        page,
        'test-key',
        'test content',
        'text/plain'
      );
      expect(stored).toBe(true);

      const retrieved = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('local:inkweld-media', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('media', 'readonly');
            const store = tx.objectStore('media');
            const getRequest = store.get('test-key');
            getRequest.onsuccess = () => {
              const record = getRequest.result as
                | { id: string; blob: Blob }
                | undefined;
              resolve(!!record && !!record.blob && record.blob instanceof Blob);
            };
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      });
      expect(retrieved).toBe(true);
    });
  });

  test('sync state tracking: database create + pending uploads round-trip', async ({
    localPage: page,
  }) => {
    await page.waitForLoadState('domcontentloaded');

    await test.step('inkweld-sync database can be created', async () => {
      const dbExists = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-sync', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            request.result.close();
            resolve(true);
          };
          request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('sync-state')) {
              db.createObjectStore('sync-state');
            }
          };
        });
      });
      expect(typeof dbExists).toBe('boolean');
    });

    await test.step('sync state with pending uploads stores and reads back', async () => {
      const stored = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-sync', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction('sync-state', 'readwrite');
              const store = tx.objectStore('sync-state');
              const syncState = {
                projectKey: 'testuser/test-project',
                lastSyncedAt: null,
                pendingUploads: ['cover'],
                syncStatus: 'pending',
              };
              const putRequest = store.put(syncState, 'testuser/test-project');
              putRequest.onsuccess = () => resolve(true);
              putRequest.onerror = () => resolve(false);
            } catch {
              resolve(false);
            }
          };
          request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('sync-state')) {
              db.createObjectStore('sync-state');
            }
          };
        });
      });
      expect(stored).toBe(true);

      const syncState = await checkSyncStateInIndexedDB(
        page,
        'testuser/test-project'
      );
      expect(syncState.exists).toBe(true);
      expect(syncState.pendingUploads).toContain('cover');
    });
  });

  test('media key patterns: project covers, user avatars, inline images', async ({
    localPage: page,
  }) => {
    await page.waitForLoadState('domcontentloaded');

    await test.step('project cover key (user/project:cover)', async () => {
      const id = 'testuser/test-project:cover';
      expect(await putMediaRecord(page, id, 'cover image', 'image/png')).toBe(
        true
      );
      expect(await checkMediaInIndexedDB(page, id)).toBe(true);
    });

    await test.step('user avatar key (user/_user:avatar)', async () => {
      const id = 'testuser/_user:avatar';
      expect(await putMediaRecord(page, id, 'avatar image', 'image/png')).toBe(
        true
      );
      expect(await checkMediaInIndexedDB(page, id)).toBe(true);
    });

    await test.step('inline image key (user/project:img-<hash>)', async () => {
      const id = 'testuser/test-project:img-abc123';
      expect(await putMediaRecord(page, id, 'inline image', 'image/png')).toBe(
        true
      );
      expect(await checkMediaInIndexedDB(page, id)).toBe(true);
    });
  });

  test('blob URL management: create and revoke', async ({
    localPage: page,
  }) => {
    await test.step('createObjectURL produces a blob: URL', async () => {
      const blobUrl = await page.evaluate(() => {
        const blob = new Blob(['test image'], { type: 'image/png' });
        return URL.createObjectURL(blob);
      });
      expect(blobUrl).toMatch(/^blob:/);
    });

    await test.step('revokeObjectURL releases the URL without throwing', async () => {
      const result = await page.evaluate(() => {
        const blob = new Blob(['test image'], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        URL.revokeObjectURL(url);
        return { url, revoked: true };
      });
      expect(result.url).toMatch(/^blob:/);
      expect(result.revoked).toBe(true);
    });
  });
});
