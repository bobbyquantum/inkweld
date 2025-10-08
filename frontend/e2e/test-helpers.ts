import { Page } from '@playwright/test';

/**
 * Common test constants
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
export async function takeScreenshot(
  page: Page,
  name: string
): Promise<void> {
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

  throw lastError;
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
