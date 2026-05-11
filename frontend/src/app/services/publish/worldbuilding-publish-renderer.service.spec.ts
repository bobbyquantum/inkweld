import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PublishPlanItemType,
  type WorldbuildingItem,
} from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { WorldbuildingPublishRendererService } from './worldbuilding-publish-renderer.service';

/**
 * Builds a `WorldbuildingItem` with sensible defaults so each test only has
 * to specify the fields it cares about.
 */
function makeItem(
  overrides: Partial<WorldbuildingItem> = {}
): WorldbuildingItem {
  return {
    id: 'wb-1',
    type: PublishPlanItemType.Worldbuilding,
    categories: [],
    format: 'appendix',
    title: 'Worldbuilding',
    ...overrides,
  };
}

const characterSchema: ElementTypeSchema = {
  id: 'character',
  name: 'Character',
  icon: 'person',
  description: 'A character',
  version: 1,
  tabs: [
    {
      key: 'identity',
      label: 'Identity',
      order: 1,
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'age', label: 'Age', type: 'number' },
      ],
    },
    {
      key: 'stats',
      label: 'Stats',
      order: 2,
      fields: [
        {
          key: 'physical',
          label: 'Physical',
          type: 'group',
          isNested: true,
          nestedFields: [
            { key: 'height', label: 'Height', type: 'text' },
            { key: 'weight', label: 'Weight', type: 'text' },
          ],
        },
      ],
    },
  ],
};

