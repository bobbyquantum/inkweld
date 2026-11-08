/**
 * Tests for the time system tools (`list_time_systems`, `create_time_system`,
 * `update_time_system`, `delete_time_system`) and the generator tools
 * (`list_generators`, `roll_generator`, `create_generator`, `update_generator`,
 * `delete_generator`). They must read and write the `timeSystems` and
 * `generators` arrays of the project elements doc, which the app's
 * TimeSystemLibraryService and GeneratorLibraryService read.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import { rollGenerator, type Generator } from '@inkweld/project-library';
import { yjsService } from '../src/services/yjs.service';
import { YjsWorkerService } from '../src/services/yjs-worker.service';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { readRows, resolveRow } from '../src/mcp/tools/library-store';

const WRITE = ['read:schemas', 'write:schemas'];
const READ = ['read:schemas'];

interface ToolJson {
  result?: {
    tools?: Array<{ name: string }>;
    content?: { text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

async function rpc(
  permissions: string[],
  method: string,
  params: Record<string, unknown> = {},
  context: Record<string, unknown> = {}
): Promise<ToolJson> {
  const grants = [
    { projectId: 'id-novel', username: 'alice', slug: 'novel', role: 'editor', permissions },
  ];
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants, ...context };
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

function structured<T = Record<string, unknown>>(json: ToolJson): T {
  return json.result?.structuredContent as T;
}

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

const reckoning = {
  id: 'ts-reckoning',
  name: 'Imperial Reckoning',
  isBuiltIn: false,
  unitLabels: ['Age', 'Year'],
  subdivisions: [1000],
  format: 'Age {u0}, {u1}',
  parseSeparator: '/',
};

const dwarfNames: Generator = {
  id: 'gen-dwarf',
  name: 'Dwarven names',
  icon: 'casino',
  description: 'Names for the hill clans',
  category: 'names',
  template: '#first# #clan#',
  rules: [
    { key: 'first', entries: [{ text: 'Brom' }, { text: 'Dagna', weight: 2 }] },
    { key: 'clan', entries: [{ text: 'Ironfoot' }, { text: 'Stonehelm' }] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Serve the project elements doc, seeded with library rows. */
function seedProject(
  seed: { timeSystems?: unknown[]; generators?: unknown[]; schemas?: unknown[] } = {}
) {
  const doc = new Y.Doc();
  doc
    .getArray('elements')
    .push([{ id: 'el-1', name: 'Brom Ironfoot', type: 'WORLDBUILDING', parentId: null, order: 0 }]);
  doc.getArray('timeSystems').push(seed.timeSystems ?? [reckoning]);
  doc.getArray('generators').push(seed.generators ?? [dwarfNames]);
  doc.getArray('schemas').push(seed.schemas ?? []);
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:elements/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  return {
    doc,
    timeSystems: () => doc.getArray('timeSystems').toJSON() as Array<Record<string, unknown>>,
    generators: () => doc.getArray('generators').toJSON() as Generator[],
  };
}

