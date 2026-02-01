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

    // Step 10: Wait for migration and sync to complete
    // The dialog shows sync-success when migration and server sync are done
    const syncSuccess = offlinePage.locator('[data-testid="sync-success"]');

    // Wait for the success message - this indicates migration and sync are fully complete
    await expect(syncSuccess).toBeVisible({ timeout: 45000 });

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

    // Wait for migration and sync to complete
    // The dialog shows sync-success when migration and server sync are done
    const syncSuccess = offlinePage.locator('[data-testid="sync-success"]');

    // Wait for the success message - this indicates migration and sync are fully complete
    await expect(syncSuccess).toBeVisible({ timeout: 45000 });

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

  /**
   * Test that validates the slug conflict rename feature:
   * 1. Start in local mode, create a project
   * 2. Migrate to server (so it exists on server)
   * 3. Switch back to local mode
   * 4. Create a second project on server (for rename conflict testing)
   * 5. Create a new local project with unique slug
   * 6. Delete the server profile, then re-add and login
   * 7. The local project should NOT conflict (different slug)
   * 8. But if we tried to rename to a server slug, it should show error
   *
   * Actually, simpler approach:
   * 1. Create local project A
   * 2. Migrate to server (creates A on server)
   * 3. Create project B on server
   * 4. Switch to local, clear local projects, create local project A again
   * 5. Re-add server (same profile exists), trigger migration
   * 6. A conflicts, try to rename to B's slug → should fail
   * 7. Rename to unique slug → should work
   */
  test('should validate renamed slugs against existing server projects', async ({
    offlinePage,
  }) => {
    // Increase timeout for this complex multi-step test
    test.setTimeout(120000);

    const testId = Date.now();
    const projectASlug = `project-a-${testId}`;
    const projectBSlug = `project-b-${testId}`;
    const uniqueSlug = `unique-${testId}`;
    const testPassword = 'TestPassword123!';
    const testUsername = `conflictuser-${testId}`;

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 1: Create local project A and migrate to server
    // ════════════════════════════════════════════════════════════════════════

    // Step 1: Verify we're in offline mode
    const initialMode = await getAppMode(offlinePage);
    expect(initialMode).toBe('local');

    // Step 2: Create local project A
    await createOfflineProject(
      offlinePage,
      'Project A',
      projectASlug,
      'First project for conflict testing'
    );

    // Step 3: Open profile manager and add server
    await offlinePage.goto('/');
    await openProfileManager(offlinePage);

    await offlinePage.locator('[data-testid="add-server-button"]').click();
    await expect(
      offlinePage.locator('[data-testid="new-server-url-input"]')
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="new-server-url-input"]')
      .fill('http://localhost:9333');
    await offlinePage.locator('[data-testid="connect-server-button"]').click();

    // Step 4: Register new user
    await expect(
      offlinePage.getByRole('heading', { name: /Log In to Server/i })
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="migration-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="migration-password-input"]')
      .fill(testPassword);
    await offlinePage
      .locator('[data-testid="migration-confirm-password-input"]')
      .fill(testPassword);

    await offlinePage
      .locator('[data-testid="migrate-authenticate-button"]')
      .click();

    // Step 5: Migrate the project
    await expect(
      offlinePage.getByRole('heading', { name: /Select Projects to Migrate/i })
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="migrate-projects-button"]')
      .click();

    // Wait for migration and sync to complete
    const syncSuccess = offlinePage.locator('[data-testid="sync-success"]');
    await expect(syncSuccess).toBeVisible({ timeout: 45000 });

    await offlinePage.waitForTimeout(2000);
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // Verify project A exists on server
    await expect(offlinePage.locator('body')).toContainText('Project A');

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: Create project B on server (to test rename conflict)
    // ════════════════════════════════════════════════════════════════════════

    await offlinePage.goto('/create-project');
    await offlinePage.waitForLoadState('domcontentloaded');

    await offlinePage.getByRole('button', { name: /next/i }).click();
    await expect(
      offlinePage.locator('[data-testid="project-title-input"]')
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="project-title-input"]')
      .fill('Project B');
    await offlinePage
      .locator('[data-testid="project-slug-input"]')
      .fill(projectBSlug);
    await offlinePage.locator('[data-testid="create-project-button"]').click();

    await expect(offlinePage).toHaveURL(new RegExp(`.*${projectBSlug}.*`));

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 3: Switch to local mode and create a conflicting project
    // ════════════════════════════════════════════════════════════════════════

    await offlinePage.goto('/');
    await openProfileManager(offlinePage);

    // Click on the local profile item to switch to local mode
    const localProfileButton = offlinePage
      .locator('button.profile-item')
      .filter({ hasText: /Local Mode/i })
      .first();
    await localProfileButton.click();

    // Wait for switch to local mode and page reload
    await offlinePage.waitForTimeout(1500);
    await offlinePage.goto('/');

    // Verify we're in local mode
    const localMode = await getAppMode(offlinePage);
    expect(localMode).toBe('local');

    // Clear existing local projects AND server profiles to force fresh migration
    await offlinePage.evaluate(() => {
      // Clear existing local projects
      localStorage.removeItem('local:inkweld-local-projects');
      localStorage.removeItem('local:inkweld-migrated-projects');
      // Clear server profiles to force re-adding server
      localStorage.removeItem('inkweld-profiles');
    });

    // Reload to pick up the localStorage change
    await offlinePage.reload();
    await offlinePage.waitForLoadState('networkidle');

    // After clearing profiles, we should still be in local mode
    // (the fixture starts in local mode)
    const afterClearMode = await getAppMode(offlinePage);
    expect(afterClearMode).toBe('local');

    // Create a new local project with the same slug as Project A on server
    await createOfflineProject(
      offlinePage,
      'Local Project A Copy',
      projectASlug,
      'This will conflict with Project A on server'
    );

    // Verify the local project was created
    const localProjects = await getOfflineProjects(offlinePage);
    expect(localProjects.length).toBeGreaterThanOrEqual(1);
    const createdProject = localProjects.find(
      (p: { slug: string }) => p.slug === projectASlug
    );
    expect(createdProject).toBeTruthy();

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: Add server fresh and login to trigger migration
    // ════════════════════════════════════════════════════════════════════════

    // Navigate to home and ensure services are refreshed
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');
    await offlinePage.waitForTimeout(1000); // Allow Angular services to initialize

    await openProfileManager(offlinePage);

    // Add server (profiles were cleared so we must add fresh)
    await offlinePage.locator('[data-testid="add-server-button"]').click();
    await expect(
      offlinePage.locator('[data-testid="new-server-url-input"]')
    ).toBeVisible();

    await offlinePage
      .locator('[data-testid="new-server-url-input"]')
      .fill('http://localhost:9333');
    await offlinePage.locator('[data-testid="connect-server-button"]').click();

    // Wait for the dialog to update
    await offlinePage.waitForTimeout(1000);

    // Switch to login mode - click the "Have an account? Log in" button
    const loginToggle = offlinePage.locator(
      '[data-testid="toggle-auth-mode-button"]'
    );
    await expect(loginToggle).toBeVisible({ timeout: 5000 });
    await loginToggle.click();

    // Wait for login form to appear
    await offlinePage.waitForTimeout(500);

    // Login with existing user
    await offlinePage
      .locator('[data-testid="migration-username-input"]')
      .fill(testUsername);
    await offlinePage
      .locator('[data-testid="migration-password-input"]')
      .fill(testPassword);

    await offlinePage
      .locator('[data-testid="migrate-authenticate-button"]')
      .click();

    // Wait for migration view to appear with conflict detection
    // Give it time to check for conflicts
    await offlinePage.waitForTimeout(2000);

    // Migration heading MUST be visible - this test requires migration flow
    const migrationHeading = offlinePage.getByRole('heading', {
      name: /Select Projects to Migrate/i,
    });
    await expect(migrationHeading).toBeVisible({ timeout: 10000 });

    // Verify the local project is shown in the migration list
    const projectCheckbox = offlinePage.getByRole('checkbox', {
      name: /Local Project A Copy/i,
    });
    await expect(projectCheckbox).toBeVisible();

    // The project should show conflict warning icon
    const conflictIcon = offlinePage.locator('.conflict-icon').first();
    await expect(conflictIcon).toBeVisible();

    // The rename input should be visible for the conflicting project
    const renameInput = offlinePage.locator(
      `[data-testid="rename-slug-${projectASlug}"]`
    );
    await expect(renameInput).toBeVisible();

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 5: Test that renaming to existing server slug shows error
    // ════════════════════════════════════════════════════════════════════════

    // Clear and type Project B's slug (which exists on server)
    await renameInput.clear();
    await renameInput.fill(projectBSlug);

    // Wait for validation
    await offlinePage.waitForTimeout(500);

    // The Migrate button should be disabled due to unresolved conflict
    const migrateButton = offlinePage.locator(
      '[data-testid="migrate-projects-button"]'
    );
    await expect(migrateButton).toBeDisabled();

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 6: Rename to a valid unique slug and migrate
    // ════════════════════════════════════════════════════════════════════════

    // Now rename to a unique slug - use pressSequentially to ensure input events fire
    await renameInput.click();
    await renameInput.fill('');
    await renameInput.pressSequentially(uniqueSlug, { delay: 50 });

    // Wait for validation - should show check icon
    await offlinePage.waitForTimeout(1000);
    const validIcon = offlinePage.locator('.valid-icon').first();
    await expect(validIcon).toBeVisible({ timeout: 5000 });

    // Migrate button should now be enabled
    await expect(migrateButton).toBeEnabled();

    // Click migrate - the dialog will show progress then sync
    await migrateButton.click();

    // Wait for sync to complete - the sync success element should appear
    const renamedSyncSuccess = offlinePage.locator(
      '[data-testid="sync-success"]'
    );
    await expect(renamedSyncSuccess).toBeVisible({ timeout: 30000 });

    // Wait for the dialog to close and page to redirect
    // The dialog does window.location.href = '/' after sync success
    await offlinePage.waitForURL('**/', { timeout: 30000 });

    // Wait for page to settle
    await offlinePage.waitForLoadState('networkidle');

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 7: Verify the project exists ON THE SERVER with the renamed slug
    // ════════════════════════════════════════════════════════════════════════

    // First verify the renamed project is visible on home page
    await expect(offlinePage.locator('body')).toContainText(
      'Local Project A Copy'
    );

    // Navigate to the project to confirm it has the renamed slug
    const projectCard = offlinePage.getByRole('button', {
      name: /Open project Local Project A Copy/i,
    });
    await expect(projectCard).toBeVisible();
    await projectCard.click();

    // URL should contain the renamed slug
    await expect(offlinePage).toHaveURL(new RegExp(`.*${uniqueSlug}.*`));

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 8: Verify project persists after switching profiles
    // This confirms it's actually on the server, not just local
    // ════════════════════════════════════════════════════════════════════════

    // Go home and switch to local mode
    await offlinePage.goto('/');
    await openProfileManager(offlinePage);

    // Switch to local mode
    const localProfileSwitch = offlinePage
      .locator('button.profile-item')
      .filter({ hasText: /Local Mode/i })
      .first();
    await localProfileSwitch.click();
    await offlinePage.waitForTimeout(1500);
    await offlinePage.goto('/');

    // In local mode, we should NOT see the migrated project (it's on server now)
    const localModeCheck = await getAppMode(offlinePage);
    expect(localModeCheck).toBe('local');

    // The migrated project should NOT be in local mode anymore
    await expect(
      offlinePage.locator('body').getByText('Local Project A Copy')
    ).not.toBeVisible();

    // Now switch back to server mode
    await openProfileManager(offlinePage);
    const serverProfileSwitch = offlinePage
      .locator('button.profile-item')
      .filter({ hasText: /localhost/i })
      .first();
    await serverProfileSwitch.click();
    await offlinePage.waitForTimeout(1500);
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('networkidle');

    // The migrated project should be visible on the server
    await expect(offlinePage.locator('body')).toContainText(
      'Local Project A Copy'
    );

    // We should also see both original projects (A and B) plus the migrated one
    await expect(offlinePage.locator('body')).toContainText('Project A');
    await expect(offlinePage.locator('body')).toContainText('Project B');

    // Finally, verify we can navigate to the migrated project with the renamed slug
    const migratedProjectCard = offlinePage.getByRole('button', {
      name: /Open project Local Project A Copy/i,
    });
    await migratedProjectCard.click();
    await expect(offlinePage).toHaveURL(new RegExp(`.*${uniqueSlug}.*`));
  });
});
