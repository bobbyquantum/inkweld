import { openProjectFromGrid } from '../common/test-helpers';
import { mcpCallTool, performOAuthFlow } from '../mcp/fixtures';
import { expect, getApiBaseUrl, test } from './fixtures';

/** A real 1×1 PNG, so the browser can decode what the agent uploads. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

interface ToolResult {
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  content?: { text: string }[];
}

/**
 * An agent working on a canvas over MCP while the user has it open: the server
 * tools and the browser have to agree on the Yjs layout, an open tab has to
 * show the edits as they arrive, and an image the browser has never seen has
 * to load.
 */
test('an agent draws on a canvas the user has open', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.slow();
  const apiBase = getApiBaseUrl();
  const { username } = page.testCredentials;
  const slug = `agent-canvas-${Date.now()}`;

  const authToken = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  expect(authToken).toBeTruthy();

  const created = await page.request.post(`${apiBase}/api/v1/projects`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { title: 'Agent Canvas', slug },
  });
  expect(created.ok()).toBeTruthy();

  const { accessToken } = await performOAuthFlow(
    page.request,
    authToken as string,
    slug,
    'editor'
  );

  async function tool(name: string, args: Record<string, unknown>) {
    const response = await mcpCallTool(page.request, accessToken, name, {
      project: `${username}/${slug}`,
      ...args,
    });
    expect(response.error).toBeUndefined();
    const result = response.result as ToolResult;
    expect(result.isError, result.content?.[0]?.text).toBeUndefined();
    return result.structuredContent as Record<string, unknown>;
  }

  const { element } = (await tool('create_element', {
    name: 'Agent Map',
    type: 'CANVAS',
  })) as { element: { id: string } };
  const elementId = element.id;
  const objects = page.getByTestId('canvas-sidebar').getByTestId('object-item');

  await test.step('draws before the canvas has ever been opened', async () => {
    await tool('edit_canvas', {
      elementId,
      background: '#F5EFE0',
      frames: [
        { kind: 'canvas', name: 'Page', x: 0, y: 0, width: 800, height: 600 },
      ],
      add: [
        {
          id: 'panel',
          name: 'Panel',
          type: 'shape',
          shapeType: 'rect',
          x: 40,
          y: 40,
          width: 720,
          height: 520,
          fill: '#FFFFFF',
          stroke: '#8A6D3B',
          strokeWidth: 4,
          cornerRadius: 16,
        },
        {
          id: 'title',
          type: 'text',
          text: 'Northreach',
          x: 80,
          y: 80,
          fontSize: 64,
          fontFamily: 'Georgia',
          fontStyle: 'bold',
          fill: '#3B2F1E',
        },
        { id: 'town', type: 'pin', label: 'Harbour Town', x: 400, y: 340 },
      ],
    });
  });

  await test.step('the canvas opens with those objects', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    await openProjectFromGrid(page);
    // A server project is first downloaded to this device, and the same
    // button then turns into "Begin".
    const begin = page.getByTestId('cover-open-begin');
    await expect(begin).toContainText('Begin');
    await begin.click();
    await page.getByTestId('element-Agent Map').click();
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(objects).toHaveCount(2);
    // Pins have their own section in the sidebar.
    await expect(page.getByTestId('pin-item')).toContainText('Harbour Town');
  });

  await test.step('an edit shows up in the open tab', async () => {
    await tool('edit_canvas', {
      elementId,
      add: [
        {
          id: 'river',
          name: 'River',
          type: 'path',
          points: [120, 300, 680, 420],
          x: 0,
          y: 0,
          stroke: '#2F6DB5',
          strokeWidth: 8,
        },
      ],
    });
    await expect(objects).toHaveCount(3);
    await expect(objects.filter({ hasText: 'River' })).toBeVisible();
  });

  let undo: Record<string, unknown>;

  await test.step('an image the browser has never seen loads from the server', async () => {
    const upload = await tool('create_media_upload', { format: 'png' });
    const uploaded = await page.request.put(upload['uploadUrl'] as string, {
      data: PIXEL_PNG,
    });
    expect(uploaded.status()).toBe(200);

    const mediaUrl = upload['mediaUrl'] as string;
    const filename = mediaUrl.substring('media://'.length);
    const fetched = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/media/') &&
        response.url().endsWith(filename)
    );
    const result = await tool('edit_canvas', {
      elementId,
      add: [
        {
          id: 'art',
          name: 'Art',
          type: 'image',
          src: mediaUrl,
          x: 560,
          y: 80,
          width: 160,
          height: 160,
        },
      ],
    });
    undo = result['undo'] as Record<string, unknown>;

    expect((await fetched).status()).toBe(200);
    await expect(objects).toHaveCount(4);
  });

  await test.step('what the agent drew survives a reload', async () => {
    await page.reload();
    await page.getByTestId('element-Agent Map').click();
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(objects).toHaveCount(4);
    await testInfo.attach('agent-canvas', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  await test.step('the undo arguments take an edit back', async () => {
    await tool('edit_canvas', { elementId, ...undo });
    await expect(objects).toHaveCount(3);
    await expect(objects.filter({ hasText: 'Art' })).toHaveCount(0);
  });
});
