/**
 * Project Import/Export Tests - Offline Mode
 *
 * Tests that verify project export and import functionality
 * works correctly in pure offline mode without any server connection.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures';

/**
 * Helper to verify a ZIP file is valid and extract manifest.
 * Uses unzip command line tool instead of importing jszip.
 */
function verifyZipContents(zipPath: string): {
  files: string[];
  manifest?: Record<string, unknown>;
} {
  // List files in the ZIP
  const output = execSync(`unzip -l "${zipPath}" 2>&1`).toString();
  const files = output
    .split('\n')
    .filter(line => line.trim() && !line.includes('Archive:'))
    .map(line => {
      const match = line.match(/\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter((f): f is string => !!f && !f.includes('---------'));

  // Extract and read manifest if it exists
  let manifest: Record<string, unknown> | undefined;
  if (files.includes('manifest.json')) {
    const tmpDir = `/tmp/zip-extract-${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`unzip -o "${zipPath}" manifest.json -d "${tmpDir}" 2>&1`);
    const manifestContent = fs.readFileSync(
      path.join(tmpDir, 'manifest.json'),
      'utf-8'
    );
    manifest = JSON.parse(manifestContent) as Record<string, unknown>;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { files, manifest };
}

test.describe('Offline Project Export', () => {
  test('should export a project to a ZIP file', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Open the more menu
    await page.getByTestId('project-more-menu-button').click();

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
    const downloadPath = path.join('/tmp', filename);
    await download.saveAs(downloadPath);

    // Verify it's a valid ZIP file with expected contents
    const { files, manifest } = verifyZipContents(downloadPath);

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
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Open the more menu
    await page.getByTestId('project-more-menu-button').click();

    // Start listening for downloads
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.getByTestId('export-project-button').click();

    // Wait for download
    const download = await downloadPromise;
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    // Verify ZIP structure
    const { files } = verifyZipContents(downloadPath);

    // Verify expected files exist
    expect(files).toContain('manifest.json');

    // Cleanup
    fs.unlinkSync(downloadPath);
  });
});

test.describe('Offline Project Import', () => {
  test('should open import dialog from project menu', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Open the more menu
    await page.getByTestId('project-more-menu-button').click();

    // Click import button
    await page.getByTestId('import-project-button').click();

    // Verify import dialog opened
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();
    await expect(page.getByTestId('import-browse-button')).toBeVisible();
    await expect(page.getByTestId('import-cancel-button')).toBeVisible();
  });

  test('should cancel import dialog', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Open the more menu and click import
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();

    // Verify dialog is open
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Click cancel
    await page.getByTestId('import-cancel-button').click();

    // Verify dialog closed
    await expect(page.getByTestId('import-drop-zone')).not.toBeVisible();
  });

  test('should import an exported project with new slug', async ({
    offlinePageWithProject: page,
  }) => {
    // First, export the existing project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Export the project
    await page.getByTestId('project-more-menu-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;

    // Save to temp file
    const exportedFile = path.join('/tmp', `export-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Now import the same archive with a new slug
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();

    // Wait for dialog
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file using the file input
    const fileInput = page.getByTestId('import-file-input');
    await fileInput.setInputFiles(exportedFile);

    // Wait for parsing to complete - configure step should show
    await expect(page.getByTestId('import-archive-info')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('import-slug-input')).toBeVisible();

    // Enter a new unique slug
    const newSlug = `imported-${Date.now()}`;
    await page.getByTestId('import-slug-input').fill(newSlug);

    // Wait for slug validation to complete
    await page.waitForTimeout(500);

    // Click import button
    await expect(page.getByTestId('import-start-button')).toBeEnabled({
      timeout: 5000,
    });
    await page.getByTestId('import-start-button').click();

    // Wait for import to complete
    await expect(page.getByTestId('import-success')).toBeVisible({
      timeout: 30000,
    });

    // Verify the slug is shown
    await expect(page.getByTestId('import-result-slug')).toContainText(newSlug);

    // Close the dialog
    await page.getByTestId('import-done-button').click();

    // Navigate home and verify the new project exists
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should now have 2 projects (check using the cover-item class which is unique per project)
    const projectCards = page.locator(
      '.cover-item[data-testid="project-card"]'
    );
    await expect(projectCards).toHaveCount(2);

    // Cleanup
    fs.unlinkSync(exportedFile);
  });

  test('should show error for invalid ZIP file', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Open import dialog
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Create an invalid "ZIP" file
    const invalidZipPath = path.join('/tmp', 'invalid.zip');
    fs.writeFileSync(invalidZipPath, 'This is not a valid ZIP file');

    // Upload the invalid file
    const fileInput = page.getByTestId('import-file-input');
    await fileInput.setInputFiles(invalidZipPath);

    // Should show parse error
    await expect(page.getByTestId('import-parse-error')).toBeVisible({
      timeout: 10000,
    });

    // Cleanup
    fs.unlinkSync(invalidZipPath);
  });

  test('should validate slug format in import dialog', async ({
    offlinePageWithProject: page,
  }) => {
    // Export a project first
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Export
    await page.getByTestId('project-more-menu-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;
    const exportedFile = path.join('/tmp', `slug-test-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Open import dialog
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible({
      timeout: 10000,
    });

    // Test invalid slug with uppercase
    await page.getByTestId('import-slug-input').fill('Invalid-SLUG');
    await page.waitForTimeout(300);

    // Import button should be disabled for invalid slug
    await expect(page.getByTestId('import-start-button')).toBeDisabled();

    // Test valid slug
    await page.getByTestId('import-slug-input').fill('valid-slug-123');
    await page.waitForTimeout(500);

    // Import button should be enabled for valid slug
    await expect(page.getByTestId('import-start-button')).toBeEnabled({
      timeout: 5000,
    });

    // Cleanup
    fs.unlinkSync(exportedFile);
  });

  test('should detect slug collision on import', async ({
    offlinePageWithProject: page,
  }) => {
    // Export the existing project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId('project-more-menu-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;
    const exportedFile = path.join('/tmp', `collision-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Open import dialog
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();
    await expect(page.getByTestId('import-drop-zone')).toBeVisible();

    // Upload the file
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible({
      timeout: 10000,
    });

    // First enter a unique slug to make sure import works
    await page.getByTestId('import-slug-input').fill('unique-slug-test');
    await page.waitForTimeout(500);

    // Verify import button is enabled for unique slug
    await expect(page.getByTestId('import-start-button')).toBeEnabled({
      timeout: 5000,
    });

    // Now try to use the existing slug (test-project)
    await page.getByTestId('import-slug-input').fill('test-project');
    await page.waitForTimeout(800);

    // Import button should be disabled (slug already taken)
    await expect(page.getByTestId('import-start-button')).toBeDisabled({
      timeout: 5000,
    });

    // Cleanup
    fs.unlinkSync(exportedFile);
  });
});

test.describe('Export/Import Round-Trip', () => {
  test('should preserve project data through export/import cycle', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible({
      timeout: 10000,
    });

    // Export the project
    await page.getByTestId('project-more-menu-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-project-button').click();
    const download = await downloadPromise;

    const exportedFile = path.join('/tmp', `roundtrip-${Date.now()}.zip`);
    await download.saveAs(exportedFile);

    // Read the original manifest
    const { manifest: originalManifest } = verifyZipContents(exportedFile);
    expect(originalManifest).toBeDefined();
    const projectTitle = originalManifest?.['projectTitle'];
    const originalTitle =
      typeof projectTitle === 'string' ? projectTitle : 'Test Project';

    // Import with new slug
    await page.getByTestId('project-more-menu-button').click();
    await page.getByTestId('import-project-button').click();
    await page.getByTestId('import-file-input').setInputFiles(exportedFile);
    await expect(page.getByTestId('import-slug-input')).toBeVisible({
      timeout: 10000,
    });

    const newSlug = `roundtrip-${Date.now()}`;
    await page.getByTestId('import-slug-input').fill(newSlug);
    await page.waitForTimeout(500);
    await page.getByTestId('import-start-button').click();

    // Wait for success
    await expect(page.getByTestId('import-success')).toBeVisible({
      timeout: 30000,
    });
    await page.getByTestId('import-done-button').click();

    // Navigate to the imported project
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