describe('library tool listing', () => {
  it('offers the tools to a client with schema access only', async () => {
    const json = await rpc(READ, 'tools/list');
    const names = (json.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain('list_time_systems');
    expect(names).toContain('list_generators');
    expect(names).toContain('roll_generator');
  });

  it('refuses writes without write:schemas', async () => {
    seedProject();
    const json = await call('delete_generator', { generatorId: 'gen-dwarf' }, READ);
    expect(json.result?.isError ?? !!json.error).toBe(true);
  });
});

// ============================================
// Time systems
// ============================================

describe('list_time_systems', () => {
  it('lists installed systems with a sample date and the templates', async () => {
    seedProject();
    const json = await call('list_time_systems', {}, READ);
    const payload = structured<{
      timeSystems: Array<Record<string, unknown>>;
      templates: Array<{ id: string; installed: boolean }>;
    }>(json);
    expect(payload.timeSystems).toHaveLength(1);
    expect(payload.timeSystems[0]).toMatchObject({
      id: 'ts-reckoning',
      name: 'Imperial Reckoning',
      exampleDate: 'Age 1, 1',
    });
    expect(payload.timeSystems[0]).not.toHaveProperty('isBuiltIn');
    expect(payload.templates.find((t) => t.id === 'gregorian')?.installed).toBe(false);
  });

  it('says how to start when there are none, in the structured result too', async () => {
    seedProject({ timeSystems: [] });
    const json = await call('list_time_systems', {}, READ);
    expect(textOf(json)).toContain('no time systems yet');
    expect(structured<{ note: string }>(json).note).toContain('create_time_system');
  });

  it('adds no note or warnings to a sound system', async () => {
    seedProject();
    const payload = structured<{ timeSystems: Array<Record<string, unknown>> }>(
      await call('list_time_systems', {}, READ)
    );
    expect(payload).not.toHaveProperty('note');
    expect(payload.timeSystems[0]).not.toHaveProperty('warnings');
  });

  it('skips rows that are not time systems', async () => {
    seedProject({ timeSystems: [reckoning, { id: 'broken' }, 'junk'] });
    const json = await call('list_time_systems', {}, READ);
    expect(structured<{ timeSystems: unknown[] }>(json).timeSystems).toHaveLength(1);
  });
});

describe('create_time_system', () => {
  it('installs a template under its own id, as the app does', async () => {
    const project = seedProject({ timeSystems: [] });
    const json = await call('create_time_system', { template: 'gregorian' });
    expect(json.result?.isError).toBeUndefined();
    const stored = project.timeSystems();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: 'gregorian',
      isBuiltIn: false,
      format: '{u0}-{a1}-{u2}',
    });
    expect((stored[0].unitAliases as Array<Record<string, string> | null>)[1]?.['3']).toBe('Mar');
    expect(textOf(json)).toContain('1-Jan-1');
  });

  it('refuses a template that is already installed, or unknown', async () => {
    seedProject({ timeSystems: [{ ...reckoning, id: 'stardate', name: 'Stardate' }] });
    expect(textOf(await call('create_time_system', { template: 'stardate' }))).toContain(
      'already installed'
    );
    expect(textOf(await call('create_time_system', { template: 'nope' }))).toContain(
      'no template "nope"'
    );
  });

  it('designs a custom system with defaults for format and separator', async () => {
    const project = seedProject({ timeSystems: [] });
    const json = await call('create_time_system', {
      name: 'Moons',
      unitLabels: ['Year', 'Moon', 'Day'],
      subdivisions: [13, 28],
      unitAliases: [null, { '1': 'Frost' }, null],
      unitAllowZero: [true, false, false],
      unitInputMode: ['numeric', 'dropdown', 'numeric'],
      unitSubdivisionOverrides: [null, { '13': 29 }, null],
    });
    expect(json.result?.isError).toBeUndefined();
    const [stored] = project.timeSystems();
    expect(stored).toMatchObject({
      name: 'Moons',
      isBuiltIn: false,
      format: '{u0}-{u1}-{u2}',
      parseSeparator: '-',
      unitAllowZero: [true, false, false],
      unitInputMode: ['numeric', 'dropdown', 'numeric'],
    });
    expect(typeof stored.id).toBe('string');
    expect(structured<{ timeSystem: { exampleDate: string } }>(json).timeSystem.exampleDate).toBe(
      '0-1-1'
    );
  });

  it('explains a definition the app would reject, and writes nothing', async () => {
    const project = seedProject({ timeSystems: [] });
    const json = await call('create_time_system', {
      name: 'Bad',
      unitLabels: ['Year', 'Day'],
      subdivisions: [],
    });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain(
      'subdivisions has 0 entries but needs 1, one fewer than the units (Year, Day)'
    );
    expect(project.timeSystems()).toHaveLength(0);
  });

  it('says which per-unit list has the wrong length', async () => {
    seedProject({ timeSystems: [] });
    const json = await call('create_time_system', {
      name: 'Bad',
      unitLabels: ['Year', 'Month'],
      subdivisions: [12],
      unitAllowZero: [true],
    });
    expect(textOf(json)).toBe(
      'Error: unitAllowZero has 1 entry but needs 2, one per unit (Year, Month). ' +
        'Pass one entry per unit, or null to drop the list.'
    );
    const single = await call('create_time_system', {
      name: 'Bad',
      unitLabels: ['Turn'],
      subdivisions: [4],
    });
    expect(textOf(single)).toContain('subdivisions has 1 entry but needs 0');
    expect(textOf(single)).toContain('[] for a single unit');
  });

  it('saves a system with warnings about what will not work', async () => {
    const project = seedProject({ timeSystems: [] });
    const json = await call('create_time_system', {
      name: 'Odd',
      unitLabels: ['Year', 'Month', 'Day'],
      subdivisions: [12, 30],
      format: '{u0}-{u1}-{u2} {u7}',
      unitSubdivisionOverrides: [null, { '10': 40, '13': 20 }, null],
    });
    expect(json.result?.isError).toBeUndefined();
    expect(project.timeSystems()).toHaveLength(1);
    const { warnings } = structured<{ timeSystem: { warnings: string[] } }>(json).timeSystem;
    // The 40-day month 10 is fine; the length for month 13 never applies.
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('{u7}');
    expect(warnings[1]).toContain('Month values run from 1 to 12');
    expect(textOf(json)).toContain('Warnings: The format uses {u7}');

    const listed = structured<{ timeSystems: Array<{ warnings?: string[] }> }>(
      await call('list_time_systems', {}, READ)
    );
    expect(listed.timeSystems[0].warnings).toEqual(warnings);
  });

  it.each([
    [{ name: 'X', unitLabels: [] }, 'unitLabels must be a non-empty array'],
    [{ name: 'X', unitLabels: ['Year', ''] }, 'unitLabels[1] must be a non-empty string'],
    [{ name: 'X', unitLabels: ['A', 'B'], subdivisions: [0] }, 'positive whole number'],
    [{ name: 'X', unitLabels: ['A'], parseSeparator: '----' }, 'parseSeparator is too long'],
    [{ name: 'X', unitLabels: ['A'], unitAliases: [{ one: 'x' }] }, 'keys must be unit values'],
    [{ name: 'X', unitLabels: ['A'], unitAliases: [{ '1': '' }] }, 'must be a non-empty string'],
    [{ name: 'X', unitLabels: ['A'], unitAliases: 'x' }, 'one entry (an object or null) per unit'],
    [{ name: 'X', unitLabels: ['A'], unitAliases: [[1]] }, 'must be an object or null'],
    [{ name: 'X', unitLabels: ['A'], unitAllowZero: ['yes'] }, 'array of true/false'],
    [{ name: 'X', unitLabels: ['A'], unitInputMode: ['list'] }, '"numeric" or "dropdown"'],
    [
      {
        name: 'X',
        unitLabels: ['A', 'B'],
        subdivisions: [2],
        unitSubdivisionOverrides: [{ '1': -1 }, null],
      },
      'positive whole number',
    ],
    [{ unitLabels: ['A'] }, 'name is required'],
  ])('refuses bad input %#', async (args, message) => {
    seedProject({ timeSystems: [] });
    const json = await call('create_time_system', args);
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain(message);
  });
});

