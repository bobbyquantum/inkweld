/**
 * Template Import Tests - Local Mode
 *
 * Tests that verify worldbuilding data is properly imported when creating
 * a project from a template (e.g., worldbuilding-demo).
 *
 * These tests specifically verify the fix for cross-project data collisions,
 * proper IndexedDB persistence timing, and relationship import.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Template Worldbuilding Import', () => {
  test('should import relationships from demo template', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Relationships Test Project',
      'rel-test',
      'Testing relationships import',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/rel-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // Expand the meta panel to see relationships (panel starts collapsed)
    const expandPanelButton = page.getByTestId('expand-panel-button');
    await expect(expandPanelButton).toBeVisible();
    await expandPanelButton.click();

    // Check that the meta panel is visible and has relationship panels
    // Elara has: friend with Theron, originated-from Cloudspire, colleague with Mira, located-in Thornwood
    const relationshipPanels = page.locator(
      '[data-testid="relationship-type-panel"]'
    );
    await expect(relationshipPanels.first()).toBeVisible();

    // Verify the add relationship button is visible (indicates the panel is open)
    const addRelationshipButton = page.getByTestId('add-relationship-button');
    await expect(addRelationshipButton).toBeVisible();
  });

  test('should import all worldbuilding data from demo template', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Demo Test Project',
      'demo-test',
      'Testing worldbuilding import',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/demo-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder and expand it by clicking the chevron
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();

    // Click the expand button (chevron) inside the folder
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // Verify the character data is populated (check for specific field values)
    // The Basic Info tab should have "Full Name" field with value
    const fullNameField = page.getByLabel('Full Name');
    await expect(fullNameField).toBeVisible();

    // Get the value and verify it's populated (not empty)
    await expect(fullNameField).toHaveValue('Elara Nightwhisper');

    // Check another field to ensure nested data was imported
    // Look for the species field
    const speciesField = page.getByLabel('Species');
    await expect(speciesField).toHaveValue('Half-Elf');
  });

  test('should import location worldbuilding data from demo template', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Location Test',
      'location-test',
      'Testing location import',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/location-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Locations folder and expand it by clicking the chevron
    const locationsFolder = page.getByRole('treeitem', { name: 'Locations' });
    await expect(locationsFolder).toBeVisible();

    // Click the expand button (chevron) inside the folder
    const expandButton = locationsFolder.locator('button').first();
    await expandButton.click();

    // Click on Silverhollow location
    const silverhollowElement = page.getByRole('treeitem', {
      name: 'Silverhollow',
    });
    await expect(silverhollowElement).toBeVisible();
    await silverhollowElement.click();

    // Verify the location data is populated
    const nameField = page.getByLabel('Name');
    await expect(nameField).toBeVisible();

    await expect(nameField).toHaveValue('Silverhollow');

    // Verify population field
    const populationField = page.getByLabel('Population');
    await expect(populationField).toHaveValue('~3,000');
  });

  test('should import multiple characters with unique data', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Multi Char Test',
      'multi-char-test',
      'Testing multiple character import',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/multi-char-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder and expand it by clicking the chevron
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Test each character has unique data
    const characters = [
      { name: 'Elara Nightwhisper', expectedFullName: 'Elara Nightwhisper' },
      { name: 'Theron Blackwood', expectedFullName: 'Theron Blackwood' },
      { name: 'Mira Stonehart', expectedFullName: 'Mira Stonehart' },
    ];

    for (const char of characters) {
      // Click on character
      const charElement = page.getByRole('treeitem', { name: char.name });
      await expect(charElement).toBeVisible();
      await charElement.click();

      // Verify the character data is populated with correct value
      const fullNameField = page.getByLabel('Full Name');
      await expect(fullNameField).toBeVisible();
      await expect(fullNameField).toHaveValue(char.expectedFullName);
    }
  });

  test('should not have cross-project data collision', async ({
    localPage: page,
  }) => {
    // Create first project from demo template
    await createProjectWithTwoSteps(
      page,
      'Project A',
      'project-a',
      'First project',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/project-a/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate directly to create project page for second project
    await page.goto('/create-project');

    // Wait for template selection to be visible
    const templateDemo = page.getByTestId('template-worldbuilding-demo');
    await expect(templateDemo).toBeVisible();

    // Create second project - click the template first
    await templateDemo.click();

    // Click Next to proceed to step 2
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.click();

    // Fill in project details
    const titleInput = page.getByTestId('project-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Project B');
    await page.getByTestId('project-slug-input').fill('project-b');
    await page.getByTestId('project-description-input').fill('Second project');
    await page.getByTestId('create-project-button').click();

    await page.waitForURL(/\/testuser\/project-b/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder in Project B and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Click on Elara in Project B
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // Verify Project B has the correct data (not empty, not from Project A)
    const fullNameField = page.getByLabel('Full Name');
    await expect(fullNameField).toBeVisible();
    await expect(fullNameField).toHaveValue('Elara Nightwhisper');

    // Now go back to Project A and verify its data is still intact
    await page.goto('/');

    // Click on Project A (use first() in case there are multiple cards shown)
    const projectACard = page
      .getByTestId('project-card')
      .filter({ hasText: 'Project A' })
      .first();
    await expect(projectACard).toBeVisible();
    await projectACard.click();

    await page.waitForURL(/\/testuser\/project-a/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder in Project A and expand it
    const charactersFolderA = page.getByRole('treeitem', {
      name: 'Characters',
    });
    await expect(charactersFolderA).toBeVisible();
    const expandButtonA = charactersFolderA.locator('button').first();
    await expandButtonA.click();

    // Click on Elara in Project A
    const elaraElementA = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElementA).toBeVisible();
    await elaraElementA.click();

    // Verify Project A still has its data
    const fullNameFieldA = page.getByLabel('Full Name');
    await expect(fullNameFieldA).toBeVisible();
    await expect(fullNameFieldA).toHaveValue('Elara Nightwhisper');
  });

  test('should import element tags and description from demo template', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Tags Test Project',
      'tags-test',
      'Testing tags and description import',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/tags-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Find Characters folder and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Click on Elara Nightwhisper character (the protagonist)
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // Verify the description field in identity panel is populated
    const descriptionField = page.locator(
      'app-identity-panel textarea[placeholder*="description"]'
    );
    await expect(descriptionField).toBeVisible();
    await expect(descriptionField).toHaveValue(/brilliant half-elf scholar/);

    // Verify tags are displayed in the identity panel
    const tagGrid = page.locator('app-identity-panel [role="grid"]');
    await expect(tagGrid).toBeVisible();

    // Check that the "Protagonist" tag is visible in a gridcell
    const protagonistTag = tagGrid.locator('[role="gridcell"]').filter({
      hasText: 'Protagonist',
    });
    await expect(protagonistTag).toBeVisible();

    // Also verify the "Complete" tag is present
    const completeTag = tagGrid.locator('[role="gridcell"]').filter({
      hasText: 'Complete',
    });
    await expect(completeTag).toBeVisible();
  });

  test('should show document-to-character backlink after @ reference', async ({
    localPage: page,
  }) => {
    // Create project using worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Backlinks Test Project',
      'backlinks-test',
      'Testing document to character backlinks',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/backlinks-test/);

    // Wait for project tree to be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Navigate directly to Elara to check that template backlinks exist
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    const charactersExpandButton = charactersFolder.locator('button').first();
    await charactersExpandButton.click();

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // Expand the meta panel to see relationships (panel starts collapsed)
    const expandPanelButton = page.getByTestId('expand-panel-button');
    await expect(expandPanelButton).toBeVisible();
    await expandPanelButton.click();

    const metaPanel = page.locator('app-meta-panel');
    await expect(metaPanel).toBeVisible();

    // Look for the References panel (backlinks from documents)
    const referencesPanelHeader = metaPanel.getByText('References');
    await expect(referencesPanelHeader).toBeVisible();

    // Verify README appears in the relationships (template backlink)
    const readmeReference = metaPanel.getByText('README');
    await expect(readmeReference).toBeVisible();

    // Verify The Moonveil Accord also appears (template backlink)
    const moonveilReference = metaPanel.getByText('The Moonveil Accord');
    await expect(moonveilReference).toBeVisible();
  });
});
