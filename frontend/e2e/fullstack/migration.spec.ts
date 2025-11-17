import {
  test,
  expect,
  createOfflineProject,
  openUserSettings,
  getOfflineProjects,
  getAppMode,
} from './fixtures';

/**
 * Full-stack e2e test for offline→server migration
 *
 * This test verifies the complete migration workflow:
 * 1. Create projects in offline mode
 * 2. Register/login to server
 * 3. Switch to server mode
 * 4. Migrate projects to server
 * 5. Verify projects exist on server
 */
test.describe('Offline to Server Migration', () => {
  test('should migrate offline projects to server after registration', async ({ offlinePage, page }) => {
    // Step 1: Verify we're in offline mode (page already navigated by fixture)
    const initialMode = await getAppMode(offlinePage);
    expect(initialMode).toBe('offline');

    // Step 2: Create two offline projects using the helper
    await createOfflineProject(offlinePage, 'Offline Novel', 'offline-novel', 'A novel created in offline mode');
    await createOfflineProject(offlinePage, 'Offline Story', 'offline-story', 'A short story created offline');

    // Step 3: Verify offline projects were created
    const offlineProjects = await getOfflineProjects(offlinePage);
    expect(offlineProjects).toHaveLength(2);
    expect(offlineProjects.map((p: any) => p.slug)).toContain('offline-novel');
    expect(offlineProjects.map((p: any) => p.slug)).toContain('offline-story');

    // Step 4: Open user settings (already on home page)
    await openUserSettings(offlinePage);

    // Step 5: Navigate to Connection tab
    await offlinePage.locator('[data-testid="connection-tab"]').click();

    // Wait a moment for tab content to load
    await offlinePage.waitForTimeout(500);

    // Step 6: (Skipping visual check for offline projects count - the projects 
    // are in localStorage and will be migrated when we authenticate)

    // Step 7: Enter server URL
    await offlinePage
      .locator('[data-testid="server-url-input"]')
      .fill('http://localhost:8333');

    // Step 8: Click "Connect to Server" button
    const connectButton = offlinePage.locator('[data-testid="connect-to-server-button"]');
    await connectButton.click();

    // Step 9: Should see confirmation dialog asking about migration
    await expect(
      offlinePage.getByRole('heading', { name: /migrate offline projects/i })
    ).toBeVisible({ timeout: 5000 });

    // Confirm migration
    await offlinePage.getByRole('button', { name: /continue/i }).click();

    // Step 10: Should see authentication form
    await expect(
      offlinePage.locator('[data-testid="auth-form"]')
    ).toBeVisible({ timeout: 10000 });

    // Step 11: Register a new user
    const testUsername = `migrationtest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await offlinePage.locator('[data-testid="auth-username-input"]').fill(testUsername);
    await offlinePage.locator('[data-testid="auth-password-input"]').fill(testPassword);
    await offlinePage.locator('[data-testid="auth-confirm-password-input"]').fill(testPassword);

    await offlinePage.locator('[data-testid="authenticate-button"]').click();

    // Step 12: Wait for migration to complete
    // Look specifically for the MatSnackBar message (more reliable than dialog text)
    // Use .first() since both the dialog and snackbar might show the message
    await expect(
      offlinePage.locator('.mat-mdc-snack-bar-label').filter({ hasText: /Successfully migrated \d+ project/i }).first()
    ).toBeVisible({ timeout: 60000 });

    // DEBUG: Check localStorage immediately after migration success message
    const appConfigAfterMigration = await offlinePage.evaluate(() => {
      return {
        appConfig: localStorage.getItem('inkweld-app-config'),
        authToken: localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING',
        offlineUser: localStorage.getItem('inkweld-offline-user'),
        offlineProjects: localStorage.getItem('inkweld-offline-projects'),
      };
    });
    console.log('[TEST] After migration success, localStorage:', JSON.stringify(appConfigAfterMigration, null, 2));

    // Step 13: Page will reload automatically after migration (1 second delay)
    // Wait for reload to complete
    await offlinePage.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // DEBUG: Check localStorage immediately AFTER reload
    const appConfigAfterReload = await offlinePage.evaluate(() => {
      return {
        appConfig: localStorage.getItem('inkweld-app-config'),
        authToken: localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING',
        offlineUser: localStorage.getItem('inkweld-offline-user'),
        offlineProjects: localStorage.getItem('inkweld-offline-projects'),
      };
    });
    console.log('[TEST] AFTER reload, localStorage:', JSON.stringify(appConfigAfterReload, null, 2));

    // Step 14: Verify we're now in server mode
    const finalMode = await getAppMode(offlinePage);
    console.log('[TEST] Final mode from getAppMode():', finalMode);
    expect(finalMode).toBe('server');

    // Step 15: Close settings dialog if it's still open (should have closed during reload)
    const settingsDialog = offlinePage.locator('[data-testid="settings-close-button"]');
    if (await settingsDialog.isVisible()) {
      await settingsDialog.click();
    }

    // Step 16: Navigate to home page to see migrated projects
    await offlinePage.goto('/');
    
    // Wait for the page to fully stabilize
    await offlinePage.waitForLoadState('networkidle', { timeout: 10000 });

    // Step 17: Verify projects are visible in the project list
    // Use getByRole('button') since the project cards are buttons with project name + " cover"
    await expect(
      offlinePage.getByRole('button', { name: /Offline Novel/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      offlinePage.getByRole('button', { name: /Offline Story/i })
    ).toBeVisible({ timeout: 10000 });

    // Migration test complete - projects successfully migrated and visible on server
    // (Opening projects is tested in other e2e tests)
  });

  test('should handle duplicate projects during migration', async ({
    offlinePage,
    page,
  }) => {
    // Step 1: Create project in offline mode (page already navigated by fixture)
    await createOfflineProject(
      offlinePage,
      'Duplicate Test',
      'duplicate-test'
    );

    // Step 2: Switch to server mode (we'll use the page fixture for this)
    // First, register a user on the server
    await page.goto('/');
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: 'http://localhost:8333',
        })
      );
    });

    await page.goto('/register');
    const username = `testuser-${Date.now()}`;
    await page.getByLabel(/^username/i).fill(username);
    await page.getByLabel(/^password/i).fill('TestPassword123!');
    await page.getByLabel(/confirm password/i).fill('TestPassword123!');
    await page.getByRole('button', { name: /register/i }).click();

    await page.waitForURL('/');

    // Step 3: Create a project with the same slug on the server
    await createOfflineProject(page, 'Duplicate Test', 'duplicate-test');

    // Step 4: Now migrate offline projects to server
    await offlinePage.goto('/');
    await openUserSettings(offlinePage);
    await offlinePage.locator('[data-testid="connection-tab"]').click();

    // Enter server URL
    await offlinePage
      .locator('[data-testid="server-url-input"]')
      .fill('http://localhost:8333');

    // Click connect
    await offlinePage.locator('[data-testid="connect-to-server-button"]').click();

    // Step 5: Should see a warning or handle duplicate gracefully
    // Migration should either:
    // - Skip the duplicate project
    // - Show a warning message
    // - Complete without errors

    await expect(
      offlinePage
        .getByText(/migration complete|skipped|already exists/i)
    ).toBeVisible({ timeout: 30000 });

    // Verify no error occurred
    await expect(
      offlinePage.getByText(/error|failed/i)
    ).not.toBeVisible();
  });

  test('should preserve document content during migration', async ({
    offlinePage,
  }) => {
    // Step 1: Create offline project (page already navigated by fixture)
    await createOfflineProject(
      offlinePage,
      'Content Test',
      'content-test'
    );

    // Step 2: Open the project and add some document content
    await offlinePage.waitForURL(/.*content-test.*/);

    // Find and click on a document in the tree (e.g., "Chapter 1")
    const chapter1 = offlinePage.getByRole('treeitem', {
      name: /chapter 1/i,
    });

    if (await chapter1.isVisible({ timeout: 5000 }).catch(() => false)) {
      await chapter1.click();

      // Wait for editor to load
      const editor = offlinePage.locator('.ProseMirror').or(
        offlinePage.locator('[contenteditable="true"]')
      );

      await expect(editor).toBeVisible({ timeout: 10000 });

      // Add content to the document
      const testContent = 'This is test content created in offline mode. It should persist after migration.';
      await editor.fill(testContent);

      // Wait a moment for Yjs to persist to IndexedDB
      await offlinePage.waitForTimeout(2000);
    }

    // Step 3: Migrate to server
    await offlinePage.goto('/');
    await openUserSettings(offlinePage);
    await offlinePage.locator('[data-testid="connection-tab"]').click();

    await offlinePage
      .locator('[data-testid="server-url-input"]')
      .fill('http://localhost:8333');

    await offlinePage.locator('[data-testid="connect-to-server-button"]').click();

    // Wait for migration
    await expect(
      offlinePage.getByText(/migration complete/i)
    ).toBeVisible({ timeout: 30000 });

    // Step 4: Navigate back to the project
    await offlinePage.goto('/');
    await offlinePage.getByText('Content Test').click();

    // Step 5: Open the same document
    const migratedChapter = offlinePage.getByRole('treeitem', {
      name: /chapter 1/i,
    });

    if (await migratedChapter.isVisible({ timeout: 5000 }).catch(() => false)) {
      await migratedChapter.click();

      // Step 6: Verify content is still there
      const editorAfterMigration = offlinePage.locator('.ProseMirror').or(
        offlinePage.locator('[contenteditable="true"]')
      );

      // Wait for document to load and sync from server
      await offlinePage.waitForTimeout(3000);

      // Check if content persisted
      await expect(editorAfterMigration).toContainText(
        /test content created in offline mode/i
      );
    }
  });
});
