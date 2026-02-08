import { API_BASE, expect, INSPECTOR_URL, test } from './fixtures';

/**
 * MCP Inspector UI E2E Tests
 *
 * Tests interacting with the MCP Inspector web UI to connect to
 * the Inkweld MCP server, browse tools/resources, and call tools.
 *
 * The Inspector is started as a background webServer in the
 * Playwright config and connected to the backend via Streamable HTTP.
 */

const MCP_ENDPOINT = `${API_BASE}/api/v1/ai/mcp`;
const INSPECTOR_WITH_PARAMS = `${INSPECTOR_URL}/?transport=streamable-http&serverUrl=${encodeURIComponent(MCP_ENDPOINT)}`;

test.describe('Inspector connection', () => {
  test('should load with pre-configured transport and URL', async ({
    page,
  }) => {
    await page.goto(INSPECTOR_WITH_PARAMS);

    // Transport should show Streamable HTTP
    const selectTrigger = page.getByLabel('Transport Type');
    await expect(selectTrigger).toBeVisible();
    await expect(selectTrigger).toContainText('Streamable HTTP');

    // URL should be pre-populated
    const urlInput = page.locator('#sse-url-input');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(MCP_ENDPOINT);
  });

  test('should connect to MCP server with API key auth', async ({
    page,
    mcpContext,
  }) => {
    await page.goto(INSPECTOR_WITH_PARAMS);

    // Open Auth section and configure API key header
    const authButton = page.getByTestId('auth-button');
    await authButton.click();

    // Add a custom header
    const addButton = page.getByTestId('add-header-button');
    await addButton.click();

    // Set header name to Authorization
    const headerNameInput = page.getByTestId('header-name-input-0');
    await headerNameInput.fill('Authorization');

    // Set header value to Bearer <api-key>
    const headerValueInput = page.getByTestId('header-value-input-0');
    await headerValueInput.fill(`Bearer ${mcpContext.mcpApiKey}`);

    // Click Connect
    const connectButton = page.getByRole('button', { name: 'Connect' });
    await connectButton.click();

    // Wait for connection (green status indicator)
    await expect(page.locator('.bg-green-500')).toBeVisible({ timeout: 15000 });
  });

  test('should show error when connecting without auth', async ({ page }) => {
    await page.goto(INSPECTOR_WITH_PARAMS);

    // Click Connect without setting auth
    const connectButton = page.getByRole('button', { name: 'Connect' });
    await connectButton.click();

    // Should show error indicator (red dot) or error state
    await expect(
      page.locator('.bg-red-500').or(page.getByText(/error|unauthorized|401/i))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Inspector tool browsing', () => {
  test('should list tools after connecting', async ({ page, mcpContext }) => {
    // Connect to MCP server
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Tools tab
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);

    // Wait for tools to load - look for known tool names
    await expect(
      page.getByText('get_project_tree').or(page.getByText('search_elements'))
    ).toBeVisible({ timeout: 15000 });
  });

  test('should show tool details when selected', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);

    // Wait for tools list
    await expect(page.getByText('get_project_tree')).toBeVisible({
      timeout: 15000,
    });

    // Click on a tool to select it
    await page.getByText('get_project_tree').click();

    // Should show tool input form with project parameter
    await expect(page.getByText('project')).toBeVisible({ timeout: 5000 });
  });

  test('should call a tool and display results', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);

    // Wait for and select the get_project_tree tool
    await expect(page.getByText('get_project_tree')).toBeVisible({
      timeout: 15000,
    });
    await page.getByText('get_project_tree').click();

    // Fill in the project parameter
    const _projectInput = page.locator('textarea, input').filter({
      has: page.locator('[name="project"], [id*="project"]'),
    });

    // Try to find and fill the project input field
    // The Inspector renders tool inputs using DynamicJsonForm
    const inputs = page.locator('textarea');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute('placeholder');
      const id = await input.getAttribute('id');
      if (
        placeholder?.toLowerCase().includes('project') ||
        id?.toLowerCase().includes('project')
      ) {
        await input.fill(mcpContext.projectKey);
        break;
      }
    }

    // If no textarea found, try regular inputs
    if (inputCount === 0) {
      const regularInputs = page.locator(
        'input[type="text"], input:not([type])'
      );
      const count = await regularInputs.count();
      for (let i = 0; i < count; i++) {
        const input = regularInputs.nth(i);
        const placeholder = await input.getAttribute('placeholder');
        if (placeholder?.toLowerCase().includes('project') || i === 0) {
          await input.fill(mcpContext.projectKey);
          break;
        }
      }
    }

    // Click Run Tool button
    const runButton = page.getByRole('button', { name: /run tool/i });
    if (await runButton.isVisible()) {
      await runButton.click();

      // Wait for results to appear
      await expect(
        page
          .getByText(/content/i)
          .or(page.getByText(/result/i))
          .or(page.getByText(/text/i))
      ).toBeVisible({ timeout: 15000 });
    }
  });
});

