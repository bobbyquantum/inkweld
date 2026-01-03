import { expect, test } from './fixtures';

/**
 * Snapshot Tests - Offline Mode
 *
 * These tests verify snapshot functionality (create, restore, delete)
 * for both document elements and worldbuilding elements in offline mode.
 *
 * Snapshots are now accessed via a history icon in the toolbar that opens
 * a dialog, rather than being embedded in the meta panel.
 */

test.describe('Document Snapshots', () => {
  test('should create and list a snapshot for a document element', async ({
    offlinePageWithProject: page,
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

    // Wait for the editor to load
    await page.waitForTimeout(500);

    // Type some content in the document
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.fill('This is test content for snapshot testing.');

    // Wait for content to be saved
    await page.waitForTimeout(500);

    // Open the snapshots dialog via toolbar button
    const snapshotsBtn = page.getByTestId('toolbar-snapshots');
    await expect(snapshotsBtn).toBeVisible({ timeout: 5000 });
    await snapshotsBtn.click();

    // Wait for the snapshots dialog to appear
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Verify empty state message appears
    await expect(page.getByText('No snapshots yet')).toBeVisible({
      timeout: 5000,
    });

    // Click create snapshot button
    const createSnapshotBtn = page.getByTestId('create-snapshot-btn');
    await expect(createSnapshotBtn).toBeVisible({ timeout: 5000 });
    await createSnapshotBtn.click();

    // Wait for the create snapshot dialog to appear (nested dialog)
    await page.waitForTimeout(300);

    // Fill in snapshot dialog
    const snapshotNameInput = page.getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible({ timeout: 5000 });
    await snapshotNameInput.fill('First Snapshot');

    const snapshotDescInput = page.getByTestId('snapshot-description-input');
    await snapshotDescInput.fill('A test snapshot description');

    // Submit the dialog
    const submitBtn = page.getByTestId('create-snapshot-submit-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    await submitBtn.click();

    // Wait a moment for the snapshot to be saved
    await page.waitForTimeout(1000);

    // Verify the snapshot appears in the list (look for the snapshot name in the snapshot item)
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible({ timeout: 5000 });
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'First Snapshot'
    );

    // Verify the empty state is gone
    await expect(page.getByText('No snapshots yet')).not.toBeVisible();

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should restore a snapshot for a document element', async ({
    offlinePageWithProject: page,
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

    // Wait for the editor to load
    await page.waitForTimeout(500);

    // Type initial content
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.fill('Original content before snapshot.');
    await page.waitForTimeout(500);

    // Open the snapshots dialog
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Create a snapshot
    await page.getByTestId('create-snapshot-btn').click();
    const snapshotNameInput = page
      .locator('mat-dialog-container')
      .last()
      .getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible({
      timeout: 5000,
    });
    await snapshotNameInput.click();
    await snapshotNameInput.fill('Before Edit');
    await expect(snapshotNameInput).toHaveValue('Before Edit');
    await page.getByTestId('create-snapshot-submit-btn').click();
    await page.waitForTimeout(1000);

    // Verify snapshot was created
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Before Edit'
    );

    // Close the snapshots dialog to edit the content
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible({
      timeout: 5000,
    });

    // Modify the document content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Modified content after snapshot.');
    await page.waitForTimeout(500);

    // Verify content changed
    await expect(editor).toContainText('Modified content after snapshot.');

    // Open snapshots dialog again and restore the snapshot
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Find the snapshot menu button and click it
    const snapshotMenuBtn = page
      .locator('[data-testid^="snapshot-"]')
      .first()
      .locator('button')
      .first();
    await snapshotMenuBtn.click();

    // Click restore option
    await page.getByRole('menuitem', { name: /restore/i }).click();

    // Confirm restore in dialog
    await page.getByRole('button', { name: /restore/i }).click();
    await page.waitForTimeout(500);

    // Dialog should close after restore
    await expect(page.locator('mat-dialog-container')).not.toBeVisible({
      timeout: 5000,
    });

    // Verify content was restored
    await expect(editor).toContainText('Original content before snapshot.');
  });

  test('should delete a snapshot', async ({ offlinePageWithProject: page }) => {
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
    await page.waitForTimeout(500);

    // Add some content
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.fill('Content for delete test.');
    await page.waitForTimeout(500);

    // Open the snapshots dialog
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Create a snapshot
    await page.getByTestId('create-snapshot-btn').click();
    const snapshotNameInput = page
      .locator('mat-dialog-container')
      .last()
      .getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible({
      timeout: 5000,
    });
    await snapshotNameInput.click();
    await snapshotNameInput.fill('To Be Deleted');
    await expect(snapshotNameInput).toHaveValue('To Be Deleted');
    await page.getByTestId('create-snapshot-submit-btn').click();
    await page.waitForTimeout(1000);

    // Verify snapshot was created
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'To Be Deleted'
    );

    // Set up dialog handler for confirm
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Find the snapshot menu button and click it
    const snapshotMenuBtn = snapshotItem.locator('button').first();
    await snapshotMenuBtn.click();

    // Click delete option
    await page.getByRole('menuitem', { name: /delete/i }).click();

    // Wait for deletion
    await page.waitForTimeout(500);

    // Verify snapshot is gone
    await expect(page.getByText('To Be Deleted')).not.toBeVisible();

    // Verify empty state is back
    await expect(page.getByText('No snapshots yet')).toBeVisible({
      timeout: 5000,
    });

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
  });
});

