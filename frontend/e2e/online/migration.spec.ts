import {
  createOfflineProject,
  expect,
  getAppMode,
  getOfflineProjects,
  test,
} from './fixtures';

/**
 * Helper function to open the profile manager dialog from user menu
 */
async function openProfileManager(page: import('@playwright/test').Page) {
  // Click user menu button
  await page.locator('[data-testid="user-menu-button"]').click();
  // Click server switcher to open submenu
  await page.locator('[data-testid="switch-server-button"]').click();
  // Click manage profiles
  await page.locator('[data-testid="manage-profiles-button"]').click();
  // Wait for the dialog to open
  await expect(
    page.getByRole('heading', { name: /Server Profiles/i })
  ).toBeVisible();
}

/**
 * Full-stack e2e test for offline→server migration
 *
 * This test verifies the complete migration workflow:
 * 1. Create projects in offline mode
 * 2. Open profile manager dialog
 * 3. Add server and trigger migration
 * 4. Authenticate
 * 5. Trigger Sync All to upload projects to server
 * 6. Verify projects exist on server
 */
test.describe('Offline to Server Migration', () => {
  // Run migration tests serially to avoid parallel execution interference
  test.describe.configure({ mode: 'serial' });

  test('should migrate local projects to server after registration', async ({
    offlinePage,
  }) => {
    // Increase timeout for this slow test
    test.setTimeout(90000);

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

    // Step 4: Open profile manager dialog from user menu
    await openProfileManager(offlinePage);

    // Step 5: Click "Add Server" button
    await offlinePage.locator('[data-testid="add-server-button"]').click();

    // Wait for add server form to load
    await expect(
      offlinePage.locator('[data-testid="new-server-url-input"]')
    ).toBeVisible();

    // Step 6: Enter server URL
    await offlinePage
      .locator('[data-testid="new-server-url-input"]')
      .fill('http://localhost:9333');

    // Step 7: Click "Connect" button - this will trigger migration flow since we have local projects
    await offlinePage.locator('[data-testid="connect-server-button"]').click();

    // Step 8: Should see migration view with authentication form (first step)
    await expect(
      offlinePage.getByRole('heading', { name: /Log In to Server/i })
    ).toBeVisible();

    // Step 9: Register a new user
    const testUsername = `migrationtest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await offlinePage
      .locator('[data-testid="migration-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="migration-password-input"]')
      .fill(testPassword);
    await offlinePage
      .locator('[data-testid="migration-confirm-password-input"]')
      .fill(testPassword);

    // Step 9a: Click authenticate to complete step 1
    await offlinePage
      .locator('[data-testid="migrate-authenticate-button"]')
      .click();

    // Step 9b: Should now see project selection (step 2)
    await expect(
      offlinePage.getByRole('heading', {
        name: /Select Projects to Migrate/i,
      })
    ).toBeVisible();

    // Step 9c: Select all projects to migrate (they're selected by default now, but click for safety)
    await expect(
      offlinePage.locator('[data-testid="select-all-projects"]')
    ).toBeVisible();

    // Step 9d: Click migrate button to complete step 2
    await offlinePage
      .locator('[data-testid="migrate-projects-button"]')
      .click();

    // Step 10: Wait for migration to complete
    // The snackbar appears AFTER all migration steps are done (including createProjectsOnServer)
    const snackbar = offlinePage
      .locator('.mat-mdc-snack-bar-label')
      .filter({ hasText: /Successfully migrated \d+ project/i })
      .first();

    // Wait for the success snackbar - this indicates migration is fully complete
    await expect(snackbar).toBeVisible();

    // Wait a moment for any final async operations to settle
    await offlinePage.waitForTimeout(2000);

    // Step 11: Wait for page to reload (dialog does window.location.href = '/' after 1 second)
    // Or force navigation ourselves
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // Wait for the user menu button to appear (indicates successful authentication)
    await expect(
      offlinePage.locator('[data-testid="user-menu-button"]')
    ).toBeVisible();

    // Step 12: Close profile manager dialog if it's still open
    const closeButton = offlinePage.locator(
      'mat-dialog-container button[mat-dialog-close]'
    );
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }

    // Step 13: Verify projects are visible in the project grid
    // Projects were created on server during migration, so they should appear
    await expect(offlinePage.locator('body')).toContainText(
      'Offline Novel',
      {}
    );
    await expect(offlinePage.locator('body')).toContainText('Offline Story');

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
    // Increase timeout for this slow test
    test.setTimeout(90000);

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

    // Step 3: Migrate to server via Profile Manager
    await offlinePage.goto('/');
    await openProfileManager(offlinePage);

    // Click "Add Server" button
    await offlinePage.locator('[data-testid="add-server-button"]').click();

    // Wait for add server form to load
    await expect(
      offlinePage.locator('[data-testid="new-server-url-input"]')
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="new-server-url-input"]')
      .fill('http://localhost:9333');

    await offlinePage.locator('[data-testid="connect-server-button"]').click();

    // Should see migration view with authentication form (step 1)
    await expect(
      offlinePage.getByRole('heading', { name: /Log In to Server/i })
    ).toBeVisible();

    const testUsername = `contenttest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await offlinePage
      .locator('[data-testid="migration-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="migration-password-input"]')
      .fill(testPassword);
    await offlinePage
      .locator('[data-testid="migration-confirm-password-input"]')
      .fill(testPassword);

    // Click authenticate to complete step 1
    await offlinePage
      .locator('[data-testid="migrate-authenticate-button"]')
      .click();

    // Should now see project selection (step 2)
    await expect(
      offlinePage.getByRole('heading', {
        name: /Select Projects to Migrate/i,
      })
    ).toBeVisible();

    // Projects are selected by default after auth
    await expect(
      offlinePage.locator('[data-testid="select-all-projects"]')
    ).toBeVisible();

    // Click migrate button to complete step 2
    await offlinePage
      .locator('[data-testid="migrate-projects-button"]')
      .click();

    // Wait for migration to complete
    // The snackbar appears AFTER all migration steps are done (including createProjectsOnServer)
    const snackbarLocator = offlinePage
      .locator('.mat-mdc-snack-bar-label')
      .filter({ hasText: /Successfully migrated \d+ project/i })
      .first();

    // Wait for the success snackbar - this indicates migration is fully complete
    await expect(snackbarLocator).toBeVisible();

    // Wait a moment for any final async operations to settle
    await offlinePage.waitForTimeout(2000);

    // Navigate to home
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // Wait for the user menu button to appear (indicates successful authentication)
    await expect(
      offlinePage.locator('[data-testid="user-menu-button"]')
    ).toBeVisible();

    // Close any dialogs that might be open
    const dialogCloseBtn = offlinePage.locator(
      'mat-dialog-container button[mat-dialog-close]'
    );
    if (await dialogCloseBtn.isVisible().catch(() => false)) {
      await dialogCloseBtn.click();
    }

    // Wait for project card to be visible
    // Projects were created on server during migration, so they should appear immediately
    const projectButton = offlinePage.getByRole('button', {
      name: /Open project Content Test/i,
    });
    await expect(projectButton).toBeVisible();

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
