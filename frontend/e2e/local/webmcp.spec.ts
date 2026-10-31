/**
 * WebMCP - Local Mode
 *
 * Browsers that support WebMCP expose `document.modelContext` so a page can
 * register tools for the browser's AI agent. Chromium in CI has no such API,
 * so this spec installs a stand-in with the spec's shape (registerTool with
 * an AbortSignal that unregisters) and calls the tools the way an agent
 * would, checking the effect in the real UI.
 */
import { type Page } from '@playwright/test';

import { expect, openUserSettings, test } from './fixtures';

interface FakeTool {
  name: string;
  execute(input: unknown, options: { signal: AbortSignal }): Promise<unknown>;
}

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: any;
  isError?: boolean;
}

/** Install a recording `document.modelContext` before the app boots. */
async function installModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools = new Map<string, FakeTool>();
    const w = window as any;
    w.__webmcpTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: FakeTool, options?: { signal?: AbortSignal }) {
          if (tools.has(tool.name)) {
            return Promise.reject(new Error(`Duplicate tool ${tool.name}`));
          }
          tools.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () =>
            tools.delete(tool.name)
          );
          return Promise.resolve();
        },
      },
    });
  });
}

function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as any).__webmcpTools.keys()]);
}

/** Call a registered tool like an agent and return its result. */
async function callTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {}
): Promise<ToolResult> {
  return page.evaluate(
    ([toolName, toolInput]) => {
      const tool = (window as any).__webmcpTools.get(toolName) as
        FakeTool | undefined;
      if (!tool) throw new Error(`Tool ${String(toolName)} is not registered`);
      return tool.execute(toolInput, {
        signal: new AbortController().signal,
      });
    },
    [name, input] as const
  ) as Promise<ToolResult>;
}

/** Call a tool that must succeed and return its structured data. */
async function callOk(
  page: Page,
  name: string,
  input: Record<string, unknown> = {}
): Promise<any> {
  const result = await callTool(page, name, input);
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return result.structuredContent;
}

/** A segment of the No AI / Allow AI toggle. */
function aiChoice(page: Page, choice: 'none' | 'allow') {
  return page.getByTestId(`ai-preference-${choice}`);
}

/** Choose No AI or Allow AI in Settings → General. */
async function setAi(page: Page, allow: boolean): Promise<void> {
  await openUserSettings(page);
  await page.getByRole('tab', { name: /general settings/i }).click();
  const choice = aiChoice(page, allow ? 'allow' : 'none');
  await choice.click();
  await expect(choice.getByRole('radio')).toBeChecked();
  await page.getByTestId('settings-close-button').click();
}