describe('WorldbuildingPublishRendererService', () => {
  let service: WorldbuildingPublishRendererService;
  let projectState: { project: ReturnType<typeof vi.fn> };
  let worldbuilding: {
    getAllSchemas: ReturnType<typeof vi.fn>;
    getSchemaForElement: ReturnType<typeof vi.fn>;
    getWorldbuildingData: ReturnType<typeof vi.fn>;
    getIdentityData: ReturnType<typeof vi.fn>;
  };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    projectState = {
      project: vi
        .fn()
        .mockReturnValue({ username: 'demouser', slug: 'demo-project' }),
    };
    worldbuilding = {
      getAllSchemas: vi.fn().mockReturnValue([characterSchema]),
      getSchemaForElement: vi.fn().mockResolvedValue(characterSchema),
      getWorldbuildingData: vi.fn().mockResolvedValue({}),
      getIdentityData: vi.fn().mockResolvedValue({}),
    };
    logger = { warn: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        WorldbuildingPublishRendererService,
        { provide: ProjectStateService, useValue: projectState },
        { provide: WorldbuildingService, useValue: worldbuilding },
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(WorldbuildingPublishRendererService);
  });

  function wbElement(id: string, name: string) {
    return {
      id,
      name,
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 0,
    } as unknown as Parameters<
      WorldbuildingPublishRendererService['renderItem']
    >[1][number];
  }

  it('returns empty array when no project loaded', async () => {
    projectState.project.mockReturnValue(null);
    const out = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(out).toEqual([]);
  });

  it('skips non-worldbuilding elements', async () => {
    const out = await service.renderItem(makeItem(), [
      {
        id: 'e1',
        name: 'A doc',
        type: ElementType.Item,
        parentId: null,
        order: 0,
      } as unknown as Parameters<
        WorldbuildingPublishRendererService['renderItem']
      >[1][number],
    ]);
    expect(out).toEqual([]);
  });

  it('renders a single entry with identity, image, and tabs', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({
      name: 'Alice',
      age: 30,
      physical: { height: '170cm', weight: '60kg' },
    });
    worldbuilding.getIdentityData.mockResolvedValue({
      image: 'data:image/png;base64,abc',
      description: 'A protagonist',
    });

    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);

    expect(entry.title).toBe('Alice');
    expect(entry.schemaId).toBe('character');
    expect(entry.schemaLabel).toBe('Character');
    expect(entry.layout).toBe('card');
    expect(entry.description).toBe('A protagonist');
    expect(entry.imageRef).toBe('data:image/png;base64,abc');
    expect(entry.tabs.length).toBe(2);
    const identityFields = entry.tabs[0].fields.map(f => f.key);
    expect(identityFields).toEqual(['name', 'age']);
    const statsFields = entry.tabs[1].fields.map(f => f.key);
    expect(statsFields).toEqual(['physical.height', 'physical.weight']);
  });

  it('honors the requested layout', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({ name: 'Bob' });
    const [entry] = await service.renderItem(makeItem({ layout: 'detail' }), [
      wbElement('e1', 'Bob'),
    ]);
    expect(entry.layout).toBe('detail');
  });

  it('omits identity image and description when includeImages/includeIdentity are false', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({ name: 'Bob' });
    worldbuilding.getIdentityData.mockResolvedValue({
      image: 'data:image/png;base64,xxx',
      description: 'desc',
    });
    const [entry] = await service.renderItem(
      makeItem({ includeIdentity: false, includeImages: false }),
      [wbElement('e1', 'Bob')]
    );
    expect(entry.description).toBeUndefined();
    expect(entry.imageRef).toBeUndefined();
  });

  it('filters by category (case-insensitive, matches schema id or label)', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({ name: 'Alice' });
    const matched = await service.renderItem(
      makeItem({ categories: ['CHARACTER'] }),
      [wbElement('e1', 'Alice')]
    );
    expect(matched).toHaveLength(1);

    const noMatch = await service.renderItem(
      makeItem({ categories: ['location'] }),
      [wbElement('e1', 'Alice')]
    );
    expect(noMatch).toHaveLength(0);
  });

  it('respects includedFieldKeys / excludedFieldKeys', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({
      name: 'Alice',
      age: 30,
      physical: { height: '170', weight: '60' },
    });

    const includeOnly = await service.renderItem(
      makeItem({ includedFieldKeys: ['name'] }),
      [wbElement('e1', 'Alice')]
    );
    expect(includeOnly[0].tabs.flatMap(t => t.fields).map(f => f.key)).toEqual([
      'name',
    ]);

    const excluded = await service.renderItem(
      makeItem({ excludedFieldKeys: ['age', 'physical.weight'] }),
      [wbElement('e1', 'Alice')]
    );
    const remainingKeys = excluded[0].tabs
      .flatMap(t => t.fields)
      .map(f => f.key);
    expect(remainingKeys).toContain('name');
    expect(remainingKeys).toContain('physical.height');
    expect(remainingKeys).not.toContain('age');
    expect(remainingKeys).not.toContain('physical.weight');
  });

  it('drops blank fields by default and keeps them when includeEmptyFields is true', async () => {
    worldbuilding.getWorldbuildingData.mockResolvedValue({
      name: 'Alice',
      age: '',
    });
    const def = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(def[0].tabs[0].fields.map(f => f.key)).toEqual(['name']);

    const withEmpty = await service.renderItem(
      makeItem({ includeEmptyFields: true }),
      [wbElement('e1', 'Alice')]
    );
    expect(withEmpty[0].tabs[0].fields.map(f => f.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('falls back to a synthetic "fields" tab when no schema is available', async () => {
    worldbuilding.getSchemaForElement.mockResolvedValue(null);
    worldbuilding.getWorldbuildingData.mockResolvedValue({
      first_name: 'Alice',
      _hidden: 'no',
      lastModified: 123,
    });

    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(entry.schemaId).toBeUndefined();
    expect(entry.tabs).toHaveLength(1);
    expect(entry.tabs[0].key).toBe('fields');
    expect(entry.tabs[0].fields.map(f => f.key)).toEqual(['first_name']);
    expect(entry.tabs[0].fields[0].label).toBe('First Name');
  });

  it('omits the synthetic tab when there are no renderable fields', async () => {
    worldbuilding.getSchemaForElement.mockResolvedValue(null);
    worldbuilding.getWorldbuildingData.mockResolvedValue({});
    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(entry.tabs).toHaveLength(0);
  });

  it('warns and continues when schema load throws', async () => {
    worldbuilding.getSchemaForElement.mockRejectedValue(new Error('boom'));
    worldbuilding.getWorldbuildingData.mockResolvedValue({ x: 'y' });
    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(logger.warn).toHaveBeenCalled();
    // No schema → synthetic tab from raw data.
    expect(entry.tabs[0].key).toBe('fields');
  });

  it('warns and treats data as empty when data load throws', async () => {
    worldbuilding.getWorldbuildingData.mockRejectedValue(new Error('nope'));
    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(logger.warn).toHaveBeenCalled();
    expect(entry.tabs).toHaveLength(0);
  });

  it('ignores identity load failures silently', async () => {
    worldbuilding.getIdentityData.mockRejectedValue(new Error('no identity'));
    worldbuilding.getWorldbuildingData.mockResolvedValue({ name: 'Alice' });
    const [entry] = await service.renderItem(makeItem(), [
      wbElement('e1', 'Alice'),
    ]);
    expect(entry.imageRef).toBeUndefined();
    expect(entry.description).toBeUndefined();
  });

  describe('formatFieldValue (via renderItem)', () => {
    async function valueFor(value: unknown): Promise<string> {
      worldbuilding.getSchemaForElement.mockResolvedValue(null);
      worldbuilding.getWorldbuildingData.mockResolvedValue({ x: value });
      const [entry] = await service.renderItem(
        makeItem({ includeEmptyFields: true }),
        [wbElement('e1', 'Alice')]
      );
      return entry.tabs[0]?.fields.find(f => f.key === 'x')?.displayValue ?? '';
    }

    it('renders strings, numbers, booleans, bigints', async () => {
      expect(await valueFor('hello')).toBe('hello');
      expect(await valueFor(42)).toBe('42');
      expect(await valueFor(true)).toBe('Yes');
      expect(await valueFor(false)).toBe('No');
      expect(await valueFor(BigInt(7))).toBe('7');
    });

    it('renders arrays joined by commas, keeping 0 and false', async () => {
      expect(await valueFor([1, 'two', false, 0])).toBe('1, two, No, 0');
    });

    it('drops null/undefined entries from arrays without dropping falsy', async () => {
      expect(await valueFor([null, 'a', undefined, 'b'])).toBe('a, b');
    });

    it('returns empty for plain objects, null, undefined, symbols', async () => {
      expect(await valueFor({})).toBe('');
      expect(await valueFor(null)).toBe('');
      expect(await valueFor(undefined)).toBe('');
      expect(await valueFor(Symbol('s'))).toBe('');
    });
  });
});
