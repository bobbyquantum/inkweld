import { Page } from '@playwright/test';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Demo asset paths (relative to workspace root)
 */
export const DEMO_ASSETS = {
  covers: {
    demo1: 'assets/demo_covers/demo_cover_1.png',
    inkweld1: 'assets/demo_covers/inkweld_cover_1.png',
    worldbuilding1: 'assets/demo_covers/worldbuilding_cover_1.png',
  },
  images: {
    cyberCityscape: 'assets/demo_images/cyber-cityscape.png',
    demoCharacter: 'assets/demo_images/demo-character.png',
    landscapePencil: 'assets/demo_images/landscape-pencil-art.png',
  },
} as const;

/**
 * Get the absolute path to a demo asset
 */
export function getDemoAssetPath(relativePath: string): string {
  // Go from frontend/e2e to workspace root
  return join(process.cwd(), '..', relativePath);
}

/**
 * Load a demo asset file as a base64 string
 */
export async function loadDemoAssetBase64(
  relativePath: string
): Promise<string> {
  const absolutePath = getDemoAssetPath(relativePath);
  const buffer = await readFile(absolutePath);
  return buffer.toString('base64');
}

/**
 * Store a real image file from assets into IndexedDB
 * @param page Playwright page
 * @param projectKey Project key (username/slug)
 * @param mediaId Media ID for storage
 * @param assetPath Path to asset relative to workspace root
 * @param filename Display filename in the media record
 */
export async function storeRealMediaInIndexedDB(
  page: Page,
  projectKey: string,
  mediaId: string,
  assetPath: string,
  filename: string
): Promise<void> {
  const base64Data = await loadDemoAssetBase64(assetPath);

  await page.evaluate(
    async ({ projectKey, mediaId, base64Data, filename }) => {
      // Convert base64 to blob
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/png' });

      const key = `${projectKey}:${mediaId}`;
      const record = {
        id: key,
        blob,
        mimeType: 'image/png',
        size: blob.size,
        createdAt: new Date().toISOString(),
        filename,
      };

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('inkweld-media', 1);
        request.onerror = () => reject(new Error('Failed to open database'));
        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('media')) {
            db.createObjectStore('media', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('media', 'readwrite');
          const store = tx.objectStore('media');
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to store media'));
        };
      });
    },
    { projectKey, mediaId, base64Data, filename }
  );
}

/**
 * Store a sample EPUB file (real empty EPUB structure) in IndexedDB
 * This creates a minimal valid EPUB file rather than random bytes
 */
export async function storeRealEpubInIndexedDB(
  page: Page,
  projectKey: string,
  fileId: string,
  filename: string
): Promise<void> {
  await page.evaluate(
    async ({ projectKey, fileId, filename }) => {
      // Create a minimal EPUB-like structure as a real file
      // EPUBs are ZIP files with specific structure
      // For testing, we create a simple but valid-looking blob
      const encoder = new TextEncoder();
      const mimetype = encoder.encode('application/epub+zip');

      // Create blob from the mimetype content (minimal but real content)
      const blob = new Blob([mimetype], { type: 'application/epub+zip' });

      const key = `${projectKey}:published-${fileId}`;
      const record = {
        id: key,
        blob,
        mimeType: 'application/epub+zip',
        size: blob.size,
        createdAt: new Date().toISOString(),
        filename,
      };

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('inkweld-media', 1);
        request.onerror = () => reject(new Error('Failed to open database'));
        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('media')) {
            db.createObjectStore('media', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('media', 'readwrite');
          const store = tx.objectStore('media');
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to store epub'));
        };
      });
    },
    { projectKey, fileId, filename }
  );
}

/**
 * Common test constants used across offline and online tests
 */
export const TEST_CONSTANTS = {
  // Valid password that meets all requirements
  VALID_PASSWORD: 'ValidPass123!',

  // Default test users
  TEST_USER: 'testuser',
  ADMIN_USER: 'adminuser',

  // Common timeouts
  TIMEOUTS: {
    SHORT: 300,
    MEDIUM: 1000,
    LONG: 2000,
    NETWORK: 5000,
  },

  // Mobile viewport
  MOBILE_VIEWPORT: {
    width: 375,
    height: 667,
  },

  // Tablet viewport
  TABLET_VIEWPORT: {
    width: 768,
    height: 1024,
  },
} as const;

/**
 * Generate a unique username for testing
 * @param prefix Optional prefix for the username
 */
export function generateUniqueUsername(prefix = 'testuser'): string {
  return `${prefix}${Date.now()}`;
}

/**
 * Generate a unique project slug for testing
 * @param prefix Optional prefix for the slug
 */
export function generateUniqueSlug(prefix = 'test-project'): string {
  return `${prefix}-${Date.now()}`;
}