describe('update_time_system', () => {
  it('changes fields in place by name, keeping the id', async () => {
    const project = seedProject({
      timeSystems: [{ ...reckoning, id: 'other', name: 'Other' }, reckoning],
    });
    const json = await call('update_time_system', {
      timeSystemId: 'imperial reckoning',
      name: 'Imperial Count',
      format: 'A{u0}/{u1}',
    });
    expect(json.result?.isError).toBeUndefined();
    const stored = project.timeSystems();
    expect(stored.map((s) => s.id)).toEqual(['other', 'ts-reckoning']);
    expect(stored[1]).toMatchObject({
      name: 'Imperial Count',
      format: 'A{u0}/{u1}',
      isBuiltIn: false,
    });
  });

  it('returns warnings in the structured result and the text', async () => {
    seedProject();
    const json = await call('update_time_system', {
      timeSystemId: 'ts-reckoning',
      format: 'Age {u0}, {u1} {u7}',
    });
    expect(json.result?.isError).toBeUndefined();
    const { warnings } = structured<{ timeSystem: { warnings: string[] } }>(json).timeSystem;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('{u7}');
    expect(textOf(json)).toContain(`Warnings: ${warnings[0]}`);
  });

  it('replaces and clears per-unit lists', async () => {
    const project = seedProject({
      timeSystems: [{ ...reckoning, unitAllowZero: [true, true] }],
    });
    await call('update_time_system', {
      timeSystemId: 'ts-reckoning',
      unitAllowZero: null,
      unitAliases: [null, { '1': 'First' }],
    });
    const [stored] = project.timeSystems();
    expect(stored).not.toHaveProperty('unitAllowZero');
    expect((stored.unitAliases as unknown[])[1]).toEqual({ '1': 'First' });
  });

  it('refuses changes that leave the system invalid', async () => {
    const project = seedProject({ timeSystems: [{ ...reckoning, unitAllowZero: [true, true] }] });
    const json = await call('update_time_system', {
      timeSystemId: 'ts-reckoning',
      unitLabels: ['Age', 'Year', 'Day'],
      subdivisions: [1000, 360],
    });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain(
      'unitAllowZero has 2 entries but needs 3, one per unit (Age, Year, Day)'
    );
    expect(project.timeSystems()[0].unitLabels).toEqual(['Age', 'Year']);
  });

  it('needs something to change, and a system that exists', async () => {
    seedProject();
    expect(textOf(await call('update_time_system', { timeSystemId: 'ts-reckoning' }))).toContain(
      'nothing to change'
    );
    expect(
      textOf(await call('update_time_system', { timeSystemId: 'ts-reckoning', name: '' }))
    ).toContain('name cannot be empty');
    expect(
      textOf(await call('update_time_system', { timeSystemId: 'ts-reckoning', format: '' }))
    ).toContain('format cannot be empty');
    const missing = textOf(await call('update_time_system', { timeSystemId: 'nope', name: 'X' }));
    expect(missing).toContain('no time system "nope"');
    expect(missing).toContain('"Imperial Reckoning" (ts-reckoning)');
  });
});

