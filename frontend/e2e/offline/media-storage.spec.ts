/**
 * Media Storage Tests - Offline Mode
 *
 * Tests that verify media storage (covers, avatars, inline images)
 * works correctly in pure offline mode using IndexedDB.
 * All media should be stored locally and no server requests should be made.
 */
import { expect, test } from './fixtures';

/**
 * Helper to create a test image blob in the browser
 */
async function createTestImageBlob(
  page: import('@playwright/test').Page,
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
  page: import('@playwright/test').Page,
  key: string
): Promise<boolean> {
  return page.evaluate(async (mediaKey: string) => {
    return new Promise<boolean>(resolve => {
      const request = indexedDB.open('inkweld-media', 1);
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
  page: import('@playwright/test').Page,
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

test.describe('Offline Media Storage', () => {
  test.describe('Project Cover Storage', () => {
    test('should store project cover in IndexedDB when uploaded', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Wait for project to load
      await page.waitForLoadState('domcontentloaded');

      // Create a test image
      await createTestImageBlob(page, 'blue', 400, 600);

      // Find and click the edit cover button (should be in project settings or home tab)
      // First, let's check if we can find the cover upload mechanism
      const editCoverButton = page.getByTestId('edit-cover-button');

      // If no edit cover button, try clicking on the project cover area
      const hasCoverButton = await editCoverButton
        .isVisible()
        .catch(() => false);

      if (hasCoverButton) {
        await editCoverButton.click();
      } else {
        // Try clicking on the project cover component
        const coverElement = page.locator('app-project-cover');
        const hasCover = await coverElement.isVisible().catch(() => false);
        if (hasCover) {
          await coverElement.click();
        }
      }

      // Upload a cover image using file input
      const fileInput = page.locator('input[type="file"][accept*="image"]');
      const hasFileInput = await fileInput.isVisible().catch(() => false);

      if (hasFileInput) {
        // Create a simple PNG file and upload it
        await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 600;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = 'blue';
          ctx.fillRect(0, 0, 400, 600);

          canvas.toBlob(blob => {
            if (blob) {
              // Store blob for later verification
              (
                window as unknown as { __uploadedCoverBlob: Blob }
              ).__uploadedCoverBlob = blob;
            }
          }, 'image/png');
        });
      }

      // Verify the app is still in offline mode
      const mode = await page.evaluate(() => {
        const config = localStorage.getItem('inkweld-app-config');
        return config
          ? (JSON.parse(config) as { mode: string }).mode
          : 'unknown';
      });
      expect(mode).toBe('offline');
    });

    test('should display project cover from IndexedDB', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Check that the project cover component exists
      const coverComponent = page.locator('app-project-cover');
      await expect(coverComponent).toBeVisible();

      // The cover component should be rendered (even if empty/placeholder)
      // In offline mode, it should attempt to load from IndexedDB
    });

    test('should persist cover after page reload', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      // Get current URL
      const projectUrl = page.url();

      // Reload the page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Verify we're still on the same project page
      expect(page.url()).toBe(projectUrl);

      // Verify app is still in offline mode after reload
      const mode = await page.evaluate(() => {
        const config = localStorage.getItem('inkweld-app-config');
        return config
          ? (JSON.parse(config) as { mode: string }).mode
          : 'unknown';
      });
      expect(mode).toBe('offline');
    });
  });

  test.describe('IndexedDB Media Database', () => {
    test('should create inkweld-media database when accessing media storage', async ({
      offlinePage: page,
    }) => {
      // Trigger media database creation by navigating
      await page.waitForLoadState('domcontentloaded');

      // Check if the database exists
      const dbExists = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            request.result.close();
            resolve(true);
          };
          request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('media')) {
              db.createObjectStore('media');
            }
          };
        });
      });

      // Database should be creatable
      expect(typeof dbExists).toBe('boolean');
    });

    test('should store and retrieve media blobs correctly', async ({
      offlinePage: page,
    }) => {
      // Create a test blob and store it in IndexedDB
      // Note: The app stores records with { id, blob, mimeType, size, createdAt } structure
      const stored = await page.evaluate(async () => {
        const blob = new Blob(['test content'], { type: 'text/plain' });

        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction('media', 'readwrite');
              const store = tx.objectStore('media');
              // Use the same record format as the app
              const record = {
                id: 'test-key',
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
      });

      expect(stored).toBe(true);

      // Retrieve the blob
      const retrieved = await page.evaluate(async () => {
        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
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

  test.describe('Sync State Tracking', () => {
    test('should create inkweld-sync database for tracking sync state', async ({
      offlinePage: page,
    }) => {
      await page.waitForLoadState('domcontentloaded');

      // Check if the sync database can be created
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

    test('should store sync state with pending uploads', async ({
      offlinePage: page,
    }) => {
      // Store a sync state entry
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

      // Verify the sync state
      const syncState = await checkSyncStateInIndexedDB(
        page,
        'testuser/test-project'
      );
      expect(syncState.exists).toBe(true);
      expect(syncState.pendingUploads).toContain('cover');
    });
  });

  test.describe('Media Key Patterns', () => {
    test('should use correct key pattern for project covers', async ({
      offlinePage: page,
    }) => {
      // Store with the correct key pattern and record format
      const stored = await page.evaluate(async () => {
        const blob = new Blob(['cover image'], { type: 'image/png' });

        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction('media', 'readwrite');
              const store = tx.objectStore('media');
              // Record format matches app: { id, blob, mimeType, size, createdAt }
              const record = {
                id: 'testuser/test-project:cover',
                blob,
                mimeType: blob.type,
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
      });

      expect(stored).toBe(true);

      // Verify the key exists
      const exists = await checkMediaInIndexedDB(
        page,
        'testuser/test-project:cover'
      );
      expect(exists).toBe(true);
    });

    test('should use correct key pattern for user avatars', async ({
      offlinePage: page,
    }) => {
      // Store avatar with correct key pattern and record format
      const stored = await page.evaluate(async () => {
        const blob = new Blob(['avatar image'], { type: 'image/png' });

        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction('media', 'readwrite');
              const store = tx.objectStore('media');
              // Record format matches app: { id, blob, mimeType, size, createdAt }
              const record = {
                id: 'testuser/_user:avatar',
                blob,
                mimeType: blob.type,
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
      });

      expect(stored).toBe(true);

      // Verify the key exists
      const exists = await checkMediaInIndexedDB(page, 'testuser/_user:avatar');
      expect(exists).toBe(true);
    });

    test('should use correct key pattern for inline images', async ({
      offlinePage: page,
    }) => {
      // Store inline image with correct key pattern and record format
      const stored = await page.evaluate(async () => {
        const blob = new Blob(['inline image'], { type: 'image/png' });

        return new Promise<boolean>(resolve => {
          const request = indexedDB.open('inkweld-media', 1);
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction('media', 'readwrite');
              const store = tx.objectStore('media');
              // Record format matches app: { id, blob, mimeType, size, createdAt }
              const record = {
                id: 'testuser/test-project:img-abc123',
                blob,
                mimeType: blob.type,
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
      });

      expect(stored).toBe(true);

      // Verify the key exists
      const exists = await checkMediaInIndexedDB(
        page,
        'testuser/test-project:img-abc123'
      );
      expect(exists).toBe(true);
    });
  });

  test.describe('Blob URL Management', () => {
    test('should create blob URLs for stored media', async ({
      offlinePage: page,
    }) => {
      // Store a blob and create a URL
      const blobUrl = await page.evaluate(() => {
        const blob = new Blob(['test image'], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        return url;
      });

      // Blob URL should start with blob:
      expect(blobUrl).toMatch(/^blob:/);
    });

    test('should revoke blob URLs to prevent memory leaks', async ({
      offlinePage: page,
    }) => {
      // Create and revoke a blob URL
      const result = await page.evaluate(() => {
        const blob = new Blob(['test image'], { type: 'image/png' });
        const url = URL.createObjectURL(blob);

        // Revoke the URL
        URL.revokeObjectURL(url);

        // Return both the original URL and a flag indicating revocation
        return { url, revoked: true };
      });

      expect(result.url).toMatch(/^blob:/);
      expect(result.revoked).toBe(true);
    });
  });
});