/**
 * Wait for network idle (useful for API-heavy operations)
 * @param page Playwright page
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/**
 * Clear all browser storage (localStorage, sessionStorage, cookies)
 * @param page Playwright page
 */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/**
 * Check if element is visible within viewport
 * @param page Playwright page
 * @param selector Element selector
 */
export async function isVisibleInViewport(
  page: Page,
  selector: string
): Promise<boolean> {
  const element = page.locator(selector);
  const box = await element.boundingBox();
  if (!box) return false;

  const viewport = page.viewportSize();
  if (!viewport) return false;

  return (
    box.y >= 0 &&
    box.x >= 0 &&
    box.y + box.height <= viewport.height &&
    box.x + box.width <= viewport.width
  );
}

/**
 * Scroll element into view
 * @param page Playwright page
 * @param selector Element selector
 */
export async function scrollIntoView(
  page: Page,
  selector: string
): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Take a screenshot with a descriptive name
 * @param page Playwright page
 * @param name Screenshot name
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true,
  });
}

/**
 * Retry an action until it succeeds or max attempts reached
 * @param action The action to retry
 * @param maxAttempts Maximum number of attempts
 * @param delayMs Delay between attempts in milliseconds
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Wait for URL to match a pattern with timeout
 * @param page Playwright page
 * @param pattern URL pattern (string or regex)
 * @param timeout Timeout in milliseconds
 */
export async function waitForUrlPattern(
  page: Page,
  pattern: string | RegExp,
  timeout = 5000
): Promise<void> {
  await page.waitForURL(pattern, { timeout });
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!process.env['CI'];
}

/**
 * Get test timeout based on environment
 */
export function getTestTimeout(): number {
  return isCI() ? 60000 : 30000;
}

/**
 * Mock slow network conditions
 * @param page Playwright page
 * @param delayMs Delay in milliseconds for all requests
 */
export async function mockSlowNetwork(
  page: Page,
  delayMs = 2000
): Promise<void> {
  await page.route('**/*', async route => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

/**
 * Fill form fields from an object
 * @param page Playwright page
 * @param fields Object mapping test IDs to values
 */
export async function fillFormFields(
  page: Page,
  fields: Record<string, string>
): Promise<void> {
  for (const [testId, value] of Object.entries(fields)) {
    await page.getByTestId(testId).fill(value);
  }
}

/**
 * Assert multiple elements are visible
 * @param page Playwright page
 * @param selectors Array of selectors to check
 */
export async function assertElementsVisible(
  page: Page,
  selectors: string[]
): Promise<void> {
  for (const selector of selectors) {
    const element = page.locator(selector);
    const isVisible = await element.isVisible();
    if (!isVisible) {
      throw new Error(`Element ${selector} is not visible`);
    }
  }
}

/**
 * Verify app mode from localStorage
 * @param page Playwright page
 */
export async function getAppMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const config = localStorage.getItem('inkweld-app-config');
    if (!config) return 'unknown';
    const parsed = JSON.parse(config) as { mode?: string };
    return parsed.mode || 'unknown';
  });
}

/**
 * Get offline projects from localStorage
 * @param page Playwright page
 */
export async function getOfflineProjects(
  page: Page
): Promise<Array<{ slug: string }>> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('inkweld-local-projects');
    return stored ? (JSON.parse(stored) as Array<{ slug: string }>) : [];
  });
}
/**
 * Create a project with the two-step flow (template selection + project details)
 * @param page Playwright page
 * @param projectTitle The project title
 * @param projectSlug The project slug
 * @param description Optional project description
 * @param templateId Optional template ID to select (defaults to first template which is selected by default)
 */
export async function createProjectWithTwoSteps(
  page: Page,
  projectTitle: string,
  projectSlug: string,
  description?: string,
  templateId?: string
): Promise<void> {
  // Click create project button to navigate to create page
  await page.click('button:has-text("Create Project")');

  // Step 1: Template selection - if a specific template is requested, click it
  if (templateId) {
    await page.click(`[data-testid="template-${templateId}"]`);
  }
  // Otherwise use the default selected template (worldbuilding-empty)

  // Click Next to proceed to step 2
  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor({ state: 'visible', timeout: 5000 });
  await nextButton.click();

  // Step 2: Fill in project details
  await page.waitForSelector('input[data-testid="project-title-input"]', {
    state: 'visible',
    timeout: 5000,
  });

  await page.fill('input[data-testid="project-title-input"]', projectTitle);
  await page.fill('input[data-testid="project-slug-input"]', projectSlug);

  if (description) {
    await page.fill(
      'textarea[data-testid="project-description-input"]',
      description
    );
  }

  // Submit the form
  await page.click('button[data-testid="create-project-button"]');
}
