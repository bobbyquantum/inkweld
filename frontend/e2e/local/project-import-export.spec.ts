/**
 * Project Import/Export Tests - Local Mode
 *
 * Tests that verify project export and import functionality
 * works correctly in pure local mode without any server connection.
 */
import * as fs from 'fs';
import JSZip from 'jszip';
import * as os from 'os';
import * as path from 'path';

import { expect, test } from './fixtures';

/** Cross-platform temp directory */
const tmpDir = os.tmpdir();

/**
 * Navigate to the project settings Actions tab.
 * Replaces the old kebab menu flow.
 */
async function openActionsTab(page: import('@playwright/test').Page) {
  await page.getByTestId('sidebar-settings-button').click();
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('settings-tab-actions').click();
}

/**
 * Helper to verify a ZIP file is valid and extract manifest.
 * Uses JSZip for cross-platform compatibility.
 */
async function verifyZipContents(zipPath: string): Promise<{
  files: string[];
  manifest?: Record<string, unknown>;
}> {
  // Read the ZIP file
  const zipData = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipData);

  // Get list of files
  const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);

  // Extract and read manifest if it exists
  let manifest: Record<string, unknown> | undefined;
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    const manifestContent = await manifestFile.async('string');
    manifest = JSON.parse(manifestContent) as Record<string, unknown>;
  }

  return { files, manifest };
}

test.describe('Local Project Export', () => {
  test('should export a project to a ZIP file', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate to settings Actions tab
    await openActionsTab(page);

    // Start listening for downloads before triggering the export
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.getByTestId('export-project-button').click();

    // Wait for download to complete
    const download = await downloadPromise;

    // Verify the download filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/test-project.*\.zip$/);

    // Save the file and verify its contents
    const downloadPath = path.join(tmpDir, filename);
    await download.saveAs(downloadPath);

    // Verify it's a valid ZIP file with expected contents
    const { files, manifest } = await verifyZipContents(downloadPath);

    // Verify manifest.json exists and has correct content
    expect(files).toContain('manifest.json');
    expect(manifest).toBeDefined();
    expect(manifest?.['version']).toBe(1);
    expect(manifest?.['originalSlug']).toBe('test-project');
    expect(manifest?.['projectTitle']).toBe('Test Project');

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should include all project elements in export', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate to settings Actions tab
    await openActionsTab(page);

    // Start listening for downloads
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.getByTestId('export-project-button').click();

    // Wait for download
    const download = await downloadPromise;
    const downloadPath = path.join(tmpDir, download.suggestedFilename());
    await download.saveAs(downloadPath);

    // Verify ZIP structure
    const { files } = await verifyZipContents(downloadPath);

    // Verify expected files exist
    expect(files).toContain('manifest.json');

    // Cleanup
    fs.unlinkSync(downloadPath);
  });
});

