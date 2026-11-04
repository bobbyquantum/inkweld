/**
 * MCP tools address a project's documents as `username:slug:…`. An account
 * created before usernames had a character rule may have a `:` in its name;
 * its document ids would be read as another project's, so the tools refuse
 * such a project without opening any document.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { inArray } from 'drizzle-orm';
import '../src/mcp';
import { config } from '../src/config/env';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS, getProjectByKey } from '../src/mcp/mcp.types';
import { yjsService } from '../src/services/yjs.service';

const run = crypto.randomUUID().slice(0, 6);
const owner = `mcpkey${run}`;
// A pre-rule account named after another account's project.
const colonUsername = `${owner}:novel`;
const db = getDatabase();
const userIds = [crypto.randomUUID(), crypto.randomUUID()];

const grant = {
  projectId: crypto.randomUUID(),
  username: colonUsername,
  slug: 'xyz',
  role: 'owner',
  permissions: ['read:project', 'read:elements', 'write:elements', 'write:worldbuilding'],
};
const context = { type: 'oauth', userId: userIds[1], username: colonUsername, grants: [grant] };

async function callTool(name: string, args: Record<string, unknown>) {
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: {
      name,
      arguments: args,
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
  };
  const c = {
    req: { header: () => undefined, json: async () => body },
    get: (key: string) => (key === 'mcpContext' ? context : db),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  return (await res.json()) as { result?: { isError?: boolean; content?: { text: string }[] } };
}

beforeAll(async () => {
  // Both accounts as they could exist from before the username rule.
  await db.insert(users).values([
    { id: userIds[0], username: owner, approved: true, enabled: true },
    { id: userIds[1], username: colonUsername, approved: true, enabled: true },
  ]);
  const now = Date.now();
  await db.insert(projects).values([
    { slug: 'novel', title: 'Novel', userId: userIds[0], createdDate: now, updatedDate: now },
    {
      id: grant.projectId,
      slug: 'xyz',
      title: 'Xyz',
      userId: userIds[1],
      createdDate: now,
      updatedDate: now,
    },
  ]);
});

afterAll(async () => {
  await db.delete(projects).where(inArray(projects.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
});

describe('MCP projects whose username cannot be part of a document id', () => {
  const spies: Array<{ mockRestore: () => void }> = [];
  afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

  it('have no project context', () => {
    expect(getProjectByKey(context as never, colonUsername, 'xyz')).toBeNull();
    expect(getProjectByKey(context as never, owner, 'nov:el')).toBeNull();
  });

  it('refuse writes and reads without opening a document', async () => {
    const getDocument = spyOn(yjsService, 'getDocument');
    spies.push(getDocument);
    const project = `${colonUsername}/xyz`;

    const results = await Promise.all([
      callTool('create_element', { project, name: 'Chapter', type: 'ITEM' }),
      callTool('update_worldbuilding', { project, elementId: 'el-1', fields: { a: 'b' } }),
      callTool('get_project_tree', { project }),
      callTool('list_project_media', { project }),
    ]);

    for (const result of results) {
      expect(result.result?.isError).toBe(true);
    }
    expect(getDocument).not.toHaveBeenCalled();
    // Nothing was stored in the other account's project directory.
    expect(existsSync(path.join(config.dataPath, owner, 'novel'))).toBe(false);
  });
});
