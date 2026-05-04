/**
 * Template Import Tests - Local Mode
 *
 * Tests that verify worldbuilding data is properly imported when creating
 * a project from a template (e.g., worldbuilding-demo).
 *
 * These tests specifically verify the fix for cross-project data collisions,
 * proper IndexedDB persistence timing, and relationship import.
 *
 * Consolidated from 8 individual tests into 3 grouped tests using
 * `test.step()`. Tests A and B reuse a single demo-template project so we
 * only pay the project-creation cost once per group; test C deliberately
 * creates two projects to verify no cross-project data collision.
 */
import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * Expand a folder in the project tree by clicking its chevron button.
 * Idempotent in the sense that re-expanding an already-open folder is OK.
 */
async function expandTreeFolder(page: Page, folderName: string): Promise<void> {
  const folder = page.getByRole('treeitem', { name: folderName });
  await expect(folder).toBeVisible();
  await folder.locator('button').first().click();
}

/**
 * Click a tree element by its visible name.
 */
async function openTreeElement(page: Page, elementName: string): Promise<void> {
  const el = page.getByRole('treeitem', { name: elementName });
  await expect(el).toBeVisible();
  await el.click();
}

test.describe('Template Worldbuilding Import', () => {
  test('demo template imports element data: characters, location, tags, descriptions', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Element Data Project',
      'element-data',
      'Testing element data import',
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/element-data/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await test.step('Elara character has imported Full Name and Species', async () => {
      await expandTreeFolder(page, 'Characters');
      await openTreeElement(page, 'Elara Nightwhisper');
      await page.getByTestId('nav-basic').click();

      const fullNameField = page.getByLabel('Full Name');
      await expect(fullNameField).toBeVisible();
      await expect(fullNameField).toHaveValue('Elara Nightwhisper');

      await expect(page.getByLabel('Species')).toHaveValue('Half-Elf');
    });

    await test.step('multiple characters each have unique imported data', async () => {
      const characters = ['Theron Blackwood', 'Mira Stonehart'];
      for (const name of characters) {
        await openTreeElement(page, name);
        await page.getByTestId('nav-basic').click();
        const fullNameField = page.getByLabel('Full Name');
        await expect(fullNameField).toBeVisible();
        await expect(fullNameField).toHaveValue(name);
      }
    });

    await test.step('Silverhollow location has Name and Population imported', async () => {
      await expandTreeFolder(page, 'Locations');
      await openTreeElement(page, 'Silverhollow');
      await page.getByTestId('nav-basic').click();

      await expect(page.getByLabel('Name')).toHaveValue('Silverhollow');
      await expect(page.getByLabel('Population')).toHaveValue('~3,000');
    });

    await test.step('Elara identity panel has imported description and tags', async () => {
      await openTreeElement(page, 'Elara Nightwhisper');

      const descriptionField = page.locator(
        'app-identity-panel textarea[placeholder*="description"]'
      );
      await expect(descriptionField).toBeVisible();
      await expect(descriptionField).toHaveValue(/brilliant half-elf scholar/);

      const tagGrid = page.locator('app-identity-panel [role="grid"]');
      await expect(tagGrid).toBeVisible();
      await expect(
        tagGrid.locator('[role="gridcell"]').filter({ hasText: 'Protagonist' })
      ).toBeVisible();
      await expect(
        tagGrid.locator('[role="gridcell"]').filter({ hasText: 'Complete' })
      ).toBeVisible();
    });
  });

  test('demo template imports relationships, backlinks, and renders authored timeline', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Relationships Backlinks Project',
      'rel-backlinks',
      'Testing relationships, backlinks and timeline',
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/rel-backlinks/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await test.step('Elara meta panel shows imported relationship type panels', async () => {
      await expandTreeFolder(page, 'Characters');
      await openTreeElement(page, 'Elara Nightwhisper');
      await page.getByTestId('nav-relationships').click();

      const relationshipPanels = page.locator(
        '[data-testid="relationship-type-panel"]'
      );
      await expect(relationshipPanels.first()).toBeVisible();
      await expect(page.getByTestId('add-relationship-button')).toBeVisible();
    });

    await test.step('Elara References panel lists template backlinks', async () => {
      const metaPanel = page.locator('app-meta-panel');
      await expect(metaPanel).toBeVisible();

      await expect(metaPanel.getByText('References')).toBeVisible();
      await expect(metaPanel.getByText('README')).toBeVisible();
      await expect(metaPanel.getByText('The Moonveil Accord')).toBeVisible();
    });

    await test.step('Moonveil Chronicle timeline renders without setup overlay', async () => {
      // Regression: the demo's Moonveil Reckoning time system must persist
      // on project creation, otherwise the timeline gets stuck on the
      // setup overlay instead of rendering authored events/eras.
      await openTreeElement(page, 'Moonveil Chronicle');

      await expect(page.getByTestId('timeline-canvas')).toBeVisible();
      await expect(page.getByTestId('timeline-setup')).toHaveCount(0);
      await expect(
        page.locator('[data-testid^="timeline-event-body-"]').first()
      ).toBeVisible();
    });
  });

  test('two projects from the same template have isolated worldbuilding data', async ({
    localPage: page,
  }) => {
    // Project A
    await createProjectWithTwoSteps(
      page,
      'Project A',
      'project-a',
      'First project',
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/project-a/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Project B — go via the create-project page directly (no kebab nav).
    await page.goto('/create-project');
    const templateDemo = page.getByTestId('template-worldbuilding-demo');
    await expect(templateDemo).toBeVisible();
    await templateDemo.click();
    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByTestId('project-title-input')).toBeVisible();
    await page.getByTestId('project-title-input').fill('Project B');
    await page.getByTestId('project-slug-input').fill('project-b');
    await page.getByTestId('project-description-input').fill('Second project');
    await page.getByTestId('create-project-button').click();
    await page.waitForURL(/\/testuser\/project-b/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await test.step('Project B has its own correctly-imported Elara data', async () => {
      await expandTreeFolder(page, 'Characters');
      await openTreeElement(page, 'Elara Nightwhisper');
      await page.getByTestId('nav-basic').click();

      const fullNameField = page.getByLabel('Full Name');
      await expect(fullNameField).toBeVisible();
      await expect(fullNameField).toHaveValue('Elara Nightwhisper');
    });

    await test.step('Project A still has its own intact Elara data', async () => {
      await page.goto('/');
      const projectACard = page
        .getByTestId('project-card')
        .filter({ hasText: 'Project A' })
        .first();
      await expect(projectACard).toBeVisible();
      await projectACard.click();

      await page.waitForURL(/\/testuser\/project-a/);
      await expect(page.getByTestId('project-tree')).toBeVisible();

      await expandTreeFolder(page, 'Characters');
      await openTreeElement(page, 'Elara Nightwhisper');
      await page.getByTestId('nav-basic').click();

      const fullNameField = page.getByLabel('Full Name');
      await expect(fullNameField).toBeVisible();
      await expect(fullNameField).toHaveValue('Elara Nightwhisper');
    });
  });
});
