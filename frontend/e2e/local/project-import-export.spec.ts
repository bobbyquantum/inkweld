/**
 * Project Import/Export Tests - Local Mode
 *
 * Tests that verify project export and import functionality
 * works correctly in pure local mode without any server connection.
 *
 * Consolidated from 8 individual tests into 3 grouped tests using
 * `test.step()` to share project-open + settings-tab navigation.
 */
import { type Page } from '@playwright/test';
import * as fs from 'fs';
import JSZip from 'jszip';
import * as os from 'os';
import * as path from 'path';

import { expect, test } from './fixtures';

const tmpDir = os.tmpdir();

/**
 * Navigate to the project settings Actions tab.
 * Idempotent: safe to call multiple times within one test.
 */
async function openActionsTab(page: Page): Promise<void> {
  await page.getByTestId('sidebar-settings-button').click();
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-actions').click();
}

/**
 * Open the fixture project (idempotent).
 */
async function openProject(page: Page): Promise<void> {
  if (await page.getByTestId('project-card').first().isVisible()) {
    await page.getByTestId('project-card').first().click();
  }
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

/**
 * Trigger an export and save to a temp file. Returns the saved file path
 * and the suggested filename from the browser.
 */
async function exportToTempFile(
  page: Page,
  prefix: string
): Promise<{ filePath: string; filename: string }> {
  await openActionsTab(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project-button').click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const filePath = path.join(tmpDir, `${prefix}-${Date.now()}.zip`);
  await download.saveAs(filePath);
  expect(await download.failure()).toBeNull();
  return { filePath, filename };
}

/**
 * Verify a ZIP and extract its manifest.json (cross-platform via JSZip).
 */
async function verifyZipContents(zipPath: string): Promise<{
  files: string[];
  manifest?: Record<string, unknown>;
}> {
  const zipData = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipData);
  const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);

  let manifest: Record<string, unknown> | undefined;
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    const manifestContent = await manifestFile.async('string');
    manifest = JSON.parse(manifestContent) as Record<string, unknown>;
  }

  return { files, manifest };
}

test.describe('Local Project Export', () => {
  test('export produces valid ZIP with manifest and project entries', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    const { filePath, filename } = await exportToTempFile(page, 'export');

    await test.step('download has expected filename', () => {
      expect(filename).toMatch(/test-project.*\.zip$/);
    });

    await test.step('manifest.json exists with correct metadata', async () => {
      const { files, manifest } = await verifyZipContents(filePath);
      expect(files).toContain('manifest.json');
      expect(manifest).toBeDefined();
      expect(manifest?.['version']).toBe(2);
      expect(manifest?.['originalSlug']).toBe('test-project');
      expect(manifest?.['projectTitle']).toBe('Test Project');
    });

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
});

test.describe('Local Project Import', () => {
  test('import dialog UX: open, cancel, invalid ZIP error, slug validation, slug collision', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    // Pre-export an archive once for the dialog-driven steps below.
    const { filePath: exportedFile } = await exportToTempFile(
      page,
      'dialog-ux'
    );

    await test.step('settings → import opens the import dialog', async () => {
      await openActionsTab(page);
      await page.getByTestId('import-project-button').click();
      await expect(page.getByTestId('import-drop-zone')).toBeVisible();
      await expect(page.getByTestId('import-browse-button')).toBeVisible();
      await expect(page.getByTestId('import-cancel-button')).toBeVisible();
    });

    await test.step('cancel button closes the dialog', async () => {
      await page.getByTestId('import-cancel-button').click();
      await expect(page.getByTestId('import-drop-zone')).not.toBeVisible();
    });

    await test.step('invalid ZIP file shows a parse error', async () => {
      await openActionsTab(page);
      await page.getByTestId('import-project-button').click();
      await expect(page.getByTestId('import-drop-zone')).toBeVisible();

      const invalidZipPath = path.join(tmpDir, `invalid-${Date.now()}.zip`);
      fs.writeFileSync(invalidZipPath, 'This is not a valid ZIP file');

      await page.getByTestId('import-file-input').setInputFiles(invalidZipPath);
      await expect(page.getByTestId('import-parse-error')).toBeVisible();

      // Reset the dialog state for the next steps.
      await page.getByTestId('import-cancel-button').click();
      if (fs.existsSync(invalidZipPath)) fs.unlinkSync(invalidZipPath);
    });

    await test.step('slug input rejects invalid format and accepts valid one', async () => {
      await openActionsTab(page);
      await page.getByTestId('import-project-button').click();
      await page.getByTestId('import-file-input').setInputFiles(exportedFile);
      await expect(page.getByTestId('import-slug-input')).toBeVisible();

      // Uppercase characters are invalid.
      await page.getByTestId('import-slug-input').fill('Invalid-SLUG');
      await expect(page.getByTestId('import-start-button')).toBeDisabled();

      // Lowercase + digits + hyphens are valid.
      await page.getByTestId('import-slug-input').fill('valid-slug-123');
      await expect(page.getByTestId('import-start-button')).toBeEnabled();
    });

    await test.step('collision with existing slug disables the import button', async () => {
      // Continue using the already-uploaded file in the same dialog.
      await page.getByTestId('import-slug-input').fill('unique-slug-test');
      await expect(page.getByTestId('import-start-button')).toBeEnabled();

      // 'test-project' is the fixture project's slug.
      await page.getByTestId('import-slug-input').fill('test-project');
      await expect(page.getByTestId('import-start-button')).toBeDisabled();
    });

    if (fs.existsSync(exportedFile)) fs.unlinkSync(exportedFile);
  });
});

test.describe('Export/Import Round-Trip', () => {
  test('round-trip: export → import with new slug → second project exists with original title', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    // Export the fixture project to disk.
    const { filePath: exportedFile } = await exportToTempFile(
      page,
      'roundtrip'
    );

    // Capture the original title from the manifest for later verification.
    const { manifest: originalManifest } =
      await verifyZipContents(exportedFile);
    expect(originalManifest).toBeDefined();
    const projectTitle = originalManifest?.['projectTitle'];
    const originalTitle =
      typeof projectTitle === 'string' ? projectTitle : 'Test Project';

    const newSlug = `roundtrip-${Date.now()}`;

    await test.step('upload exported file and configure new slug', async () => {
      await openActionsTab(page);
      await page.getByTestId('import-project-button').click();
      await expect(page.getByTestId('import-drop-zone')).toBeVisible();

      await page.getByTestId('import-file-input').setInputFiles(exportedFile);
      await expect(page.getByTestId('import-archive-info')).toBeVisible();
      await expect(page.getByTestId('import-slug-input')).toBeVisible();

      await page.getByTestId('import-slug-input').fill(newSlug);
      await expect(page.getByTestId('import-start-button')).toBeEnabled();
    });

    await test.step('start import and confirm success dialog reports the new slug', async () => {
      await page.getByTestId('import-start-button').click();
      await expect(page.getByTestId('import-success')).toBeVisible();
      await expect(page.getByTestId('import-result-slug')).toContainText(
        newSlug
      );
      await page.getByTestId('import-done-button').click();
    });

    await test.step('home page now lists 2 projects, including imported title', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Restrict to .cover-item to avoid duplicates from nested mat-card.
      const projectCards = page.locator(
        '.cover-item[data-testid="project-card"]'
      );
      await expect(projectCards).toHaveCount(2);

      const allCards = await projectCards.all();
      let found = false;
      for (const card of allCards) {
        const text = await card.textContent();
        if (text?.includes(originalTitle)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    if (fs.existsSync(exportedFile)) fs.unlinkSync(exportedFile);
  });
});
