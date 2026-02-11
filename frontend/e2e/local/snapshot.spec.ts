import { expect, test } from './fixtures';

/**
 * Snapshot Tests - Local Mode
 *
 * These tests verify snapshot functionality (create, restore, delete)
 * for both document elements and worldbuilding elements in local mode.
 *
 * Snapshots are now accessed via a history icon in the toolbar that opens
 * a dialog, rather than being embedded in the meta panel.
 */

test.describe('Document Snapshots', () => {
  test('should create and list a snapshot for a document element', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a document element (documents use 'item' as the element type)
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill('Test Document');
    await page.getByTestId('create-element-button').click();

    // Verify document element was created and opened
    await expect(page.getByTestId('element-Test Document')).toBeVisible();

    // Click on the document to open it
    await page.getByTestId('element-Test Document').click();

    // Type some content in the document
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill('This is test content for snapshot testing.');

    // Wait for the sync status to reflect the save
    await expect(page.locator('.sync-status')).toContainText('local');

    // Open the snapshots dialog via toolbar button
    const snapshotsBtn = page.getByTestId('toolbar-snapshots');
    await expect(snapshotsBtn).toBeVisible();
    await snapshotsBtn.click();

    // Wait for the snapshots dialog to appear
    await expect(page.locator('mat-dialog-container')).toBeVisible();

    // Verify empty state message appears
    await expect(page.getByText('No snapshots yet')).toBeVisible();

    // Click create snapshot button
    await page.getByTestId('create-snapshot-btn').click();

    // Wait for the create snapshot dialog to appear (nested dialog)
    const snapshotNameInput = page.getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible();

    // Fill in snapshot dialog - click first to ensure focus
    await snapshotNameInput.click();
    await snapshotNameInput.fill('First Snapshot');
    await expect(snapshotNameInput).toHaveValue('First Snapshot');
    await page
      .getByTestId('snapshot-description-input')
      .fill('A test snapshot description');

    // Submit the dialog
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for create dialog to close
    await expect(snapshotNameInput).not.toBeVisible();

    // Wait for the snapshot to appear in the list
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'First Snapshot'
    );

    // Verify the empty state is gone
    await expect(page.getByText('No snapshots yet')).not.toBeVisible();

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();
  });

  test('should restore a snapshot for a document element', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a document element (documents use 'item' as the element type)
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill('Restore Test Doc');
    await page.getByTestId('create-element-button').click();

    // Click on the document to open it
    await page.getByTestId('element-Restore Test Doc').click();

    // Type initial content
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill('Original content before snapshot.');

    // Wait for content to persist to IndexedDB
    await expect(page.locator('.sync-status')).toContainText('local');

    // Open the snapshots dialog
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    // Create a snapshot
    await page.getByTestId('create-snapshot-btn').click();
    await expect(page.getByTestId('snapshot-name-input')).toBeVisible();

    // Click first to ensure focus
    await page.getByTestId('snapshot-name-input').click();
    await page.getByTestId('snapshot-name-input').fill('Before Edit');
    // Verify the value was set
    await expect(page.getByTestId('snapshot-name-input')).toHaveValue(
      'Before Edit'
    );
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for create dialog to close
    await expect(page.getByTestId('snapshot-name-input')).not.toBeVisible();

    // Verify snapshot was created
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Before Edit'
    );

    // Close the snapshots dialog to edit the content
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // Modify the document content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Modified content after snapshot.');
    await expect(page.locator('.sync-status')).toContainText('local');

    // Verify content changed
    await expect(editor).toContainText('Modified content after snapshot.');

    // Open snapshots dialog again and restore the snapshot
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    // Find the snapshot and open its menu
    const snapshotMenuBtn = snapshotItem.locator(
      '[data-testid^="snapshot-menu-"]'
    );
    await snapshotMenuBtn.click();

    // Click restore option from menu (menu is portaled to body, so use page-level locator)
    await page.locator('[data-testid^="restore-snapshot-"]').click();

    // Confirm restore in the confirmation dialog
    await expect(page.getByTestId('confirm-restore-btn')).toBeVisible();
    await page.getByTestId('confirm-restore-btn').click();

    // Wait for restore confirmation dialog to close
    await expect(page.getByTestId('confirm-restore-btn')).not.toBeVisible();

    // Wait for the snapshots dialog to auto-close after successful restore
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // Verify content was restored
    await expect(editor).toContainText('Original content before snapshot.');
  });

  test('should delete a snapshot', async ({ localPageWithProject: page }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a document element (documents use 'item' as the element type)
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill('Delete Test Doc');
    await page.getByTestId('create-element-button').click();

    // Click on the document to open it
    await page.getByTestId('element-Delete Test Doc').click();

    // Add some content
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill('Content for delete test.');

    // Wait for content to persist to IndexedDB
    await expect(page.locator('.sync-status')).toContainText('local');

    // Open the snapshots dialog
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    // Create a snapshot
    await page.getByTestId('create-snapshot-btn').click();
    await expect(page.getByTestId('snapshot-name-input')).toBeVisible();
    // Click first to ensure focus
    await page.getByTestId('snapshot-name-input').click();
    await page.getByTestId('snapshot-name-input').fill('To Be Deleted');
    // Verify the value was set
    await expect(page.getByTestId('snapshot-name-input')).toHaveValue(
      'To Be Deleted'
    );
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for snapshot creation dialog to close and snapshot to appear in list
    await expect(page.getByTestId('snapshot-name-input')).not.toBeVisible();
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'To Be Deleted'
    );

    // Find the snapshot menu button and click it
    const snapshotMenuBtn = snapshotItem.locator(
      '[data-testid^="snapshot-menu-"]'
    );
    await snapshotMenuBtn.click();

    // Click delete option from menu (menu is portaled to body, so use page-level locator)
    await page.locator('[data-testid^="delete-snapshot-"]').click();

    // Confirm delete in Material dialog
    await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
    await page.getByTestId('confirm-delete-button').click();

    // Wait for delete confirmation dialog to close
    await expect(page.getByTestId('confirm-delete-button')).not.toBeVisible();

    // Verify snapshot item is gone from the list (use the specific snapshot item locator)
    await expect(snapshotItem).not.toBeVisible();

    // Verify empty state is back
    await expect(page.getByText('No snapshots yet')).toBeVisible();

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
  });
});

