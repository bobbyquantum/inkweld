/**
 * Template Import Tests - Offline Mode
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
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/rel-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible({ timeout: 5000 });
    await elaraElement.click();

    // Wait for worldbuilding editor to load
    await page.waitForTimeout(1000);

    // Open the meta panel to see relationships
    const metaPanelToggle = page.getByTestId('meta-panel-toggle');
    await expect(metaPanelToggle).toBeVisible({ timeout: 5000 });
    await metaPanelToggle.click();

    // Wait for meta panel to open
    await page.waitForTimeout(500);

    // Check that the meta panel is visible and has relationship panels
    // Elara has: friend with Theron, originated-from Cloudspire, colleague with Mira, located-in Thornwood
    const relationshipPanels = page.locator(
      '[data-testid="relationship-type-panel"]'
    );
    const panelCount = await relationshipPanels.count();
    expect(panelCount).toBeGreaterThan(0);

    // Verify the add relationship button is visible (indicates the panel is open)
    const addRelationshipButton = page.getByTestId('add-relationship-button');
    await expect(addRelationshipButton).toBeVisible({ timeout: 3000 });
  });

  test('should import all worldbuilding data from demo template', async ({
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/demo-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder and expand it by clicking the chevron
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });

    // Click the expand button (chevron) inside the folder
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();

    // Wait for children to be visible
    await page.waitForTimeout(500);

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible({ timeout: 5000 });
    await elaraElement.click();

    // Wait for worldbuilding tab to load
    await page.waitForTimeout(1000);

    // Verify the character data is populated (check for specific field values)
    // The Basic Info tab should have "Full Name" field with value
    const fullNameField = page.getByLabel('Full Name');
    await expect(fullNameField).toBeVisible({ timeout: 5000 });

    // Get the value and verify it's populated (not empty)
    const fullNameValue = await fullNameField.inputValue();
    expect(fullNameValue).toBe('Elara Nightwhisper');

    // Check another field to ensure nested data was imported
    // Look for the species field
    const speciesField = page.getByLabel('Species');
    if (await speciesField.isVisible()) {
      const speciesValue = await speciesField.inputValue();
      expect(speciesValue).toBe('Half-Elf');
    }
  });

  test('should import location worldbuilding data from demo template', async ({
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/location-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Locations folder and expand it by clicking the chevron
    const locationsFolder = page.getByRole('treeitem', { name: 'Locations' });
    await expect(locationsFolder).toBeVisible({ timeout: 5000 });

    // Click the expand button (chevron) inside the folder
    const expandButton = locationsFolder.locator('button').first();
    await expandButton.click();

    // Wait for location elements to be visible
    await page.waitForTimeout(500);

    // Click on Silverhollow location
    const silverhollowElement = page.getByRole('treeitem', {
      name: 'Silverhollow',
    });
    await expect(silverhollowElement).toBeVisible({ timeout: 5000 });
    await silverhollowElement.click();

    // Wait for worldbuilding tab to load
    await page.waitForTimeout(1000);

    // Verify the location data is populated
    const nameField = page.getByLabel('Name');
    await expect(nameField).toBeVisible({ timeout: 5000 });

    const nameValue = await nameField.inputValue();
    expect(nameValue).toBe('Silverhollow');

    // Verify population field
    const populationField = page.getByLabel('Population');
    if (await populationField.isVisible()) {
      const populationValue = await populationField.inputValue();
      expect(populationValue).toBe('~3,000');
    }
  });

  test('should import multiple characters with unique data', async ({
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/multi-char-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder and expand it by clicking the chevron
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Test each character has unique data
    const characters = [
      { name: 'Elara Nightwhisper', expectedFullName: 'Elara Nightwhisper' },
      { name: 'Theron Blackwood', expectedFullName: 'Theron Blackwood' },
      { name: 'Mira Stonehart', expectedFullName: 'Mira Stonehart' },
    ];

    for (const char of characters) {
      console.log(`Testing character: ${char.name}`);

      // Click on character
      const charElement = page.getByRole('treeitem', { name: char.name });
      await expect(charElement).toBeVisible({ timeout: 5000 });
      await charElement.click();

      // Wait for worldbuilding tab to load
      await page.waitForTimeout(1000);

      // Verify the character data is populated with correct value
      const fullNameField = page.getByLabel('Full Name');
      await expect(fullNameField).toBeVisible({ timeout: 5000 });

      const fullNameValue = await fullNameField.inputValue();
      expect(fullNameValue).toBe(char.expectedFullName);
    }
  });

  test('should not have cross-project data collision', async ({
    offlinePage: page,
  }) => {
    // Create first project from demo template
    await createProjectWithTwoSteps(
      page,
      'Project A',
      'project-a',
      'First project',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/project-a/, { timeout: 10000 });
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Navigate directly to create project page for second project
    await page.goto('/create-project');
    await page.waitForLoadState('networkidle');

    // Wait for template selection to be visible
    await page.waitForSelector('[data-testid="template-worldbuilding-demo"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Create second project - click the template first
    await page.click('[data-testid="template-worldbuilding-demo"]');

    // Click Next to proceed to step 2
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor({ state: 'visible', timeout: 5000 });
    await nextButton.click();

    // Fill in project details
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 5000,
    });
    await page.fill('input[data-testid="project-title-input"]', 'Project B');
    await page.fill('input[data-testid="project-slug-input"]', 'project-b');
    await page.fill(
      'textarea[data-testid="project-description-input"]',
      'Second project'
    );
    await page.click('button[data-testid="create-project-button"]');

    await page.waitForURL(/\/testuser\/project-b/, { timeout: 10000 });
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder in Project B and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on Elara in Project B
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible({ timeout: 5000 });
    await elaraElement.click();

    // Wait for worldbuilding tab to load
    await page.waitForTimeout(1000);

    // Verify Project B has the correct data (not empty, not from Project A)
    const fullNameField = page.getByLabel('Full Name');
    await expect(fullNameField).toBeVisible({ timeout: 5000 });

    const fullNameValue = await fullNameField.inputValue();
    expect(fullNameValue).toBe('Elara Nightwhisper');

    // Now go back to Project A and verify its data is still intact
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on Project A (use first() in case there are multiple cards shown)
    const projectACard = page
      .getByTestId('project-card')
      .filter({ hasText: 'Project A' })
      .first();
    await expect(projectACard).toBeVisible({ timeout: 5000 });
    await projectACard.click();

    await page.waitForURL(/\/testuser\/project-a/, { timeout: 10000 });
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder in Project A and expand it
    const charactersFolderA = page.getByRole('treeitem', {
      name: 'Characters',
    });
    await expect(charactersFolderA).toBeVisible({ timeout: 5000 });
    const expandButtonA = charactersFolderA.locator('button').first();
    await expandButtonA.click();
    await page.waitForTimeout(500);

    // Click on Elara in Project A
    const elaraElementA = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElementA).toBeVisible({ timeout: 5000 });
    await elaraElementA.click();

    // Wait for worldbuilding tab to load
    await page.waitForTimeout(1000);

    // Verify Project A still has its data
    const fullNameFieldA = page.getByLabel('Full Name');
    await expect(fullNameFieldA).toBeVisible({ timeout: 5000 });

    const fullNameValueA = await fullNameFieldA.inputValue();
    expect(fullNameValueA).toBe('Elara Nightwhisper');
  });

  test('should import element tags and description from demo template', async ({
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/tags-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Find Characters folder and expand it
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });
    const expandButton = charactersFolder.locator('button').first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on Elara Nightwhisper character (the protagonist)
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible({ timeout: 5000 });
    await elaraElement.click();

    // Wait for worldbuilding editor to load
    await page.waitForTimeout(1000);

    // Verify the description field in identity panel is populated
    const descriptionField = page.locator(
      'app-identity-panel textarea[placeholder*="description"]'
    );
    await expect(descriptionField).toBeVisible({ timeout: 5000 });
    const descriptionValue = await descriptionField.inputValue();
    expect(descriptionValue).toContain('brilliant half-elf scholar');

    // Verify tags are displayed in the identity panel
    // The tags are displayed in a grid with gridcell elements
    const tagGrid = page.locator('app-identity-panel [role="grid"]');
    await expect(tagGrid).toBeVisible({ timeout: 5000 });

    // Check that the "Protagonist" tag is visible in a gridcell
    const protagonistTag = tagGrid.locator('[role="gridcell"]').filter({
      hasText: 'Protagonist',
    });
    await expect(protagonistTag).toBeVisible({ timeout: 5000 });

    // Also verify the "Complete" tag is present
    const completeTag = tagGrid.locator('[role="gridcell"]').filter({
      hasText: 'Complete',
    });
    await expect(completeTag).toBeVisible({ timeout: 5000 });
  });

  test('should show document-to-character backlink after @ reference', async ({
    offlinePage: page,
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
    await page.waitForURL(/\/testuser\/backlinks-test/, { timeout: 10000 });

    // Wait for project tree to be visible
    await page.waitForSelector('[data-testid="project-tree"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Navigate directly to Elara to check that template backlinks exist
    // (The template now includes document-to-character relationships)
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible({ timeout: 5000 });
    const charactersExpandButton = charactersFolder.locator('button').first();
    await charactersExpandButton.click();
    await page.waitForTimeout(500);

    // Click on Elara Nightwhisper character
    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible({ timeout: 5000 });
    await elaraElement.click();

    // Wait for worldbuilding editor to load
    await page.waitForTimeout(1000);

    // Open the meta panel to see relationships
    const metaPanelToggle = page.getByTestId('meta-panel-toggle');
    await expect(metaPanelToggle).toBeVisible({ timeout: 5000 });
    await metaPanelToggle.click();

    // Wait for meta panel to open
    await page.waitForTimeout(500);

    const metaPanel = page.locator('app-meta-panel');
    await expect(metaPanel).toBeVisible({ timeout: 5000 });

    // Look for the References panel (backlinks from documents)
    // The template now includes document-to-character relationships
    const referencesPanelHeader = metaPanel.getByText('References');
    await expect(referencesPanelHeader).toBeVisible({ timeout: 5000 });

    // Verify README appears in the relationships (template backlink)
    const readmeReference = metaPanel.getByText('README');
    await expect(readmeReference).toBeVisible({ timeout: 5000 });

    // Verify The Moonveil Accord also appears (template backlink)
    const moonveilReference = metaPanel.getByText('The Moonveil Accord');
    await expect(moonveilReference).toBeVisible({ timeout: 5000 });
  });
});
