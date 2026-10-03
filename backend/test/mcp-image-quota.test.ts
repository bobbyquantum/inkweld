/**
 * `apply_image` writes into the project's media storage, so it must go through
 * the same sync-capacity gate as an HTTP upload — and a refusal must come back
 * as a readable tool error rather than an unhandled exception.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { projectService } from '../src/services/project.service';
import { quotaService } from '../src/services/quota.service';
import { FileStorageService } from '../src/services/file-storage.service';
import { QuotaExceededError } from '../src/errors';

const grants = [
  {
    projectId: 'id-novel',
    username: 'alice',
    slug: 'novel',
    role: 'editor',
    permissions: ['write:worldbuilding'],
  },
];

async function applyImage() {
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: {
      name: 'apply_image',
      arguments: {
        project: 'alice/novel',
        source: 'upload',
        target: 'none',
        base64Data: Buffer.from('not-really-a-png').toString('base64'),
      },
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
  return (await res.json()) as {
    result?: { content?: { text: string }[]; isError?: boolean };
  };
}

describe('MCP apply_image sync capacity', () => {
  const spies: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  it('refuses the write with a readable error and saves nothing', async () => {
    spies.push(
      spyOn(projectService, 'findById').mockResolvedValue({
        id: 'id-novel',
        userId: 'owner-id',
      } as never),
      spyOn(quotaService, 'assertCanStore').mockRejectedValue(
        new QuotaExceededError({ usedBytes: 100, quotaBytes: 100, reason: 'media_upload' })
      )
    );
    const save = spyOn(FileStorageService.prototype, 'saveProjectFile');
    spies.push(save);

    const json = await applyImage();

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('sync capacity is full');
    expect(save).not.toHaveBeenCalled();
    expect(quotaService.assertCanStore).toHaveBeenCalledWith(
      expect.anything(),
      'owner-id',
      expect.any(Number),
      'media_upload',
      expect.anything(),
      0
    );
  });
});
