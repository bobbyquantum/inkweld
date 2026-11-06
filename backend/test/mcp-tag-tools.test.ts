/**
 * Tests for the tag tools (`list_tags`, `create_tag`, `update_tag`,
 * `delete_tag`, `tag_element`): they must read and write the `customTags` and
 * `elementTags` arrays of the project elements doc, which is where the app's
 * TagService keeps tags.
 */
import { describe, it, expect, afterEach, beforeEach, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { yjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { TAG_COLORS, TAG_ICONS, resolveTags } from '../src/mcp/tools/tag-store';

const WRITE = ['read:elements', 'write:elements'];
const READ = ['read:elements'];

interface ToolJson {
  result?: {
    tools?: Array<{
      name: string;
      inputSchema: { properties: Record<string, { enum?: string[] }> };
    }>;
    content?: { text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

async function rpc(
  permissions: string[],
  method: string,
  params: Record<string, unknown> = {}
): Promise<ToolJson> {
  const grants = [
    { projectId: 'id-novel', username: 'alice', slug: 'novel', role: 'editor', permissions },
  ];
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method,
    id: 1,
    params: {
      ...params,
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
  return (await res.json()) as ToolJson;
}

function call(name: string, args: Record<string, unknown>, permissions = WRITE) {
  return rpc(permissions, 'tools/call', { name, arguments: { project: 'alice/novel', ...args } });
}

function textOf(json: ToolJson): string {
  return json.result?.content?.[0]?.text ?? '';
}

interface Row {
  id: string;
  [prop: string]: unknown;
}

const spies: Array<{ mockRestore: () => void }> = [];
let activity: Array<Record<string, unknown>> = [];

beforeEach(() => {
  activity = [];
  spies.push(
    spyOn(activityService, 'record').mockImplementation(((_db: unknown, event: never) => {
      activity.push(event);
      return Promise.resolve();
    }) as never)
  );
});

afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

const hero = { id: 'tag-hero', name: 'Protagonist', icon: 'star', color: '#DC143C' };
const draft = {
  id: 'tag-draft',
  name: 'Draft',
  icon: 'edit_note',
  color: '#FF8C00',
  description: 'Needs another pass',
};

/** Serve the project elements doc, seeded with elements and tags. */
function seedProject(seed: { tags?: unknown[]; assignments?: unknown[] } = {}) {
  const doc = new Y.Doc();
  doc.getArray('elements').push([
    { id: 'el-1', name: 'Mara', type: 'WORLDBUILDING', parentId: null, level: 0, order: 0 },
    { id: 'el-2', name: 'Chapter 1', type: 'ITEM', parentId: null, level: 0, order: 1 },
  ]);
  doc.getArray('customTags').push(seed.tags ?? [hero, draft]);
  doc.getArray('elementTags').push(seed.assignments ?? []);
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:elements/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  return {
    doc,
    tags: () => doc.getArray('customTags').toJSON() as Row[],
    assignments: () =>
      doc.getArray('elementTags').toJSON() as Array<{ elementId: string; tagId: string }>,
  };
}

describe('tag tool listing', () => {
  it('offers the tag icons and colours as enums on create_tag', async () => {
    const json = await rpc(WRITE, 'tools/list');
    const create = json.result?.tools?.find((t) => t.name === 'create_tag');
    expect(create).toBeDefined();
    expect(create?.inputSchema.properties.icon.enum).toEqual([...TAG_ICONS]);
    expect(create?.inputSchema.properties.color.enum).toEqual(TAG_COLORS.map((c) => c.hex));
    const names = json.result?.tools?.map((t) => t.name) ?? [];
    for (const name of ['list_tags', 'create_tag', 'update_tag', 'delete_tag', 'tag_element']) {
      expect(names).toContain(name);
    }
  });

  it('hides the write tools from a read-only grant', async () => {
    const json = await rpc(READ, 'tools/list');
    const names = json.result?.tools?.map((t) => t.name) ?? [];
    expect(names).toContain('list_tags');
    expect(names).not.toContain('create_tag');
    expect(names).not.toContain('tag_element');
  });
});

describe('list_tags', () => {
  it('lists tags with counts of live elements', async () => {
    seedProject({
      assignments: [
        { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a2', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a3', elementId: 'gone', tagId: 'tag-hero', createdAt: 'x' },
      ],
    });
    const json = await call('list_tags', {}, READ);
    const tags = json.result?.structuredContent?.tags as Array<Row & { count: number }>;
    expect(tags.map((t) => [t.id, t.count])).toEqual([
      ['tag-hero', 2],
      ['tag-draft', 0],
    ]);
    expect(tags[1].description).toBe('Needs another pass');
  });

  it('lists the tags on one element', async () => {
    seedProject({
      assignments: [{ id: 'a1', elementId: 'el-1', tagId: 'tag-draft', createdAt: 'x' }],
    });
    const json = await call('list_tags', { elementId: 'el-1' }, READ);
    expect(json.result?.structuredContent?.tags).toEqual([
      {
        id: 'tag-draft',
        name: 'Draft',
        icon: 'edit_note',
        color: '#FF8C00',
        description: 'Needs another pass',
      },
    ]);
  });

  it('lists the elements with a tag, by name', async () => {
    seedProject({
      assignments: [{ id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' }],
    });
    const json = await call('list_tags', { tagId: 'protagonist' }, READ);
    expect(json.result?.structuredContent?.elements).toEqual([{ id: 'el-1', name: 'Mara' }]);
  });

  it('says how to start when the project has no tags', async () => {
    seedProject({ tags: [] });
    const json = await call('list_tags', {}, READ);
    expect(textOf(json)).toContain('create_tag');
  });
});

describe('create_tag', () => {
  it('stores a tag definition the app can read', async () => {
    const project = seedProject();
    const json = await call('create_tag', {
      name: 'Villain',
      icon: 'whatshot',
      color: '#8a2be2',
      description: 'Antagonists',
    });
    expect(json.result?.isError).toBeUndefined();
    const created = project.tags().find((t) => t.name === 'Villain');
    expect(created).toMatchObject({
      icon: 'whatshot',
      color: '#8A2BE2',
      description: 'Antagonists',
    });
    expect(typeof created?.id).toBe('string');
  });

  it('accepts a palette colour name', async () => {
    const project = seedProject();
    await call('create_tag', { name: 'Place', icon: 'place', color: 'Forest Green' });
    expect(project.tags().find((t) => t.name === 'Place')?.color).toBe('#228B22');
  });

  it('refuses an icon outside the tag icons, listing them', async () => {
    const project = seedProject();
    const json = await call('create_tag', { name: 'X', icon: 'rocket_launch', color: '#DC143C' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('lightbulb');
    expect(project.tags()).toHaveLength(2);
  });

  it('refuses a colour outside the palette, listing it', async () => {
    seedProject();
    const json = await call('create_tag', { name: 'X', icon: 'star', color: '#123456' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('#4169E1 (royal blue)');
  });

  it('requires an icon and a colour', async () => {
    seedProject();
    const json = await call('create_tag', { name: 'X' });
    expect(json.result?.isError).toBe(true);
  });

  it('refuses a duplicate name ignoring case', async () => {
    const project = seedProject();
    const json = await call('create_tag', { name: 'draft', icon: 'star', color: '#DC143C' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('already exists');
    expect(project.tags()).toHaveLength(2);
  });
});

describe('update_tag', () => {
  it('changes the icon and colour in place', async () => {
    const project = seedProject();
    const json = await call('update_tag', {
      tagId: 'Draft',
      icon: 'construction',
      color: 'sienna',
    });
    expect(json.result?.isError).toBeUndefined();
    expect(project.tags()[1]).toEqual({
      ...draft,
      icon: 'construction',
      color: '#A0522D',
    });
  });

  it('clears the description with ""', async () => {
    const project = seedProject();
    await call('update_tag', { tagId: 'tag-draft', description: '' });
    expect(project.tags()[1].description).toBeUndefined();
  });

  it('refuses to rename onto another tag', async () => {
    seedProject();
    const json = await call('update_tag', { tagId: 'tag-draft', name: 'PROTAGONIST' });
    expect(json.result?.isError).toBe(true);
  });

  it('fails for an unknown tag', async () => {
    seedProject();
    const json = await call('update_tag', { tagId: 'nope', name: 'Y' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('"Protagonist" (tag-hero)');
  });
});

describe('delete_tag', () => {
  it('deletes the definition and every assignment of it', async () => {
    const project = seedProject({
      assignments: [
        { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a2', elementId: 'el-1', tagId: 'tag-draft', createdAt: 'x' },
        { id: 'a3', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' },
      ],
    });
    const json = await call('delete_tag', { tagId: 'tag-hero' });
    expect(json.result?.structuredContent?.removedFrom).toBe(2);
    expect(project.tags().map((t) => t.id)).toEqual(['tag-draft']);
    expect(project.assignments().map((a) => a.tagId)).toEqual(['tag-draft']);
  });
});

describe('tag_element', () => {
  it('adds existing tags by id or name to the elementTags array', async () => {
    const project = seedProject();
    const json = await call('tag_element', { elementId: 'el-1', add: ['tag-hero', 'draft'] });
    expect(json.result?.isError).toBeUndefined();
    expect(project.assignments().map((a) => [a.elementId, a.tagId])).toEqual([
      ['el-1', 'tag-hero'],
      ['el-1', 'tag-draft'],
    ]);
    expect(textOf(json)).toBe('Tags on "Mara": Protagonist, Draft');
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      eventType: 'element_tagged',
      entityId: 'el-1',
      metadata: { previousTags: [], newTags: ['Protagonist', 'Draft'] },
    });
  });

  it('does not add a tag twice', async () => {
    const project = seedProject({
      assignments: [{ id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' }],
    });
    await call('tag_element', { elementId: 'el-1', add: ['Protagonist'] });
    expect(project.assignments()).toHaveLength(1);
    expect(activity).toHaveLength(0);
  });

  it('fails on a tag that does not exist, changing nothing', async () => {
    const project = seedProject();
    const json = await call('tag_element', {
      elementId: 'el-1',
      add: ['Protagonist', 'important', 'urgent'],
    });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('"important", "urgent" do not exist');
    expect(textOf(json)).toContain('create_tag');
    expect(project.tags()).toHaveLength(2);
    expect(project.assignments()).toHaveLength(0);
  });

  it('keeps existing tags when set or remove/add names a missing tag', async () => {
    const existing = [
      { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
      { id: 'a2', elementId: 'el-1', tagId: 'tag-draft', createdAt: 'x' },
    ];
    const project = seedProject({ assignments: existing });
    const badSet = await call('tag_element', { elementId: 'el-1', set: ['Draft', 'missing'] });
    expect(badSet.result?.isError).toBe(true);
    expect(project.assignments()).toEqual(existing);
    const badMix = await call('tag_element', {
      elementId: 'el-1',
      remove: ['Protagonist'],
      add: ['missing'],
    });
    expect(badMix.result?.isError).toBe(true);
    expect(project.assignments()).toEqual(existing);
  });

  it('removes tags', async () => {
    const project = seedProject({
      assignments: [
        { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a2', elementId: 'el-1', tagId: 'tag-draft', createdAt: 'x' },
        { id: 'a3', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' },
      ],
    });
    await call('tag_element', { elementId: 'el-1', remove: ['tag-hero'] });
    expect(project.assignments().map((a) => [a.elementId, a.tagId])).toEqual([
      ['el-1', 'tag-draft'],
      ['el-2', 'tag-hero'],
    ]);
  });

  it('replaces all tags with set', async () => {
    const project = seedProject({
      assignments: [{ id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' }],
    });
    await call('tag_element', { elementId: 'el-1', set: ['Draft'] });
    expect(project.assignments().map((a) => a.tagId)).toEqual(['tag-draft']);
    await call('tag_element', { elementId: 'el-1', set: [] });
    expect(project.assignments()).toHaveLength(0);
  });

  it('refuses set together with add', async () => {
    seedProject();
    const json = await call('tag_element', { elementId: 'el-1', set: [], add: ['Draft'] });
    expect(json.result?.isError).toBe(true);
  });

  it('fails for an unknown element', async () => {
    seedProject();
    const json = await call('tag_element', { elementId: 'el-9', add: ['Draft'] });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('not found');
  });

  it('needs write permission', async () => {
    seedProject();
    const json = await call('tag_element', { elementId: 'el-1', add: ['Draft'] }, READ);
    expect(json.result?.isError ?? !!json.error).toBe(true);
  });
});

describe('get_element_full', () => {
  it('reports the element tags as the app shows them', async () => {
    seedProject({
      assignments: [{ id: 'a1', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' }],
    });
    const json = await call('get_element_full', { elementId: 'el-2' }, READ);
    const payload = JSON.parse(textOf(json)) as { element: { tags: Row[] } };
    expect(payload.element.tags).toEqual([hero]);
  });
});

describe('get_element_full when tags cannot be read', () => {
  it('fails instead of reporting no tags', async () => {
    const doc = new Y.Doc();
    doc
      .getArray('elements')
      .push([{ id: 'el-1', name: 'Mara', type: 'ITEM', parentId: null, level: 0, order: 0 }]);
    // The element list reads fine; opening the doc for its tags fails.
    spies.push(
      spyOn(yjsService, 'getDocument').mockImplementation((() =>
        Promise.reject(new Error('read failed'))) as never)
    );
    spies.push(
      spyOn(yjsService, 'getElements').mockImplementation((() =>
        Promise.resolve(doc.getArray('elements').toJSON())) as never)
    );
    const json = await call('get_element_full', { elementId: 'el-1' }, READ);
    expect(json.result?.isError ?? !!json.error).toBe(true);
  });
});

describe('delete_element', () => {
  it('takes the deleted elements off their tags', async () => {
    const project = seedProject({
      assignments: [
        { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a2', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' },
      ],
    });
    const json = await call('delete_element', { elementId: 'el-1' });
    expect(json.result?.isError).toBeUndefined();
    expect(project.assignments().map((a) => a.elementId)).toEqual(['el-2']);
  });
});

describe('replace_all_elements', () => {
  it('takes elements it leaves out off their tags, and keeps the rest', async () => {
    const project = seedProject({
      assignments: [
        { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
        { id: 'a2', elementId: 'el-2', tagId: 'tag-hero', createdAt: 'x' },
      ],
    });
    const json = await call('replace_all_elements', {
      elements: [{ id: 'el-2', name: 'Chapter 1', type: 'ITEM', level: 0 }],
    });
    expect(json.result?.isError).toBeUndefined();
    expect(project.assignments().map((a) => a.elementId)).toEqual(['el-2']);
  });
});

describe('duplicates from merged copies', () => {
  const twinAssignments = [
    { id: 'a1', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'x' },
    { id: 'a2', elementId: 'el-1', tagId: 'tag-hero', createdAt: 'y' },
  ];

  it('counts and lists an element once per tag', async () => {
    seedProject({ assignments: twinAssignments });
    const all = await call('list_tags', {}, READ);
    const tags = all.result?.structuredContent?.tags as Array<Row & { count: number }>;
    expect(tags[0].count).toBe(1);
    const one = await call('list_tags', { tagId: 'tag-hero' }, READ);
    expect(one.result?.structuredContent?.elements).toEqual([{ id: 'el-1', name: 'Mara' }]);
  });

  it('reads one definition per tag id, the first', async () => {
    seedProject({ tags: [hero, { ...hero, name: 'Lead', color: '#228B22' }, draft] });
    const json = await call('list_tags', {}, READ);
    const tags = json.result?.structuredContent?.tags as Row[];
    expect(tags.map((t) => [t.id, t.name])).toEqual([
      ['tag-hero', 'Protagonist'],
      ['tag-draft', 'Draft'],
    ]);
  });

  it('cleans them up on the next tag write', async () => {
    const project = seedProject({
      tags: [hero, { ...hero, name: 'Lead' }, draft],
      assignments: twinAssignments,
    });
    await call('tag_element', { elementId: 'el-2', add: ['Draft'] });
    expect(project.tags().map((t) => t.id)).toEqual(['tag-hero', 'tag-draft']);
    expect(project.assignments().map((a) => [a.elementId, a.tagId])).toEqual([
      ['el-1', 'tag-hero'],
      ['el-2', 'tag-draft'],
    ]);
  });

  it('leaves them alone when a write is refused', async () => {
    const project = seedProject({ assignments: twinAssignments });
    await call('tag_element', { elementId: 'el-1', add: ['missing'] });
    expect(project.assignments()).toHaveLength(2);
  });
});

describe('resolveTags', () => {
  it('dedupes references to the same tag', () => {
    expect(resolveTags([hero, draft], ['tag-hero', 'protagonist']).map((t) => t.id)).toEqual([
      'tag-hero',
    ]);
  });
});

describe('tag palette', () => {
  /** The string literals of `const NAME = [ ... ];` in the tag editor dialog. */
  function dialogList(name: string): string[] {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          '../../frontend/src/app/dialogs/tag-edit-dialog/tag-edit-dialog.component.ts',
          import.meta.url
        )
      ),
      'utf8'
    );
    const body = new RegExp(String.raw`const ${name} = \[([^\]]*)\]`).exec(source)?.[1];
    expect(body).toBeDefined();
    return [...(body ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it('offers the same icons as the tag editor', () => {
    expect([...TAG_ICONS]).toEqual(dialogList('ICON_OPTIONS'));
  });

  it('offers the same colours as the tag editor', () => {
    expect(TAG_COLORS.map((c) => c.hex)).toEqual(dialogList('COLOR_OPTIONS'));
  });
});