describe('delete_time_system', () => {
  it('removes the system', async () => {
    const project = seedProject();
    const json = await call('delete_time_system', { timeSystemId: 'ts-reckoning' });
    expect(structured(json)).toMatchObject({ success: true, deleted: 'ts-reckoning' });
    expect(project.timeSystems()).toHaveLength(0);
  });
});

// ============================================
// Generators
// ============================================

describe('list_generators', () => {
  it('summarises each generator', async () => {
    seedProject();
    const json = await call('list_generators', {}, READ);
    const { generators } = structured<{ generators: Array<Record<string, unknown>> }>(json);
    expect(generators).toEqual([
      {
        id: 'gen-dwarf',
        name: 'Dwarven names',
        icon: 'casino',
        category: 'names',
        description: 'Names for the hill clans',
        template: '#first# #clan#',
        rules: ['first (2)', 'clan (2)'],
        valid: true,
      },
    ]);
  });

  it('shows one generator in full, with its problems and the fields that use it', async () => {
    const broken = { ...dwarfNames, id: 'gen-broken', name: 'Broken', template: '#missing#' };
    seedProject({
      generators: [dwarfNames, broken],
      schemas: [
        {
          id: 's1',
          name: 'Character',
          tabs: [
            { key: 'basic', fields: [{ key: 'name', label: 'Name', generatorId: 'gen-broken' }] },
          ],
        },
      ],
    });
    const json = await call('list_generators', { generatorId: 'Broken' }, READ);
    const payload = structured<{
      generator: { valid: boolean; issues: Array<{ message: string }>; rules: unknown[] };
      usedByFields: string[];
    }>(json);
    expect(payload.generator.valid).toBe(false);
    expect(payload.generator.issues[0].message).toContain('#missing# does not match any rule');
    expect(payload.generator.rules).toHaveLength(2);
    expect(payload.usedByFields).toEqual(['Character → Name']);
  });

  it('says how to start when there are none, in the structured result too', async () => {
    seedProject({ generators: [] });
    const json = await call('list_generators', {}, READ);
    expect(textOf(json)).toContain('no generators yet');
    expect(structured(json)).toEqual({
      generators: [],
      note: 'This project has no generators yet. Create one with create_generator.',
    });
  });

  it('normalises malformed rows the way the app does', async () => {
    seedProject({ generators: [{ id: 'g', name: 7, rules: 'x' }] });
    const json = await call('list_generators', {}, READ);
    const [summary] = structured<{ generators: Array<Record<string, unknown>> }>(json).generators;
    expect(summary).toMatchObject({
      id: 'g',
      name: '',
      icon: 'casino',
      category: 'other',
      rules: [],
    });
  });
});

