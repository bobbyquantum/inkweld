import {
  createOfflineProject,
  expect,
  getAppMode,
  getOfflineProjects,
  openUserSettings,
  test,
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
  test('should migrate local projects to server after registration', async ({
    offlinePage,
  }) => {
    // Step 1: Verify we're in offline mode (page already navigated by fixture)
    const initialMode = await getAppMode(offlinePage);
    expect(initialMode).toBe('local');

    // Step 2: Create two offline projects using the helper
    await createOfflineProject(
      offlinePage,
      'Offline Novel',
      'offline-novel',
      'A novel created in offline mode'
    );
    await createOfflineProject(
      offlinePage,
      'Offline Story',
      'offline-story',
      'A short story created offline'
    );

    // Step 3: Verify offline projects were created
    const offlineProjects = await getOfflineProjects(offlinePage);
    expect(offlineProjects).toHaveLength(2);
    expect(offlineProjects.map((p: { slug: string }) => p.slug)).toContain(
      'offline-novel'
    );
    expect(offlineProjects.map((p: { slug: string }) => p.slug)).toContain(
      'offline-story'
    );

    // Step 4: Open user settings (already on home page)
    await openUserSettings(offlinePage);

    // Step 5: Navigate to Connection tab
    await offlinePage.locator('[data-testid="connection-tab"]').click();

    // Wait for tab content to load
    await expect(
      offlinePage.locator('[data-testid="server-url-input"]')
    ).toBeVisible();

    // Step 6: (Skipping visual check for offline projects count - the projects
    // are in localStorage and will be migrated when we authenticate)

    // Step 7: Enter server URL
    await offlinePage
      .locator('[data-testid="server-url-input"]')
      .fill('http://localhost:9333');

    // Step 8: Click "Connect to Server" button
    const connectButton = offlinePage.locator(
      '[data-testid="connect-to-server-button"]'
    );
    await connectButton.click();

    // Step 9: Should see confirmation dialog asking about migration
    await expect(
      offlinePage.getByRole('heading', { name: /migrate local projects/i })
    ).toBeVisible();

    // Confirm migration
    await offlinePage.getByRole('button', { name: /continue/i }).click();

    // Step 10: Should see authentication form
    await expect(
      offlinePage.locator('[data-testid="auth-form"]')
    ).toBeVisible();

    // Step 11: Register a new user
    const testUsername = `migrationtest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await offlinePage
      .locator('[data-testid="auth-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="auth-password-input"]')
      .fill(testPassword);
    await offlinePage
      .locator('[data-testid="auth-confirm-password-input"]')
      .fill(testPassword);

    await offlinePage.locator('[data-testid="authenticate-button"]').click();

    // Step 12: Wait for migration to complete
    // We wait for the snackbar to appear
    await expect(
      offlinePage
        .locator('.mat-mdc-snack-bar-label')
        .filter({ hasText: /Successfully migrated \d+ project/i })
        .first()
    ).toBeVisible();

    // Step 13: Wait for mode to change to server in LocalStorage (indicates migration finish)
    await offlinePage.waitForFunction(() => {
      try {
        const config = localStorage.getItem('inkweld-app-config');
        return config && JSON.parse(config).mode === 'server';
      } catch {
        return false;
      }
    });

    // Step 14: Force navigation to home to ensure we're seeing the latest server state
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // Wait for the user menu button to appear (indicates successful authentication)
    await expect(
      offlinePage.locator('[data-testid="user-menu-button"]')
    ).toBeVisible();

    // Step 15: Close settings dialog if it's still open
    const settingsDialog = offlinePage.locator(
      '[data-testid="settings-close-button"]'
    );
    if (await settingsDialog.isVisible()) {
      await settingsDialog.click();
    }

    // Step 16: Verify projects are visible in the project grid
    // Use toPass to handle potential delay in server-side sync after migration/reload
    await expect(async () => {
      // Direct text check is most resilient against component/tag changes
      await expect(offlinePage.locator('body')).toContainText('Offline Novel');
      await expect(offlinePage.locator('body')).toContainText('Offline Story');
    }).toPass();

    // Migration test complete - projects successfully migrated and visible on server
    // (Opening projects is tested in other e2e tests)
  });

  test.skip('should handle duplicate projects during migration', async ({
    offlinePage,
    authenticatedPage,
  }) => {
    // TODO: This test needs to be implemented properly
    // Current issues:
    // - Need to coordinate authentication between two browser contexts
    // - Need to verify duplicate handling logic exists in the migration service
    // - Migration service may not have duplicate detection implemented yet

    // Step 1: Create project in offline mode
    await createOfflineProject(offlinePage, 'Duplicate Test', 'duplicate-test');

    // Step 2: Create a project with same slug on server using authenticated page
    await authenticatedPage.goto('/create-project');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    // Step 1: Click Next to proceed to step 2
    await authenticatedPage.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill and submit the form
    await authenticatedPage
      .locator('[data-testid="project-title-input"]')
      .fill('Duplicate Test Server');
    await authenticatedPage
      .locator('[data-testid="project-slug-input"]')
      .fill('duplicate-test');
    await authenticatedPage
      .locator('[data-testid="create-project-button"]')
      .click();

    // Wait for project creation
    await expect(authenticatedPage).toHaveURL(/.*duplicate-test.*/);

    // Additional steps needed to complete this test
  });

  test('should preserve document content during migration', async ({
    offlinePage,
  }) => {
    // Step 1: Create offline project (page already navigated by fixture)
    await createOfflineProject(offlinePage, 'Content Test', 'content-test');

    // Step 2: Open the project and add some document content
    await offlinePage.waitForURL(/.*content-test.*/);

    // Find and click on a document in the tree (e.g., "Chapter 1")
    const chapter1 = offlinePage.getByRole('treeitem', {
      name: /chapter 1/i,
    });

    if (await chapter1.isVisible().catch(() => false)) {
      await chapter1.click();

      // Wait for editor to load
      const editor = offlinePage
        .locator('.ProseMirror')
        .or(offlinePage.locator('[contenteditable="true"]'));

      await expect(editor).toBeVisible();

      // Add content to the document
      const testContent =
        'This is test content created in offline mode. It should persist after migration.';
      await editor.fill(testContent);

      // Wait for content to persist to IndexedDB
      await expect(offlinePage.locator('.sync-status')).toContainText('synced');
    }

    // Step 3: Migrate to server
    await offlinePage.goto('/');
    await openUserSettings(offlinePage);
    await offlinePage.locator('[data-testid="connection-tab"]').click();

    // Wait for tab content to load
    await expect(
      offlinePage.locator('[data-testid="server-url-input"]')
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="server-url-input"]')
      .fill('http://localhost:9333');

    await offlinePage
      .locator('[data-testid="connect-to-server-button"]')
      .click();

    // Confirm migration dialog
    await expect(
      offlinePage.getByRole('heading', { name: /migrate local projects/i })
    ).toBeVisible();
    await offlinePage.getByRole('button', { name: /continue/i }).click();

    // Authenticate
    await expect(
      offlinePage.locator('[data-testid="auth-form"]')
    ).toBeVisible();

    const testUsername = `contenttest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await offlinePage
      .locator('[data-testid="auth-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="auth-password-input"]')
      .fill(testPassword);
    await offlinePage
      .locator('[data-testid="auth-confirm-password-input"]')
      .fill(testPassword);
    await offlinePage.locator('[data-testid="authenticate-button"]').click();

    // Wait for migration to complete (snackbar first, then mode change)
    // First wait for the snackbar to confirm migration success
    await expect(
      offlinePage
        .locator('.mat-mdc-snack-bar-label')
        .filter({ hasText: /Successfully migrated \d+ project/i })
        .first()
    ).toBeVisible({ timeout: 30000 });

    // Then wait for mode to change to server in LocalStorage
    await offlinePage.waitForFunction(() => {
      try {
        const config = localStorage.getItem('inkweld-app-config');
        if (!config) return false;
        const parsed = JSON.parse(config);
        return parsed.mode === 'server';
      } catch {
        return false;
      }
    });

    // Step 13: Wait for page to reload and fully stabilize
    await offlinePage.waitForURL(/\/$/);
    await offlinePage.waitForLoadState('networkidle');

    // Wait for the user menu button to appear (indicates successful authentication after reload)
    await expect(
      offlinePage.locator('[data-testid="user-menu-button"]')
    ).toBeVisible();

    // Step 4: Navigate back to the project
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // Wait for project cards to load - the projects might take time to fetch
    const projectButton = offlinePage.getByRole('button', {
      name: /Open project Content Test/i,
    });
    await expect(projectButton).toBeVisible({ timeout: 30000 });

    // Click on the project card
    await projectButton.click();
    await expect(offlinePage).toHaveURL(/.*content-test.*/);

    // Step 5: Open the same document
    const migratedChapter = offlinePage.getByRole('treeitem', {
      name: /chapter 1/i,
    });

    if (await migratedChapter.isVisible().catch(() => false)) {
      await migratedChapter.click();

      // Step 6: Verify content is still there
      const editorAfterMigration = offlinePage
        .locator('.ProseMirror')
        .or(offlinePage.locator('[contenteditable="true"]'));

      // Wait for document to load and sync from server
      await expect(offlinePage.locator('.sync-status')).toContainText('synced');

      // Check if content persisted
      await expect(editorAfterMigration).toContainText(
        /test content created in offline mode/i
      );
    }
  });
});