test.describe('Worldbuilding Snapshots', () => {
  test('should create and list a snapshot for a worldbuilding element', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character worldbuilding element
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Test Character');
    await page.getByTestId('create-element-button').click();

    // Verify character element was created
    await expect(page.getByTestId('element-Test Character')).toBeVisible();

    // Click on the character to open it
    await page.getByTestId('element-Test Character').click();

    // Fill in some character data (e.g., name field in Basic Info tab)
    const nameField = page.locator('input[placeholder*="name"]').first();
    await expect(nameField).toBeVisible();
    await nameField.fill('Test Character Name');

    // Open the snapshots dialog via toolbar button
    const snapshotsBtn = page.getByTestId('toolbar-snapshots');
    await expect(snapshotsBtn).toBeVisible();
    await snapshotsBtn.click();

    // Wait for the snapshots dialog to appear
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    // Verify empty state message appears
    await expect(page.getByText('No snapshots yet')).toBeVisible();

    // Click create snapshot button
    await page.getByTestId('create-snapshot-btn').click();

    // Fill in snapshot dialog
    const snapshotNameInput = page.getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible();
    // Click first to ensure focus
    await snapshotNameInput.click();
    await snapshotNameInput.fill('Character Snapshot');
    // Verify the value was set
    await expect(snapshotNameInput).toHaveValue('Character Snapshot');

    // Submit the dialog
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for create dialog to close
    await expect(snapshotNameInput).not.toBeVisible();

    // Verify the snapshot appears in the list
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Character Snapshot'
    );

    // Verify the empty state is gone
    await expect(page.getByText('No snapshots yet')).not.toBeVisible();

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
  });

  test('should restore a snapshot for a worldbuilding element', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a location worldbuilding element
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-location-v1').click();
    await page.getByTestId('element-name-input').fill('Test Location');
    await page.getByTestId('create-element-button').click();

    // Click on the location to open it
    await page.getByTestId('element-Test Location').click();

    // Fill in the Summary field (a worldbuilding field, not identity)
    const summaryField = page.getByRole('textbox', { name: 'Summary' });
    await expect(summaryField).toBeVisible();
    await summaryField.fill(
      'A beautiful mountain village nestled in the Alps.'
    );

    // Wait for debounce to complete and data to sync to Yjs Map
    // The worldbuilding editor has a 500ms debounce before saving
    await page.waitForTimeout(600);

    // Open snapshots dialog and create a snapshot
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    await page.getByTestId('create-snapshot-btn').click();

    // Wait for the create snapshot dialog to appear
    const snapshotNameInput = page.getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible();
    // Click first to ensure focus
    await snapshotNameInput.click();
    await snapshotNameInput.fill('Original Location');
    // Verify the value was set
    await expect(snapshotNameInput).toHaveValue('Original Location');
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for create dialog to close
    await expect(snapshotNameInput).not.toBeVisible();

    // Verify snapshot was created
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Original Location'
    );

    // Close dialog and modify the location data
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // Change the summary field
    await summaryField.clear();
    await summaryField.fill('A destroyed wasteland.');

    // Verify content changed
    await expect(summaryField).toHaveValue('A destroyed wasteland.');

    // Wait for debounce to complete so the change is persisted before restore
    await page.waitForTimeout(600);

    // Open snapshots dialog and restore
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    // Find the snapshot and restore it
    const snapshotMenuBtn = snapshotItem.locator(
      '[data-testid^="snapshot-menu-"]'
    );
    await snapshotMenuBtn.click();

    // Click restore option from menu (menu is portaled to body, so use page-level locator)
    await page.locator('[data-testid^="restore-snapshot-"]').click();

    // Confirm restore in the confirmation dialog
    await expect(page.getByTestId('confirm-restore-btn')).toBeVisible();
    await page.getByTestId('confirm-restore-btn').click();

    // Wait for restore confirmation dialog to close
    await expect(page.getByTestId('confirm-restore-btn')).not.toBeVisible();

    // Wait for the snapshots dialog to auto-close after successful restore
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // Verify content was restored
    await expect(summaryField).toHaveValue(
      'A beautiful mountain village nestled in the Alps.'
    );
  });
});

