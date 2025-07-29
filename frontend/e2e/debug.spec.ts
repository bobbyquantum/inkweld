import { expect, test } from './fixtures';

test.describe('Debug Tests', () => {
  test('should have app configuration set', async ({ anonymousPage: page }) => {
    await page.goto('/');
    
    // Check if localStorage has the app config
    const config = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    
    console.log('App config:', config);
    expect(config).not.toBeNull();
    
    // Check current URL after navigation
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-screenshot.png' });
  });
});