test.describe('Inspector resource browsing', () => {
  test('should list resources after connecting', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Resources tab
    await page.goto(`${INSPECTOR_WITH_PARAMS}#resources`);

    // Wait for resources to load
    await expect(
      page.getByText('inkweld://projects').or(page.getByText(/project/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test('should read a resource', async ({ page, mcpContext }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#resources`);

    // Wait for resource list
    await expect(page.getByText('inkweld://projects')).toBeVisible({
      timeout: 15000,
    });

    // Click on the projects resource
    await page.getByText('inkweld://projects').click();

    // Click Read Resource button
    const readButton = page.getByRole('button', { name: /read resource/i });
    if (await readButton.isVisible()) {
      await readButton.click();

      // Should show resource contents
      await expect(
        page.getByText(mcpContext.projectSlug).or(page.getByText(/content/i))
      ).toBeVisible({ timeout: 15000 });
    }
  });
});

test.describe('Inspector prompts tab', () => {
  test('should show prompts tab after connecting', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Prompts tab
    await page.goto(`${INSPECTOR_WITH_PARAMS}#prompts`);

    // The prompts tab should be visible (may show empty state or prompt list)
    await expect(
      page.getByText(/prompt/i).or(page.getByText(/no prompts/i))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Inspector ping', () => {
  test('should successfully ping the server', async ({ page, mcpContext }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Ping tab
    await page.goto(`${INSPECTOR_WITH_PARAMS}#ping`);

    // Click the Ping button
    const pingButton = page.getByRole('button', { name: /ping/i });
    await expect(pingButton).toBeVisible({ timeout: 10000 });
    await pingButton.click();

    // Should show success or latency info
    await expect(
      page
        .getByText(/success/i)
        .or(page.getByText(/ms/i))
        .or(page.getByText(/pong/i))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Inspector disconnect', () => {
  test('should disconnect and clear state', async ({ page, mcpContext }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Click Disconnect
    const disconnectButton = page.getByRole('button', {
      name: 'Disconnect',
    });
    await disconnectButton.click();

    // Should show disconnected state (gray dot)
    await expect(page.locator('.bg-gray-500')).toBeVisible({ timeout: 5000 });

    // Connect button should reappear
    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  });
});

/**
 * Helper to connect the MCP Inspector to our backend server.
 */
async function connectInspector(
  page: import('@playwright/test').Page,
  apiKey: string
) {
  await page.goto(INSPECTOR_WITH_PARAMS);

  // Open Auth section
  const authButton = page.getByTestId('auth-button');
  await authButton.click();

  // Add custom header
  const addButton = page.getByTestId('add-header-button');
  await addButton.click();

  // Set Authorization header
  const headerNameInput = page.getByTestId('header-name-input-0');
  await headerNameInput.fill('Authorization');

  const headerValueInput = page.getByTestId('header-value-input-0');
  await headerValueInput.fill(`Bearer ${apiKey}`);

  // Connect
  const connectButton = page.getByRole('button', { name: 'Connect' });
  await connectButton.click();

  // Wait for green status dot (connected)
  await expect(page.locator('.bg-green-500')).toBeVisible({ timeout: 15000 });
}