describe('roll_generator', () => {
  it('rolls as the app engine does, reproducibly by seed', async () => {
    seedProject();
    const json = await call(
      'roll_generator',
      { generatorId: 'gen-dwarf', count: 3, seed: 42 },
      READ
    );
    const { results } = structured<{ results: Array<{ text: string; seed: number }> }>(json);
    expect(results).toEqual(rollGenerator(dwarfNames, { count: 3, seed: 42 }));
    expect(textOf(json)).toContain(`- ${results[0].text}`);
    expect(structured(json)).toMatchObject({ requested: 3 });
    expect(structured(json)).not.toHaveProperty('note');
  });

  it('skips element names and excluded results, and says when it ran short', async () => {
    seedProject();
    const json = await call(
      'roll_generator',
      {
        generatorId: 'gen-dwarf',
        count: 4,
        unique: true,
        excludeElementNames: true,
        exclude: ['dagna stonehelm'],
      },
      READ
    );
    const payload = structured<{
      requested: number;
      note: string;
      results: Array<{ text: string }>;
    }>(json);
    expect(payload.results.map((r) => r.text).sort()).toEqual(['Brom Stonehelm', 'Dagna Ironfoot']);
    expect(textOf(json)).toContain('Only 2 of 4');
    // Clients that show only the structured result still learn why it ran short.
    expect(payload.requested).toBe(4);
    expect(payload.note).toContain('Only 2 of 4');
  });

  it('refuses a generator with errors, and bad counts', async () => {
    seedProject({ generators: [{ ...dwarfNames, template: '' }] });
    expect(textOf(await call('roll_generator', { generatorId: 'gen-dwarf' }, READ))).toContain(
      "can't be rolled yet"
    );
    expect(
      textOf(await call('roll_generator', { generatorId: 'gen-dwarf', count: 500 }, READ))
    ).toContain('count must be a whole number from 1 to 50');
    expect(
      textOf(await call('roll_generator', { generatorId: 'gen-dwarf', unique: 'yes' }, READ))
    ).toContain('unique must be true or false');
    expect(
      textOf(await call('roll_generator', { generatorId: 'gen-dwarf', exclude: [1] }, READ))
    ).toContain('exclude must be an array of strings');
  });
});