test.describe('Local Project Import', () => {
  test('should open import dialog from project menu', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate to settings Actions tab
    await openActionsTab(page);

    // Click import button
    await page.getByTestId('import-project-button').click();

    // Verify import dialog opened
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();
    await expect(page.getByTestId('import-browse-button')).toBeVisible();
    await expect(page.getByTestId('import-cancel-button')).toBeVisible();
  });

  test('should cancel import dialog', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate to settings Actions tab and click import
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();

    // Verify dialog is open
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Click cancel
    await page.getByTestId('import-cancel-button').click();

    // Verify dialog closed
    await expect(page.getByTestId('import-drop-zone')).not.toBeVisible();
  });

  test('should import an exported project with new slug', async ({
    localPageWithProject: page,
  }) => {
    // First, export the existing project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Export the project
    await openActionsTab(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;

    // Save to temp file
    const exportedFile = path.join(tmpDir, `export-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Now import the same archive with a new slug
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();

    // Wait for dialog
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file using the file input
    const fileInput = page.getByTestId('import-file-input');
    await fileInput.setInputFiles(exportedFile);

    // Wait for parsing to complete - configure step should show
    await expect(page.getByTestId('import-archive-info')).toBeVisible();
    await expect(page.getByTestId('import-slug-input')).toBeVisible();

    // Enter a new unique slug
    const newSlug = `imported-${Date.now()}`;
    await page.getByTestId('import-slug-input').fill(newSlug);

    // Click import button
    await expect(page.getByTestId('import-start-button')).toBeEnabled();
    await page.getByTestId('import-start-button').click();

    // Wait for import to complete
    await expect(page.getByTestId('import-success')).toBeVisible();

    // Verify the slug is shown
    await expect(page.getByTestId('import-result-slug')).toContainText(newSlug);

    // Close the dialog
    await page.getByTestId('import-done-button').click();

    // Navigate home and verify the new project exists
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Should now have 2 projects (check using the cover-item class which is unique per project)
    const projectCards = page.locator(
      '.cover-item[data-testid="project-card"]'
    );
    await expect(projectCards).toHaveCount(2);

    // Cleanup
    fs.unlinkSync(exportedFile);
  });

  test('should show error for invalid ZIP file', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate to settings Actions tab
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Create an invalid "ZIP" file
    const invalidZipPath = path.join(tmpDir, 'invalid.zip');
    fs.writeFileSync(invalidZipPath, 'This is not a valid ZIP file');

    // Upload the invalid file
    const fileInput = page.getByTestId('import-file-input');
    await fileInput.setInputFiles(invalidZipPath);

    // Should show parse error
    await expect(page.getByTestId('import-parse-error')).toBeVisible();

    // Cleanup
    fs.unlinkSync(invalidZipPath);
  });

  test('should validate slug format in import dialog', async ({
    localPageWithProject: page,
  }) => {
    // Export a project first
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Export
    await openActionsTab(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;
    const exportedFile = path.join(tmpDir, `slug-test-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Navigate to settings Actions tab
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible();

    // Test invalid slug with uppercase
    await page.getByTestId('import-slug-input').fill('Invalid-SLUG');

    // Import button should be disabled for invalid slug
    await expect(page.getByTestId('import-start-button')).toBeDisabled();

    // Test valid slug
    await page.getByTestId('import-slug-input').fill('valid-slug-123');

    // Import button should be enabled for valid slug
    await expect(page.getByTestId('import-start-button')).toBeEnabled();

    // Cleanup
    fs.unlinkSync(exportedFile);
  });

  test('should detect slug collision on import', async ({
    localPageWithProject: page,
  }) => {
    // Export the existing project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await openActionsTab(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;
    const exportedFile = path.join(tmpDir, `collision-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Navigate to settings Actions tab
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible();

    // First enter a unique slug to make sure import works
    await page.getByTestId('import-slug-input').fill('unique-slug-test');

    // Verify import button is enabled for unique slug
    await expect(page.getByTestId('import-start-button')).toBeEnabled();

    // Now try to use the existing slug (test-project)
    await page.getByTestId('import-slug-input').fill('test-project');

    // Import button should be disabled (slug already taken)
    await expect(page.getByTestId('import-start-button')).toBeDisabled();

    // Cleanup
    fs.unlinkSync(exportedFile);
  });
});

test.describe('Export/Import Round-Trip', () => {
  test('should preserve project data through export/import cycle', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Export the project
    await openActionsTab(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;

    const exportedFile = path.join(tmpDir, `roundtrip-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Read the original manifest
    const { manifest: originalManifest } =
      await verifyZipContents(exportedFile);
    expect(originalManifest).toBeDefined();
    const projectTitle = originalManifest?.['projectTitle'];
    const originalTitle =
      typeof projectTitle === 'string' ? projectTitle : 'Test Project';

    // Import with new slug
    await openActionsTab(page);
    await page.getByTestId('import-project-button').click();
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible();

    const newSlug = `roundtrip-${Date.now()}`;
    await page.getByTestId('import-slug-input').fill(newSlug);
    await expect(page.getByTestId('import-start-button')).toBeEnabled();
    await page.getByTestId('import-start-button').click();

    // Wait for success
    await expect(page.getByTestId('import-success')).toBeVisible();
    await page.getByTestId('import-done-button').click();

    // Navigate to the imported project
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Should have 2 projects now (original + imported)
    // Use .cover-item selector to avoid nested mat-card duplicates
    const projectCards = page.locator(
      '.cover-item[data-testid="project-card"]'
    );
    await expect(projectCards).toHaveCount(2);

    // Verify the project title was preserved
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

    // Cleanup
    fs.unlinkSync(exportedFile);
  });
});
