import { type APIRequestContext } from '@playwright/test';

import { TEST_PASSWORDS } from '../common/test-credentials';
import { expect, test } from './fixtures';

/**
 * MCP Legacy API Key Regression Tests
 *
 * Verifies that legacy `iw_proj_...` MCP API keys can perform BOTH read AND
 * write operations against the MCP HTTP endpoint.
 *
 * REGRESSION CONTEXT
 * ------------------
 * The MCP middleware (`backend/src/mcp/mcp.auth.ts`) authenticates legacy
 * API keys via SHA-256 hash lookup, then sets `ctx.authToken` so downstream
 * tools can talk to the Yjs storage layer.
 *
 * On Cloudflare Workers, all Yjs reads/writes flow through the
 * `YjsProjectDO` Durable Object via an HTTP `Authorization: Bearer ...`
 * header. The DO's `verifyToken()` only accepts JWTs and rejects raw
 * `iw_proj_...` keys with HTTP 401.
 *
 * Previously, `handleLegacyApiKey` set `authToken` to the raw API key,
 * which caused every WRITE to fail under the Workers runtime with:
 *   "Failed to replace elements: 401 Invalid token"
 *
 * READS appeared to work because `YjsWorkerService.getElements()` silently
 * swallows non-OK responses and returns `[]` — masking the auth failure.
 *
 * The fix: `handleLegacyApiKey` now mints a short-lived JWT compatible
 * with `YjsProjectDO.verifyToken()` and stores that as `authToken`.
 *
 * RUNTIME COVERAGE
 * ----------------
 * This spec lives in `e2e/online` so it runs under BOTH:
 *  - `npm run e2e:online` — Bun runtime (yjs-runtime.ts → LevelDB direct,
 *    bypasses DO entirely; verifies happy path)
 *  - `npm run e2e:wrangler` — Cloudflare Workers + Wrangler (yjs-runtime.ts
 *    → DO HTTP API; THIS is where the bug actually manifested)
 *
 * Without the wrangler run, the bug ships unnoticed because Bun never
 * exercises the DO auth path.
 */

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolResult {
  content?: Array<{ type: string; text: string }>;
  structuredContent?: {
    element?: { id?: string };
    success?: boolean;
    wordCount?: number;
  };
  isError?: boolean;
}

async function mcpCallTool(
  request: APIRequestContext,
  apiKey: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const response = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    data: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now(),
    },
  });
  return (await response.json()) as JsonRpcResponse;
}

function extractElementId(result: JsonRpcResponse): string {
  const toolResult = result.result as ToolResult;
  const id = toolResult.structuredContent?.element?.id;
  expect(
    id,
    'create_element should return element.id in structuredContent'
  ).toBeTruthy();
  return id as string;
}

