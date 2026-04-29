import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * Regression test: snapshots must preserve `elementRef` nodes.
 *
 * Bug background:
 *   The Yjs <-> XML serializer used by `UnifiedSnapshotService` was
 *   lower-casing every node name on both serialize and deserialize, so
 *   camelCase ProseMirror node types like `elementRef`, `codeBlock`,
 *   `listItem`, etc. were renamed to `elementref`, `codeblock`,
 *   `listitem`. y-prosemirror silently drops nodes the schema doesn't
 *   recognize, which meant any document that referenced another element
 *   via an `@`-mention chip lost those chips the moment the user
 *   restored a snapshot (or imported a `.inkweld.zip` archive).
 *
 *   The fix preserves the original node-name casing in both
 *   `xmlElementToXmlString` and `domElementToYjsElement`. Unit tests
 *   cover the serializer, this spec covers the full end-to-end flow:
 *   create chip -> snapshot -> mutate doc -> restore -> chip survives.
 *
 * The test runs against the real backend so we also exercise the
 * snapshot persistence path (Hono + LevelDB), not just the in-memory
 * serializer.
 */
test.describe('Snapshot restore preserves elementRef chips', () => {
  test('elementRef node survives create -> snapshot -> edit -> restore', async ({
    authenticatedPage: page,
  }) => {
    // Project + element names are unique per test run.
    const stamp = Date.now();
    const projectTitle = `Snapshot Refs ${stamp}`;
    const projectSlug = `snapshot-refs-${stamp}`;
    const characterName = `Aria-${stamp}`;
    const documentName = `Story-${stamp}`;

    // 1) Create a project (default worldbuilding-empty template).
    await createProjectWithTwoSteps(page, projectTitle, projectSlug);

    // Wait for the project tree shell to be ready.
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // 2) Create a Character element so the @-mention popup has a target.
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill(characterName);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
    await expect(
      page.locator(`[data-testid="element-${characterName}"]`).first()
    ).toBeVisible();

    // 3) Create a document element.
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill(documentName);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });

    // Open the document.
    await page.getByTestId(`element-${documentName}`).first().click();

    // 4) Type some text and insert an @-mention chip via the popup.
    //    The `document-editor` testid is on the editor wrapper; ProseMirror
    //    renders the actual contenteditable inside it.
    const editor = page
      .getByTestId('document-editor')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('Once upon a time ', { delay: 10 });

    await page.keyboard.type('@');
    await page
      .locator('[data-testid="element-ref-popup"]')
      .waitFor({ state: 'visible' });

    // Narrow the popup to our character (avoids hitting any default refs).
    await page
      .getByTestId('element-ref-search-input')
      .fill(characterName.slice(0, 4));

    const firstResult = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    await page
      .locator('[data-testid="element-ref-popup"]')
      .waitFor({ state: 'hidden' });

    // The chip should now be in the editor.
    const chip = editor.locator('[data-element-ref="true"]').first();
    await expect(chip).toBeVisible();
    const chipElementId = await chip.getAttribute('data-element-id');
    expect(chipElementId).toBeTruthy();

    // Add a trailing word so the doc has surrounding text.
    await editor.click();
    await page.keyboard.press('End');
    await editor.pressSequentially(' arrived.', { delay: 10 });

    // Wait for the change to sync to the server before snapshotting.
    await expect(page.locator('.sync-status')).toContainText(/synced|local/);

    // 5) Create a snapshot.
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();
    await page.getByTestId('create-snapshot-btn').click();

    const nameInput = page.getByTestId('snapshot-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.click();
    await nameInput.fill('With element ref');
    await expect(nameInput).toHaveValue('With element ref');
    await page.getByTestId('create-snapshot-submit-btn').click();
    await expect(nameInput).not.toBeVisible();

    const snapshotItem = page.locator('[data-testid^="snapshot-"]').first();
    await expect(snapshotItem).toBeVisible();

    // Close the snapshots dialog so we can edit the document.
    await page.getByTestId('close-snapshots-dialog').click();
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // 6) Mutate the document - delete everything including the chip.
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await editor.pressSequentially('Chip is gone now.', { delay: 10 });

    // The chip should be gone before we restore.
    await expect(editor.locator('[data-element-ref="true"]')).toHaveCount(0);
    await expect(editor).toContainText('Chip is gone now.');

    // Wait for the mutation to persist.
    await expect(page.locator('.sync-status')).toContainText(/synced|local/);

    // 7) Restore the snapshot.
    await page.getByTestId('toolbar-snapshots').click();
    await expect(page.getByTestId('create-snapshot-btn')).toBeVisible();

    const snapshotMenuBtn = snapshotItem.locator(
      '[data-testid^="snapshot-menu-"]'
    );
    await snapshotMenuBtn.click();
    await page.locator('[data-testid^="restore-snapshot-"]').click();

    await expect(page.getByTestId('confirm-restore-btn')).toBeVisible();
    await page.getByTestId('confirm-restore-btn').click();
    await expect(page.getByTestId('confirm-restore-btn')).not.toBeVisible();

    // The snapshots dialog auto-closes after a successful restore.
    await expect(page.getByTestId('close-snapshots-dialog')).not.toBeVisible();

    // 8) The chip MUST be back. This is the assertion that fails without
    //    the serializer fix - y-prosemirror would have dropped the
    //    lowercased `<elementref>` node during restore, leaving only the
    //    surrounding plain text.
    const restoredChip = editor.locator('[data-element-ref="true"]').first();
    await expect(restoredChip).toBeVisible();
    await expect(restoredChip).toHaveAttribute(
      'data-element-id',
      chipElementId!
    );

    // Surrounding text from the snapshot should also be back.
    await expect(editor).toContainText('Once upon a time');
    await expect(editor).toContainText('arrived.');
    await expect(editor).not.toContainText('Chip is gone now.');
  });
});
