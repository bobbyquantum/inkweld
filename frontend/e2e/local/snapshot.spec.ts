/**
 * Snapshot Tests - Local Mode
 *
 * Verifies snapshot functionality (create, restore, delete) for both
 * document elements and worldbuilding elements in local mode.
 *
 * Snapshots are accessed via a history icon in the toolbar that opens
 * a dialog (rather than being embedded in the meta panel).
 *
 * Consolidated from 6 individual tests into 3 grouped tests using
 * `test.step()`. Each grouped test owns one element so snapshot list
 * state stays predictable.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openProject(page: Page): Promise<void> {
  await page.getByTestId('project-card').first().click();
  await expect(page).toHaveURL(/\/.+\/.+/);
}

async function createElement(
  page: Page,
  type: 'item' | 'character-v1' | 'location-v1',
  name: string
): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId(`element-type-${type}`).click();
  await page.getByTestId('element-name-input').fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
  await page.getByTestId(`element-${name}`).click();
}

async function openSnapshotsDialog(page: Page): Promise<void> {
  const snapshotsButton = page
    .getByTestId('toolbar-snapshots')
    .or(page.getByRole('button', { name: 'Open document snapshots' }));
  await snapshotsButton.click();
  await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();
}

async function createSnapshot(page: Page, name: string): Promise<void> {
  await page.getByTestId('create-snapshot-btn').click();
  const nameInput = page.getByTestId('snapshot-name-input');
  await expect(nameInput).toBeVisible();
  await nameInput.click();
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);
  await page.getByTestId('create-snapshot-submit-btn').click();
  await expect(nameInput).not.toBeVisible();
}

async function closeSnapshotsDialog(page: Page): Promise<void> {
  await page.getByTestId('close-snapshots-dialog').click();
  await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Document Snapshots', () => {
  test('create, restore, and delete a snapshot for a document element', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createElement(page, 'item', 'Doc Snapshot Test');

    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill('Original content before snapshot.');
    await expect(page.locator('.sync-status')).toContainText('local');

    await test.step('create snapshot is listed and clears empty state', async () => {
      await openSnapshotsDialog(page);
      await expect(page.getByText('No snapshots yet')).toBeVisible();

      await createSnapshot(page, 'Original');

      const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
      await expect(snapshotItem).toBeVisible();
      await expect(snapshotItem.locator('.snapshot-name')).toContainText(
        'Original'
      );
      await expect(page.getByText('No snapshots yet')).not.toBeVisible();

      await closeSnapshotsDialog(page);
    });

    await test.step('restoring a snapshot reverts editor content', async () => {
      await editor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('Modified content after snapshot.');
      await expect(editor).toContainText('Modified content after snapshot.');
      await expect(page.locator('.sync-status')).toContainText('local');

      await openSnapshotsDialog(page);

      const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
      await snapshotItem.locator('[data-testid^="snapshot-menu-"]').click();
      await page.locator('[data-testid^="restore-snapshot-"]').click();

      await expect(page.getByTestId('confirm-restore-btn')).toBeVisible();
      await page.getByTestId('confirm-restore-btn').click();
      await expect(page.getByTestId('confirm-restore-btn')).not.toBeVisible();

      // Snapshots dialog auto-closes on successful restore.
      await expect(
        page.getByTestId('close-snapshots-dialog')
      ).not.toBeVisible();

      await expect(editor).toContainText('Original content before snapshot.');
    });

    await test.step('deleting the snapshot removes it and restores empty state', async () => {
      await openSnapshotsDialog(page);

      const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
      await expect(snapshotItem).toBeVisible();
      await snapshotItem.locator('[data-testid^="snapshot-menu-"]').click();
      await page.locator('[data-testid^="delete-snapshot-"]').click();

      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();
      await expect(page.getByTestId('confirm-delete-button')).not.toBeVisible();

      await expect(snapshotItem).not.toBeVisible();
      await expect(page.getByText('No snapshots yet')).toBeVisible();

      await closeSnapshotsDialog(page);
    });
  });
});

test.describe('Worldbuilding Snapshots', () => {
  test('create and restore a snapshot for a worldbuilding element', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createElement(page, 'location-v1', 'Test Location');

    // Open the first non-meta schema tab so the form fields are visible.
    const firstSchemaTab = page
      .locator(
        '[data-testid^="nav-"]:not([data-testid="nav-identity"]):not([data-testid="nav-relationships"]):not([data-testid="nav-media"])'
      )
      .first();
    await firstSchemaTab.click();

    const summaryField = page.getByRole('textbox', { name: 'Summary' });
    await expect(summaryField).toBeVisible();
    await summaryField.fill(
      'A beautiful mountain village nestled in the Alps.'
    );
    // Worldbuilding editor debounces saves at 500ms; wait for the flush.
    await page.waitForTimeout(600);

    await test.step('create snapshot is listed', async () => {
      await openSnapshotsDialog(page);
      await expect(page.getByText('No snapshots yet')).toBeVisible();

      await createSnapshot(page, 'Original Location');

      const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
      await expect(snapshotItem.locator('.snapshot-name')).toContainText(
        'Original Location'
      );
      await expect(page.getByText('No snapshots yet')).not.toBeVisible();

      await closeSnapshotsDialog(page);
    });

    await test.step('restoring reverts the worldbuilding field', async () => {
      await summaryField.clear();
      await summaryField.fill('A destroyed wasteland.');
      await expect(summaryField).toHaveValue('A destroyed wasteland.');
      // Wait for the debounced save before triggering a restore.
      await page.waitForTimeout(600);

      await openSnapshotsDialog(page);

      const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
      await snapshotItem.locator('[data-testid^="snapshot-menu-"]').click();
      await page.locator('[data-testid^="restore-snapshot-"]').click();

      await expect(page.getByTestId('confirm-restore-btn')).toBeVisible();
      await page.getByTestId('confirm-restore-btn').click();
      await expect(page.getByTestId('confirm-restore-btn')).not.toBeVisible();

      await expect(
        page.getByTestId('close-snapshots-dialog')
      ).not.toBeVisible();

      await expect(summaryField).toHaveValue(
        'A beautiful mountain village nestled in the Alps.'
      );
    });
  });
});

test.describe('Auto-Snapshots', () => {
  test('auto-creates a snapshot when navigating away with edits', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);
    await createElement(page, 'item', 'Auto Snapshot Doc');

    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    // keyboard.type triggers real input events through ProseMirror's Yjs binding,
    // which is what marks the doc dirty for auto-snapshot creation.
    await page.keyboard.type('Content that should trigger an auto-snapshot.');
    await expect(page.locator('.sync-status')).toContainText('local');

    // Small delay so the ydoc update event has fired and markDirty was called
    // before canDeactivate runs on navigation.
    await page.waitForTimeout(500);

    // Use the in-app exit button (router.navigate) so canDeactivate runs.
    // ngOnDestroy does NOT run because CustomRouteReuseStrategy detaches.
    await page.getByTestId('sidebar-exit-button').click();
    await page.waitForURL('/');

    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await page.getByTestId('element-Auto Snapshot Doc').click();

    await openSnapshotsDialog(page);

    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem.locator('.snapshot-name')).toContainText(
      'Auto-save'
    );

    await closeSnapshotsDialog(page);
  });
});