test.describe('WebMCP', () => {
  test('a browser agent creates and writes a project through the tools', async ({
    localPage: page,
  }) => {
    await installModelContext(page);
    await page.reload();
    await page.getByTestId('create-new-project-button').waitFor();

    await test.step('nothing is registered until the user allows AI', async () => {
      expect(await toolNames(page)).toEqual([]);
      await setAi(page, true);
      await expect.poll(() => toolNames(page)).toContain('get_app_state');
      expect(await toolNames(page)).not.toContain('get_project_tree');
    });

    await test.step('create_project opens a new project and adds the project tools', async () => {
      const opened = await callOk(page, 'create_project', {
        title: 'Agent Saga',
      });
      expect(opened.opened).toBe('testuser/agent-saga');
      await page.waitForURL(/testuser\/agent-saga/);
      await expect.poll(() => toolNames(page)).toContain('get_project_tree');
      expect(await toolNames(page)).toContain('update_document_content');
    });

    await test.step('create_element adds a written chapter to the tree', async () => {
      const chapter = await callOk(page, 'create_element', {
        type: 'ITEM',
        name: 'Chapter One',
        documentKind: 'scene',
        content: 'The ship left at **dawn**.',
        open: true,
      });
      expect(chapter.role).toBe('scene');
      await expect(page.getByTestId('element-Chapter One')).toBeVisible();
      await expect(page.locator('ngx-editor .ProseMirror')).toContainText(
        'The ship left at dawn.'
      );

      const read = await callOk(page, 'get_document_content', {
        elementId: chapter.id,
      });
      expect(read.content).toContain('**dawn**');
      expect(read.wordCount).toBe(5);

      await test.step('edits show up in the open editor', async () => {
        await callOk(page, 'update_document_content', {
          elementId: chapter.id,
          content: 'Nobody waved.',
          mode: 'append',
        });
        await expect(page.locator('ngx-editor .ProseMirror')).toContainText(
          'Nobody waved.'
        );
      });
    });

    await test.step('worldbuilding entries are created from a template', async () => {
      const { schemas } = await callOk(page, 'list_schemas');
      expect(schemas.length).toBeGreaterThan(0);
      const entry = await callOk(page, 'create_element', {
        type: 'WORLDBUILDING',
        name: 'Captain Mara',
        schemaId: schemas[0].id,
      });
      await callOk(page, 'update_worldbuilding', {
        elementId: entry.id,
        description: 'Commands the Wren.',
      });
      const read = await callOk(page, 'get_worldbuilding', {
        elementId: entry.id,
      });
      expect(read.description).toBe('Commands the Wren.');
      await expect(page.getByTestId('element-Captain Mara')).toBeVisible();
    });

    await test.step('a canvas open in a tab shows what the agent draws', async () => {
      const canvas = await callOk(page, 'create_element', {
        type: 'CANVAS',
        name: 'Agent Map',
        open: true,
      });
      await expect(page.getByTestId('canvas-container')).toBeVisible();
      const objects = page
        .getByTestId('canvas-sidebar')
        .getByTestId('object-item');
      await expect(objects).toHaveCount(0);

      const edit = await callOk(page, 'edit_canvas', {
        elementId: canvas.id,
        add: [
          {
            id: 'coast',
            name: 'Coast',
            type: 'shape',
            shapeType: 'rect',
            width: 200,
            height: 100,
          },
        ],
      });
      expect(edit.created).toEqual(['coast']);
      await expect(objects.filter({ hasText: 'Coast' })).toBeVisible();

      const read = await callOk(page, 'get_canvas', { elementId: canvas.id });
      expect(read.objectCount).toBe(1);

      const rendered = await callTool(page, 'render_canvas', {
        elementId: canvas.id,
        maxSize: 300,
      });
      expect(rendered.isError, rendered.content[0]?.text).toBeFalsy();
      expect(rendered.structuredContent.image.width).toBe(300);
      const image = rendered.content[1] as unknown as {
        type: string;
        data: string;
        mimeType: string;
      };
      expect(image.type).toBe('image');
      expect(image.mimeType).toBe('image/png');
      expect(image.data.length).toBeGreaterThan(100);

      await callOk(page, 'edit_canvas', {
        elementId: canvas.id,
        ...(edit.undo as Record<string, unknown>),
      });
      await expect(objects).toHaveCount(0);
    });

    await test.step('the tree and errors read the way an agent needs', async () => {
      const tree = await callOk(page, 'get_project_tree');
      expect(tree.elements.map((e: { name: string }) => e.name)).toEqual(
        expect.arrayContaining(['Chapter One', 'Captain Mara'])
      );
      const missing = await callTool(page, 'get_element', {
        elementId: 'nope',
      });
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toContain('No element with id "nope"');
    });

    await test.step('choosing No AI removes every tool', async () => {
      await setAi(page, false);
      await expect.poll(() => toolNames(page)).toEqual([]);
    });
  });

  test('new users can allow AI from the setup page', async ({ page }) => {
    // No profile yet: the app opens on first-run setup.
    await page.route('**/api/**', route => route.abort('failed'));
    // Like the shared fixtures: keep the welcome tour out of the way.
    await page.addInitScript(() => {
      localStorage.setItem('inkweld-tutorial-autostart', 'off');
    });
    await installModelContext(page);
    await page.goto('/setup');
    await page.getByTestId('setup-card').waitFor();

    await expect(aiChoice(page, 'none').getByRole('radio')).toBeChecked();
    expect(await toolNames(page)).toEqual([]);

    await aiChoice(page, 'allow').click();
    await expect(aiChoice(page, 'allow').getByRole('radio')).toBeChecked();
    await expect.poll(() => toolNames(page)).toContain('get_app_state');

    await test.step('the help button explains the choice', async () => {
      await page.getByTestId('ai-preference-help').click();
      const dialog = page.getByTestId('ai-preference-info-dialog');
      await expect(dialog).toContainText('This browser offers WebMCP');
      await page.getByTestId('ai-preference-info-close').click();
      await expect(dialog).toBeHidden();
    });

    await test.step('the choice outlives setup and reloads', async () => {
      await page.getByTestId('local-mode-button').click();
      await page.getByTestId('local-username-input').fill('newwriter');
      await page.getByTestId('local-displayname-input').fill('New Writer');
      await page.getByTestId('start-local-button').click();
      await page.getByTestId('create-new-project-button').waitFor();

      await page.reload();
      await page.getByTestId('create-new-project-button').waitFor();
      await expect.poll(() => toolNames(page)).toContain('get_app_state');

      await openUserSettings(page);
      await page.getByRole('tab', { name: /general settings/i }).click();
      await expect(aiChoice(page, 'allow').getByRole('radio')).toBeChecked();
    });
  });
});