describe('create_generator', () => {
  it('stores a generator the app can roll, with sample rolls', async () => {
    const project = seedProject({ generators: [] });
    const json = await call('create_generator', {
      name: 'Taverns',
      template: 'The #adj.capitalize# #noun#',
      rules: [
        {
          key: 'adj',
          entries: ['prancing', { text: 'gilded', weight: 3 }, { text: 'lost', weight: 1 }],
        },
        { key: 'noun', entries: ['Pony'] },
      ],
      icon: 'sports_bar',
      category: 'places',
    });
    expect(json.result?.isError).toBeUndefined();
    const [stored] = project.generators();
    expect(stored).toMatchObject({
      name: 'Taverns',
      icon: 'sports_bar',
      category: 'places',
      description: '',
      template: 'The #adj.capitalize# #noun#',
      rules: [
        {
          key: 'adj',
          entries: [{ text: 'prancing' }, { text: 'gilded', weight: 3 }, { text: 'lost' }],
        },
        { key: 'noun', entries: [{ text: 'Pony' }] },
      ],
    });
    expect(stored.createdAt).toBe(stored.updatedAt);
    const { sample } = structured<{ sample: string[] }>(json);
    expect(sample).toHaveLength(3);
    for (const text of sample) expect(text).toMatch(/^The (Prancing|Gilded|Lost) Pony$/);
  });

  it('defaults the icon and category, and reports warnings', async () => {
    const project = seedProject({ generators: [] });
    const json = await call('create_generator', {
      name: 'Words',
      template: '#word.shout#',
      rules: [{ key: 'word', entries: ['hey'] }],
    });
    expect(json.result?.isError).toBeUndefined();
    expect(project.generators()[0]).toMatchObject({ icon: 'casino', category: 'other' });
    expect(textOf(json)).toContain('"shout" is not a known modifier');
  });

  it('saves nothing when the generator cannot be rolled', async () => {
    const project = seedProject({ generators: [] });
    const json = await call('create_generator', {
      name: 'Loop',
      template: '#a#',
      rules: [{ key: 'a', entries: ['#a#'] }],
    });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('always refers back to itself');
    expect(project.generators()).toHaveLength(0);
  });

  it.each([
    [{ rules: 'x' }, 'rules must be an array'],
    [{ rules: [{ entries: [] }] }, 'rules[0] must be {"key"'],
    [{ rules: [{ key: '1st', entries: [] }] }, 'must start with a letter'],
    [{ rules: [{ key: 'a', entries: 'x' }] }, 'rules[0].entries must be an array'],
    [{ rules: [{ key: 'a', entries: [5] }] }, 'must be a string or {"text"'],
    [
      { rules: [{ key: 'a', entries: [{ text: 'x', weight: -1 }] }] },
      'weight must be a positive number',
    ],
    [{ rules: [{ key: 'a', entries: ['x'.repeat(2001)] }] }, 'is too long'],
    [{ icon: 'Not An Icon' }, 'must be a Material icon name'],
    [{ template: '' }, 'template is required'],
  ])('refuses bad input %#', async (overrides, message) => {
    seedProject({ generators: [] });
    const json = await call('create_generator', {
      name: 'G',
      template: '#a#',
      rules: [{ key: 'a', entries: ['x'] }],
      ...overrides,
    });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain(message);
  });

  it('caps the number of rules and entries', async () => {
    seedProject({ generators: [] });
    const manyRules = Array.from({ length: 201 }, (_, i) => ({ key: `r${i}`, entries: ['x'] }));
    expect(
      textOf(await call('create_generator', { name: 'G', template: '#r0#', rules: manyRules }))
    ).toContain('at most 200 rules');
    const manyEntries = [{ key: 'a', entries: Array.from({ length: 10_001 }, () => 'x') }];
    expect(
      textOf(await call('create_generator', { name: 'G', template: '#a#', rules: manyEntries }))
    ).toContain('at most 10000 entries');
  });
});

describe('update_generator', () => {
  it('changes fields in place, keeping id and createdAt', async () => {
    const project = seedProject();
    const json = await call('update_generator', {
      generatorId: 'dwarven names',
      name: 'Hill dwarf names',
      rules: [
        { key: 'first', entries: ['Thrain'] },
        { key: 'clan', entries: ['Deepdelver'] },
      ],
      description: '',
      category: '',
      icon: '',
    });
    expect(json.result?.isError).toBeUndefined();
    const [stored] = project.generators();
    expect(stored).toMatchObject({
      id: 'gen-dwarf',
      name: 'Hill dwarf names',
      description: '',
      category: 'other',
      icon: 'casino',
      createdAt: dwarfNames.createdAt,
    });
    expect(stored.updatedAt).not.toBe(dwarfNames.updatedAt);
    expect(structured<{ sample: string[] }>(json).sample).toEqual([
      'Thrain Deepdelver',
      'Thrain Deepdelver',
      'Thrain Deepdelver',
    ]);
  });

  it('refuses an update that breaks the generator, and empty updates', async () => {
    const project = seedProject();
    const json = await call('update_generator', { generatorId: 'gen-dwarf', template: '#nope#' });
    expect(json.result?.isError).toBe(true);
    expect(project.generators()[0].template).toBe('#first# #clan#');
    expect(textOf(await call('update_generator', { generatorId: 'gen-dwarf' }))).toContain(
      'nothing to change'
    );
    expect(
      textOf(await call('update_generator', { generatorId: 'gen-dwarf', name: '' }))
    ).toContain('name cannot be empty');
  });
});

