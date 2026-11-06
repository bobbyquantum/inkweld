/**
 * Every MCP tool must declare its annotations. A tool without them is treated
 * by clients as destructive (the MCP default for a non-read-only tool), which
 * makes them ask for confirmation on every call - painful over voice.
 * Only tools that remove data may set `destructiveHint`.
 */
import { describe, it, expect } from 'bun:test';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS, type McpTool } from '../src/mcp/mcp.types';
import { MCP_PERMISSIONS } from '../src/mcp/mcp-permissions';

/** The only tools that delete or wholesale replace project data. */
const DESTRUCTIVE_TOOLS = [
  'delete_element',
  'delete_relationship',
  'delete_schema',
  'delete_tag',
  'replace_all_elements',
];

async function listTools(): Promise<McpTool[]> {
  const grants = [
    {
      projectId: 'id-novel',
      username: 'alice',
      slug: 'novel',
      role: 'owner',
      permissions: Object.values(MCP_PERMISSIONS),
    },
  ];
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1,
    params: {
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
  };
  const c = {
    req: { header: () => undefined, json: async () => body },
    get: (key: string) => (key === 'mcpContext' ? mcpContext : {}),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  const json = (await res.json()) as { result: { tools: McpTool[] } };
  return json.result.tools;
}

describe('MCP tool annotations', () => {
  it('declares every hint on every tool', async () => {
    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(30);
    for (const tool of tools) {
      const a = tool.annotations;
      expect(a, `${tool.name} has no annotations`).toBeDefined();
      for (const hint of [
        'readOnlyHint',
        'destructiveHint',
        'idempotentHint',
        'openWorldHint',
      ] as const) {
        expect(typeof a?.[hint], `${tool.name}.${hint}`).toBe('boolean');
      }
    }
  });

  it('marks only deleting tools destructive, and never a read-only tool', async () => {
    const tools = await listTools();
    const destructive = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name);
    expect(destructive.sort()).toEqual([...DESTRUCTIVE_TOOLS].sort());
    for (const tool of tools.filter((t) => t.annotations?.readOnlyHint)) {
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it('marks only apply_image as open-world', async () => {
    const tools = await listTools();
    const openWorld = tools.filter((t) => t.annotations?.openWorldHint).map((t) => t.name);
    expect(openWorld).toEqual(['apply_image']);
  });

  it('does not mark update tools destructive', async () => {
    const tools = await listTools();
    for (const tool of tools.filter((t) => t.name.startsWith('update_'))) {
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it('warns in the description of tools that destroy data only depending on use', async () => {
    const tools = await listTools();
    for (const name of [
      'update_document_content',
      'update_document_section',
      'update_schema',
      'edit_canvas',
    ]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description, name).toMatch(/potentially destructive/i);
    }
  });
});