test.describe('MCP legacy API key (iw_proj_...) — read + write parity', () => {
  let apiKey: string;
  let projectKey: string;

  test.beforeEach(async ({ anonymousPage: page }) => {
    const request = page.request;
    const testId = `mcp-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const username = `mcplegacy-${testId}`;
    const password = TEST_PASSWORDS.MCP_USER;
    const projectSlug = `legacy-key-project-${testId}`;

    // Register user
    const reg = await request.post(`${API_BASE}/api/v1/auth/register`, {
      data: { username, password },
    });
    expect(
      reg.ok(),
      `register: ${reg.status()} ${await reg.text()}`
    ).toBeTruthy();
    const { token: authToken } = (await reg.json()) as { token: string };

    // Create project
    const proj = await request.post(`${API_BASE}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { title: 'Legacy Key Project', slug: projectSlug },
    });
    expect(
      proj.ok(),
      `create project: ${proj.status()} ${await proj.text()}`
    ).toBeTruthy();

    // Mint a legacy `iw_proj_...` MCP API key with full read+write permissions
    const keyRes = await request.post(
      `${API_BASE}/api/v1/mcp-keys/${username}/${projectSlug}/keys`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          name: `Regression Key ${Date.now()}`,
          permissions: [
            'read:project',
            'read:elements',
            'read:worldbuilding',
            'read:schemas',
            'write:elements',
            'write:worldbuilding',
          ],
        },
      }
    );
    expect(
      keyRes.ok(),
      `create mcp key: ${keyRes.status()} ${await keyRes.text()}`
    ).toBeTruthy();
    const { fullKey } = (await keyRes.json()) as { fullKey: string };
    expect(
      fullKey.startsWith('iw_proj_'),
      'expected legacy key prefix iw_proj_ — fixture/regression assumption broken'
    ).toBeTruthy();

    apiKey = fullKey;
    projectKey = `${username}/${projectSlug}`;
  });

  test('read tools work (get_project_tree on empty project)', async ({
    anonymousPage: page,
  }) => {
    const result = await mcpCallTool(page.request, apiKey, 'get_project_tree', {
      project: projectKey,
    });
    expect(result.error, JSON.stringify(result.error)).toBeUndefined();
    expect((result.result as ToolResult).isError ?? false).toBe(false);
  });

  test('create_element succeeds (DO write path)', async ({
    anonymousPage: page,
  }) => {
    const result = await mcpCallTool(page.request, apiKey, 'create_element', {
      project: projectKey,
      name: 'Regression Folder',
      type: 'FOLDER',
    });

    expect(
      result.error,
      `create_element rejected legacy key: ${JSON.stringify(result.error)}`
    ).toBeUndefined();

    const tool = result.result as ToolResult;
    expect(tool.isError ?? false, JSON.stringify(tool.content)).toBe(false);
    extractElementId(result);
  });

  test('update_element succeeds after create', async ({
    anonymousPage: page,
  }) => {
    const created = await mcpCallTool(page.request, apiKey, 'create_element', {
      project: projectKey,
      name: 'To Rename',
      type: 'ITEM',
    });
    const elementId = extractElementId(created);

    const updated = await mcpCallTool(page.request, apiKey, 'update_element', {
      project: projectKey,
      elementId,
      name: 'Renamed',
    });
    expect(updated.error, JSON.stringify(updated.error)).toBeUndefined();
    expect((updated.result as ToolResult).isError ?? false).toBe(false);
  });

  test('delete_element succeeds after create', async ({
    anonymousPage: page,
  }) => {
    const created = await mcpCallTool(page.request, apiKey, 'create_element', {
      project: projectKey,
      name: 'To Delete',
      type: 'ITEM',
    });
    const elementId = extractElementId(created);

    const deleted = await mcpCallTool(page.request, apiKey, 'delete_element', {
      project: projectKey,
      elementId,
    });
    expect(deleted.error, JSON.stringify(deleted.error)).toBeUndefined();
    expect((deleted.result as ToolResult).isError ?? false).toBe(false);
  });

  test('replace_all_elements succeeds (bulk write)', async ({
    anonymousPage: page,
  }) => {
    const result = await mcpCallTool(
      page.request,
      apiKey,
      'replace_all_elements',
      {
        project: projectKey,
        elements: [
          { id: 'reg-1', name: 'Act I', type: 'FOLDER', level: 0 },
          { id: 'reg-2', name: 'Scene 1', type: 'ITEM', level: 1 },
        ],
      }
    );
    expect(
      result.error,
      `replace_all_elements (the original failing tool) rejected legacy key: ${JSON.stringify(result.error)}`
    ).toBeUndefined();
    expect((result.result as ToolResult).isError ?? false).toBe(false);
  });

  test('update_worldbuilding succeeds (DO map write)', async ({
    anonymousPage: page,
  }) => {
    const created = await mcpCallTool(page.request, apiKey, 'create_element', {
      project: projectKey,
      name: 'Regression Character',
      type: 'WORLDBUILDING',
    });
    const elementId = extractElementId(created);

    const result = await mcpCallTool(
      page.request,
      apiKey,
      'update_worldbuilding',
      {
        project: projectKey,
        elementId,
        fields: { age: '42', occupation: 'Tester' },
      }
    );
    expect(result.error, JSON.stringify(result.error)).toBeUndefined();
    expect((result.result as ToolResult).isError ?? false).toBe(false);
  });

  test('update_document_content succeeds (DO ProseMirror write)', async ({
    anonymousPage: page,
  }) => {
    const created = await mcpCallTool(page.request, apiKey, 'create_element', {
      project: projectKey,
      name: 'Regression Document',
      type: 'ITEM',
    });
    const elementId = extractElementId(created);

    const result = await mcpCallTool(
      page.request,
      apiKey,
      'update_document_content',
      {
        project: projectKey,
        elementId,
        content: '<paragraph>Regression content.</paragraph>',
        format: 'xml',
      }
    );
    expect(result.error, JSON.stringify(result.error)).toBeUndefined();
    const tool = result.result as ToolResult;
    expect(tool.isError ?? false, JSON.stringify(tool.content)).toBe(false);
    expect(tool.structuredContent?.success).toBe(true);
  });
});
