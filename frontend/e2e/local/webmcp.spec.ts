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

async function setWebMcp(page: Page, on: boolean): Promise<void> {
  await openUserSettings(page);
  await page.getByRole('tab', { name: /general settings/i }).click();
  const toggle = page.getByTestId('webmcp-toggle').getByRole('switch');
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: on });
  await page.getByTestId('settings-close-button').click();
}

test.describe('WebMCP', () => {
  test('a browser agent creates and writes a project through the tools', async ({
    localPage: page,
  }) => {
    await installModelContext(page);
    await page.reload();
    await page.getByTestId('create-new-project-button').waitFor();

    await test.step('nothing is registered until the user opts in', async () => {
      expect(await toolNames(page)).toEqual([]);
      await setWebMcp(page, true);
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

    await test.step('turning the preference off removes every tool', async () => {
      await setWebMcp(page, false);
      await expect.poll(() => toolNames(page)).toEqual([]);
    });
  });
});
