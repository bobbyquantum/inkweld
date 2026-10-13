import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementRefService } from '@components/element-ref/element-ref.service';
import { extendedSchema as schema } from '@components/element-ref/extended-schema';
import { type Element, ElementType } from '@inkweld/index';
import { TranslocoService } from '@jsverse/transloco';
import { type ElementSearchResult } from '@models/element-ref.model';
import { AppearanceService } from '@services/worldbuilding/appearance.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationService } from './conversation.service';
import { ProjectStateService } from './project-state.service';

function element(
  id: string,
  name: string,
  schemaId?: string,
  type = ElementType.Worldbuilding
): Element {
  return {
    id,
    name,
    type,
    schemaId,
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 0,
    metadata: {},
  };
}

function result(el: Element): ElementSearchResult {
  return {
    element: { id: el.id, name: el.name, type: el.type },
    icon: 'person',
    path: el.name,
    score: 0,
  };
}

describe('ConversationService', () => {
  const elements = signal<Element[]>([]);
  const project = signal<{ username: string; slug: string } | null>({
    username: 'alice',
    slug: 'novel',
  });
  const getIdentityData = vi.fn();
  const resolveImageReference = vi.fn();
  const searchElements = vi.fn();
  let service: ConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    elements.set([
      element('el-mara', 'Mara Vance', 'character-v1'),
      element('el-tomas', 'Tomas', 'character-v1'),
      element('el-port', 'Port Ellis', 'location-v1'),
      element('doc-1', 'Mara Vance', undefined, ElementType.Item),
    ]);
    project.set({ username: 'alice', slug: 'novel' });
    TestBed.configureTestingModule({
      providers: [
        ConversationService,
        { provide: ProjectStateService, useValue: { elements, project } },
        { provide: WorldbuildingService, useValue: { getIdentityData } },
        { provide: AppearanceService, useValue: { resolveImageReference } },
        { provide: ElementRefService, useValue: { searchElements } },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => `t:${key}` },
        },
      ],
    });
    service = TestBed.inject(ConversationService);
  });

  it('shows the linked element’s current name, else the stored one', () => {
    expect(service.displayName({ id: 'el-mara', name: 'Mara' })).toBe(
      'Mara Vance'
    );
    expect(service.displayName({ id: 'gone', name: 'Old name' })).toBe(
      'Old name'
    );
    expect(service.displayName({ id: null, name: 'Guard' })).toBe('Guard');
  });

  it('finds a typed speaker in the cast, then among elements, else unlinked', () => {
    const doc = schema.nodes['doc'].create(null, [
      schema.nodes['speech'].create(
        { speakerName: 'Ana' },
        schema.nodes['dialogue'].create()
      ),
    ]);
    expect(service.findSpeaker('ana', doc)).toEqual({ id: null, name: 'Ana' });
    expect(service.findSpeaker('mara vance', doc)).toEqual({
      id: 'el-mara',
      name: 'Mara Vance',
    });
    expect(service.findSpeaker(' Guard ', null)).toEqual({
      id: null,
      name: 'Guard',
    });
  });

  it('loads a portrait once per speaker and caches it', async () => {
    getIdentityData.mockResolvedValue({ image: 'media://img.png' });
    resolveImageReference.mockResolvedValue('blob:img');
    const speaker = { id: 'el-mara', name: 'Mara' };
    await expect(service.avatarUrl(speaker)).resolves.toBe('blob:img');
    await service.avatarUrl(speaker);
    expect(getIdentityData).toHaveBeenCalledTimes(1);
    expect(getIdentityData).toHaveBeenCalledWith('el-mara', 'alice', 'novel');

    service.clearAvatarCache();
    await service.avatarUrl(speaker);
    expect(getIdentityData).toHaveBeenCalledTimes(2);
  });

  it('has no portrait for unlinked speakers, missing images or failures', async () => {
    await expect(service.avatarUrl({ id: null, name: 'Ana' })).resolves.toBe(
      null
    );
    getIdentityData.mockResolvedValueOnce({});
    await expect(
      service.avatarUrl({ id: 'el-tomas', name: 'T' })
    ).resolves.toBe(null);
    getIdentityData.mockRejectedValueOnce(new Error('offline'));
    await expect(service.avatarUrl({ id: 'el-port', name: 'P' })).resolves.toBe(
      null
    );
    project.set(null);
    await expect(service.avatarUrl({ id: 'el-mara', name: 'M' })).resolves.toBe(
      null
    );
  });

  it('searches worldbuilding elements, ranking the cast’s schemas first', () => {
    const [mara, tomas, port] = elements();
    searchElements.mockReturnValue([result(port), result(tomas), result(mara)]);

    expect(service.searchSpeakers('a')).toHaveLength(3);
    expect(searchElements).toHaveBeenLastCalledWith('a', {
      types: [ElementType.Worldbuilding],
      limit: 8,
    });

    const ranked = service.searchSpeakers('', 2, ['el-mara']);
    expect(ranked.map(r => r.element.id)).toEqual(['el-tomas', 'el-mara']);
  });

  it('wires plugin callbacks to the service', () => {
    const options = service.pluginOptions();
    expect(options.label('offscreen')).toBe('t:editor.conversation.offscreen');
    expect(options.displayName({ id: 'el-tomas', name: 'x' })).toBe('Tomas');
    expect(options.findSpeaker('Tomas', null as never)).toEqual({
      id: 'el-tomas',
      name: 'Tomas',
    });
    const event = {
      pos: 3,
      speaker: { id: null, name: 'A' },
      rect: {} as DOMRect,
    };
    options.onSpeakerClick(event);
    expect(service.speakerClick()).toBe(event);
    void options.avatarUrl({ id: null, name: 'A' });
  });
});