test.describe('Worldbuilding Snapshots', () => {
  test('should create and list a snapshot for a worldbuilding element', async ({
    offlinePageWithProject: page,
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

    // Wait for the worldbuilding editor to load
    await page.waitForTimeout(500);

    // Fill in some character data (e.g., name field in Basic Info tab)
    const nameField = page.locator('input[placeholder*="name"]').first();
    if (await nameField.isVisible({ timeout: 3000 })) {
      await nameField.fill('Test Character Name');
    }

    // Wait for data to be saved
    await page.waitForTimeout(500);

    // Open the snapshots dialog via toolbar button
    const snapshotsBtn = page.getByTestId('toolbar-snapshots');
    await expect(snapshotsBtn).toBeVisible({ timeout: 5000 });
    await snapshotsBtn.click();

    // Wait for the snapshots dialog to appear
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Verify empty state message appears
    await expect(page.getByText('No snapshots yet')).toBeVisible({
      timeout: 5000,
    });

    // Click create snapshot button
    const createSnapshotBtn = page.getByTestId('create-snapshot-btn');
    await expect(createSnapshotBtn).toBeVisible({ timeout: 5000 });
    await createSnapshotBtn.click();

    // Fill in snapshot dialog
    const snapshotNameInput = page
      .locator('mat-dialog-container')
      .last()
      .getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible({ timeout: 5000 });
    await snapshotNameInput.click();
    await snapshotNameInput.fill('Character Snapshot');
    await expect(snapshotNameInput).toHaveValue('Character Snapshot');

    // Submit the dialog
    await page.getByTestId('create-snapshot-submit-btn').click();

    // Wait for the snapshot to be created
    await page.waitForTimeout(1000);

    // Verify the snapshot appears in the list
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible({ timeout: 5000 });
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Character Snapshot'
    );

    // Verify the empty state is gone
    await expect(page.getByText('No snapshots yet')).not.toBeVisible();

    // Close the snapshots dialog
    await page.getByTestId('close-snapshots-dialog').click();
  });

  test('should restore a snapshot for a worldbuilding element', async ({
    offlinePageWithProject: page,
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
    await page.waitForTimeout(500);

    // Fill in the Summary field (a worldbuilding field, not identity)
    const summaryField = page.getByRole('textbox', { name: 'Summary' });
    await expect(summaryField).toBeVisible({ timeout: 5000 });
    await summaryField.fill(
      'A beautiful mountain village nestled in the Alps.'
    );
    // Wait for debounce (500ms) + save to complete
    await page.waitForTimeout(1000);

    // Open snapshots dialog and create a snapshot
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    await page.getByTestId('create-snapshot-btn').click();

    // Wait for the create snapshot dialog to appear
    const snapshotNameInput = page
      .locator('mat-dialog-container')
      .last()
      .getByTestId('snapshot-name-input');
    await expect(snapshotNameInput).toBeVisible({ timeout: 5000 });
    await snapshotNameInput.click();
    await snapshotNameInput.fill('Original Location');
    await expect(snapshotNameInput).toHaveValue('Original Location');

    await page.getByTestId('create-snapshot-submit-btn').click();
    await page.waitForTimeout(1000);

    // Verify snapshot was created
    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Original Location'
    );

    // Close dialog and modify the location data
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible({
      timeout: 5000,
    });

    // Change the summary field
    await summaryField.clear();
    await summaryField.fill('A destroyed wasteland.');
    // Wait for debounce (500ms) + save to complete
    await page.waitForTimeout(1000);

    // Verify content changed
    await expect(summaryField).toHaveValue('A destroyed wasteland.');

    // Open snapshots dialog and restore
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible({
      timeout: 5000,
    });

    // Find the snapshot and restore it
    const snapshotMenuBtn = page
      .locator('[data-testid^="snapshot-"]')
      .first()
      .locator('button')
      .first();
    await snapshotMenuBtn.click();
    await page.getByRole('menuitem', { name: /restore/i }).click();

    await page.getByRole('button', { name: /restore/i }).click();
    await page.waitForTimeout(2000); // Wait longer for restore

    // Dialog should close after restore
    await expect(page.locator('mat-dialog-container')).not.toBeVisible({
      timeout: 5000,
    });

    // Verify content was restored
    await expect(summaryField).toHaveValue(
      'A beautiful mountain village nestled in the Alps.'
    );
  });
});