describe('delete_generator', () => {
  it('removes the generator and names the fields that offered it', async () => {
    const project = seedProject({
      schemas: [
        {
          id: 's1',
          name: 'Character',
          tabs: [
            { key: 'basic', fields: [{ key: 'name', label: 'Name', generatorId: 'gen-dwarf' }] },
          ],
        },
      ],
    });
    const json = await call('delete_generator', { generatorId: 'gen-dwarf' });
    expect(structured(json)).toMatchObject({
      success: true,
      deleted: 'gen-dwarf',
      fieldsThatUsedIt: ['Character → Name'],
    });
    expect(textOf(json)).toContain('1 template field offered it');
    expect(project.generators()).toHaveLength(0);
  });
});

// ============================================
// Shared behaviour
// ============================================

describe('duplicates from merged copies', () => {
  it('reads the first row per id and removes the rest on the next write', async () => {
    const copy = { ...dwarfNames, name: 'Second copy' };
    const project = seedProject({ generators: [dwarfNames, copy] });
    const listed = await call('list_generators', {}, READ);
    const { generators } = structured<{ generators: Array<{ name: string }> }>(listed);
    expect(generators.map((g) => g.name)).toEqual(['Dwarven names']);
    expect(project.generators()).toHaveLength(2);

    await call('update_generator', { generatorId: 'gen-dwarf', description: 'Cleaned' });
    expect(project.generators()).toHaveLength(1);
    expect(project.generators()[0]).toMatchObject({
      name: 'Dwarven names',
      description: 'Cleaned',
    });
  });

  it('asks for an id when two rows share a name', async () => {
    seedProject({ generators: [dwarfNames, { ...dwarfNames, id: 'gen-2' }] });
    const json = await call('roll_generator', { generatorId: 'Dwarven names' }, READ);
    expect(textOf(json)).toContain('more than one generator is named');
  });

  it('readRows ignores rows without a string id', () => {
    const doc = new Y.Doc();
    doc.getArray('timeSystems').push([{ id: 1 }, null, { id: 'a' }]);
    expect(readRows(doc, 'timeSystems').map((r) => r.id)).toEqual(['a']);
  });

  it('resolveRow explains an empty library', () => {
    expect(() => resolveRow([], 'x', 'generator', 'list_generators')).toThrow(
      'This project has no generators yet.'
    );
  });
});

describe('on Workers', () => {
  it('sends the change back to the project Durable Object', async () => {
    const server = new Y.Doc();
    server.getArray('generators').push([dwarfNames]);
    spies.push(
      spyOn(YjsWorkerService.prototype, 'getDocumentState').mockImplementation((async () =>
        Y.encodeStateAsUpdate(server)) as never),
      spyOn(YjsWorkerService.prototype, 'applyYjsUpdate').mockImplementation(((
        _docId: string,
        update: string
      ) => {
        Y.applyUpdate(
          server,
          Uint8Array.from(atob(update), (c) => c.codePointAt(0) ?? 0)
        );
        return Promise.resolve();
      }) as never)
    );
    const json = await rpc(
      WRITE,
      'tools/call',
      {
        name: 'create_time_system',
        arguments: { project: 'alice/novel', template: 'mission-day' },
      },
      { env: { YJS_PROJECTS: {} }, authToken: 't' }
    );
    expect(json.result?.isError).toBeUndefined();
    expect(
      server
        .getArray<{ id: string }>('timeSystems')
        .toArray()
        .map((s) => s.id)
    ).toEqual(['mission-day']);
    expect(server.getArray('generators').toArray()).toHaveLength(1);
  });
});