test.describe('Auto-Snapshots', () => {
  test('should auto-create a snapshot when navigating away from a project with edits', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a document element
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill('Auto Snapshot Doc');
    await page.getByTestId('create-element-button').click();

    // Click on the document to open it
    await page.getByTestId('element-Auto Snapshot Doc').click();

    // Type some content to make it dirty (use keyboard.type for real input events
    // that go through ProseMirror's Yjs binding and trigger ydoc updates)
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Content that should trigger an auto-snapshot.');

    // Wait for content to be persisted
    await expect(page.locator('.sync-status')).toContainText('local');

    // Small delay to ensure the ydoc update event has fired and markDirty was called
    await page.waitForTimeout(500);

    // Navigate away using the in-app exit button.
    // The exit button uses Angular router.navigate, which triggers canDeactivate()
    // where auto-snapshots are created. (ngOnDestroy is NOT called because the
    // CustomRouteReuseStrategy detaches the component instead of destroying it.)
    await page.getByTestId('sidebar-exit-button').click();
    await page.waitForURL('/');

    // Navigate back to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Open the document again
    await page.getByTestId('element-Auto Snapshot Doc').click();

    // Open the snapshots dialog
    const snapshotsBtn = page.getByTestId('toolbar-snapshots');
    await expect(snapshotsBtn).toBeVisible();
    await snapshotsBtn.click();

    // Wait for the snapshots dialog
    await expect(page.locator('mat-dialog-container')).toBeVisible();

    // Verify an auto-snapshot was created (name starts with "Auto-save —")
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Auto-save'
    );

    // Close the dialog
    await page.getByTestId('close-snapshots-dialog').click();
  });
});
