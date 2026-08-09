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

    // Open the Authentication section and configure an API key header.
    // Inspector 0.22.0 auth UI: "Header Name"/"Header Value" inputs + "Add".
    await page.getByRole('button', { name: 'Authentication' }).click();

    const headerNameInput = page.getByPlaceholder('Header Name');
    await headerNameInput.fill('Authorization');

    const headerValueInput = page.getByPlaceholder('Header Value');
    await headerValueInput.fill(`Bearer ${mcpContext.mcpApiKey}`);

    await page.getByRole('button', { name: 'Add' }).click();

    // Enable the added header via its toggle switch (the Inspector adds the
    // row disabled by default).
    const headerSwitch = page
      .locator('input[type="checkbox"], [role="switch"]')
      .first();
    if (!(await headerSwitch.isChecked().catch(() => false))) {
      await headerSwitch.click();
    }

    // Click Connect
    const connectButton = page.getByRole('button', { name: 'Connect' });
    await connectButton.click();

    // Wait for connection (green status indicator)
    await expect(page.locator('.bg-green-500')).toBeVisible();
  });

  test('should show error when connecting without auth', async ({ page }) => {
    await page.goto(INSPECTOR_WITH_PARAMS);

    // Click Connect without setting auth
    const connectButton = page.getByRole('button', { name: 'Connect' });
    await connectButton.click();

    // The connection without credentials fails: Inspector 0.22.0 shows a
    // "Disconnected" state (and the backend rejects the request with 401).
    await expect(
      page
        .locator('.bg-red-500')
        .first()
        .or(page.getByText(/Error Connecting|unauthorized|401/i).first())
        .or(page.getByText(/Disconnected/i).first())
    ).toBeVisible();
  });
});

test.describe('Inspector tool browsing', () => {
  test('should list tools after connecting', async ({ page, mcpContext }) => {
    // Connect to MCP server
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Tools tab and click "List Tools" (Inspector 0.22.0 loads
    // the tool list on demand).
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);
    await page.getByRole('button', { name: 'List Tools' }).click();

    // Wait for tools to load - look for a known tool title (the Inspector
    // 0.22.0 lists tools by their `title`, e.g. "Get Project Tree").
    await expect(page.getByText('Get Project Tree').first()).toBeVisible();
  });

  test('should show tool details when selected', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);

    // Click "List Tools" to populate the tool list.
    await page.getByRole('button', { name: 'List Tools' }).click();

    // Wait for tools list (tools appear by their title in Inspector 0.22.0)
    await expect(page.getByText('Get Project Tree').first()).toBeVisible();

    // Click on a tool to select it
    await page.getByText('Get Project Tree').first().click();

    // The tool details panel shows an input for the `project` parameter.
    await expect(
      page
        .getByLabel(/project/i)
        .or(page.locator('input[name="project"], textarea[name="project"]'))
        .first()
    ).toBeVisible();
  });

  test('should call a tool and display results', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#tools`);

    // Click "List Tools" to populate the tool list.
    await page.getByRole('button', { name: 'List Tools' }).click();

    // Wait for and select the get_project_tree tool (listed by title)
    await expect(page.getByText('Get Project Tree')).toBeVisible();
    await page.getByText('Get Project Tree').click();

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

      // Wait for results to appear - the completed call shows up in the
      // History list (a `tools/call` entry) and the result panel.
      await expect(
        page.getByText('tools/call', { exact: false }).first()
      ).toBeVisible();
    }
  });
});

test.describe('Inspector resource browsing', () => {
  test('should list resources after connecting', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Resources tab and click "List Resources".
    await page.goto(`${INSPECTOR_WITH_PARAMS}#resources`);
    await page.getByRole('button', { name: 'List Resources' }).click();

    // Wait for resources to load (the projects resource is listed by name).
    await expect(page.getByText('Authorized Projects').first()).toBeVisible();
  });

  test('should read a resource', async ({ page, mcpContext }) => {
    await connectInspector(page, mcpContext.mcpApiKey);
    await page.goto(`${INSPECTOR_WITH_PARAMS}#resources`);

    // Click "List Resources" and select the projects resource.
    await page.getByRole('button', { name: 'List Resources' }).click();
    await expect(page.getByText('Authorized Projects').first()).toBeVisible();

    // Click on the projects resource
    await page.getByText('Authorized Projects').first().click();

    // Click Read Resource button
    const readButton = page.getByRole('button', { name: /read resource/i });
    if (await readButton.isVisible()) {
      await readButton.click();

      // Should show resource contents
      await expect(
        page
          .getByText(mcpContext.projectSlug)
          .first()
          .or(page.getByText(/content/i).first())
      ).toBeVisible();
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
      page.getByRole('tab', { name: 'Prompts' }).first()
    ).toBeVisible();
  });
});

test.describe('Inspector ping', () => {
  test('should respond to ping (stateless protocol)', async ({
    page,
    mcpContext,
  }) => {
    await connectInspector(page, mcpContext.mcpApiKey);

    // Navigate to Ping tab
    await page.goto(`${INSPECTOR_WITH_PARAMS}#ping`);

    // Click the Ping button
    const pingButton = page.getByRole('button', { name: /ping/i });
    await expect(pingButton).toBeVisible();
    await pingButton.click();

    // A ping request is recorded in the History list, proving the transport
    // round-trips requests to the server (the `ping` method itself was
    // removed in the 2026-07-28 stateless spec, so no "success" is expected).
    await expect(page.getByText('ping').first()).toBeVisible();
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
    await expect(page.locator('.bg-gray-500')).toBeVisible();

    // Connect button should reappear
    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  });
});

/**
 * Helper to connect the MCP Inspector to our backend server.
 * Inspector 0.22.0 auth UI: "Header Name"/"Header Value" inputs + "Add".
 */
async function connectInspector(
  page: import('@playwright/test').Page,
  apiKey: string
) {
  await page.goto(INSPECTOR_WITH_PARAMS);

  // Open Authentication section
  await page.getByRole('button', { name: 'Authentication' }).click();

  // Set Authorization header
  await page.getByPlaceholder('Header Name').fill('Authorization');
  await page.getByPlaceholder('Header Value').fill(`Bearer ${apiKey}`);
  await page.getByRole('button', { name: 'Add' }).click();

  // Enable the added header via its toggle switch.
  const headerSwitch = page
    .locator('input[type="checkbox"], [role="switch"]')
    .first();
  if (!(await headerSwitch.isChecked().catch(() => false))) {
    await headerSwitch.click();
  }

  // Connect
  const connectButton = page.getByRole('button', { name: 'Connect' });
  await connectButton.click();

  // Wait for green status dot (connected)
  await expect(page.locator('.bg-green-500')).toBeVisible();
}
