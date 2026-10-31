import { Injector } from '@angular/core';
import {
  applyCanvasEdit,
  type CanvasContents,
  type CanvasEdit,
  emptyCanvasContents,
} from '@inkweld/canvas';
import { ElementType } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { CoverSourceService } from '@services/project/cover-source.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
} from '../../../../testing/webmcp-testing';
import { canvasTools } from './canvas.tools';
import { ProjectToolContext } from './project-context';
import type { WebMcpToolDefinition } from './tool';

const LAYER = {
  id: 'l1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

describe('canvas tools', () => {
  let tools: WebMcpToolDefinition[];
  let state: ReturnType<typeof createProjectStateFake> & {
    getCanvasContents: ReturnType<typeof vi.fn>;
    applyCanvasEdit: ReturnType<typeof vi.fn>;
  };
  let canvases: Map<string, CanvasContents>;
  let relationships: {
    getTypeById: ReturnType<typeof vi.fn>;
    addRawType: ReturnType<typeof vi.fn>;
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationships: ReturnType<typeof vi.fn>;
  };
  let coverSource: { notifyCanvasChanged: ReturnType<typeof vi.fn> };
  let hasMedia: ReturnType<typeof vi.fn>;
  let fetchMissingMedia: ReturnType<typeof vi.fn>;
  let mode: string;

  beforeEach(() => {
    canvases = new Map();
    hasMedia = vi.fn().mockResolvedValue(false);
    fetchMissingMedia = vi.fn().mockResolvedValue(false);
    mode = 'server';
    state = Object.assign(
      createProjectStateFake([
        element('map', 'World Map', ElementType.Canvas),
        element('ch1', 'Chapter One', ElementType.Item),
        element('town', 'Town', ElementType.Worldbuilding),
      ]),
      {
        getCanvasContents: vi.fn((id: string) => canvases.get(id) ?? null),
        applyCanvasEdit: vi.fn((id: string, edit: CanvasEdit) => {
          canvases.set(
            id,
            applyCanvasEdit(canvases.get(id) ?? emptyCanvasContents(), edit)
          );
        }),
      }
    );
    relationships = {
      getTypeById: vi.fn(() => ({ id: 'canvas-pin' })),
      addRawType: vi.fn(),
      addRelationship: vi.fn(
        (_source: string, _target: string, _type: string, options) => ({
          id: (options as { id: string }).id,
        })
      ),
      removeRelationships: vi.fn(),
    };
    coverSource = { notifyCanvasChanged: vi.fn() };
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: RelationshipService, useValue: relationships },
        { provide: CoverSourceService, useValue: coverSource },
        { provide: LocalStorageService, useValue: { hasMedia } },
        { provide: MediaSyncService, useValue: { fetchMissingMedia } },
        { provide: SetupService, useValue: { getMode: () => mode } },
      ],
    });
    tools = canvasTools(injector, new ProjectToolContext(injector));
  });

  it('marks reading as read-only and editing as a write', () => {
    const byName = new Map(tools.map(tool => [tool.name, tool]));
    expect(byName.get('get_canvas')?.readOnly).toBe(true);
    expect(byName.get('edit_canvas')?.writes).toBe(true);
  });

  describe('get_canvas', () => {
    it('reads a canvas nobody has drawn on', async () => {
      const { data, error } = await callTool(tools, 'get_canvas', {
        elementId: 'map',
      });
      expect(error).toBeUndefined();
      expect(data).toMatchObject({
        elementId: 'map',
        elementName: 'World Map',
        background: '#FFFFFF',
        layers: [],
        objects: [],
      });
    });

    it('reads synced contents over its metadata', async () => {
      canvases.set('map', { layers: [LAYER], objects: [] });
      state.updateElementMetadata('map', {
        canvasConfig: JSON.stringify({ layers: [], objects: [] }),
      });
      const { data } = await callTool(tools, 'get_canvas', {
        elementId: 'map',
      });
      expect(data.layers).toEqual([LAYER]);
    });

    it('reads a canvas that only exists in its metadata', async () => {
      state.updateElementMetadata('map', {
        canvasConfig: JSON.stringify({
          layers: [LAYER],
          objects: [],
          background: '#123456',
        }),
      });
      const { data } = await callTool(tools, 'get_canvas', {
        elementId: 'map',
      });
      expect(data.background).toBe('#123456');
    });

    it('passes its arguments on, and reports what it refuses', async () => {
      canvases.set('map', { layers: [LAYER], objects: [] });
      const { error } = await callTool(tools, 'get_canvas', {
        elementId: 'map',
        limit: 0,
      });
      expect(error).toContain('limit');
    });

    it('refuses anything but a canvas', async () => {
      const notCanvas = await callTool(tools, 'get_canvas', {
        elementId: 'ch1',
      });
      expect(notCanvas.error).toContain('not a CANVAS');
      const missing = await callTool(tools, 'get_canvas', {
        elementId: 'nope',
      });
      expect(missing.error).toContain('No element');
    });
  });

  describe('edit_canvas', () => {
    it('writes the change as an external edit, so an open tab shows it', async () => {
      const { data, error } = await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ id: 'title', type: 'text', text: 'Northreach' }],
      });

      expect(error).toBeUndefined();
      expect(data).toMatchObject({
        success: true,
        elementId: 'map',
        created: ['title'],
        objectCount: 1,
        undo: { delete: ['title'] },
      });
      expect(state.applyCanvasEdit).toHaveBeenCalledWith(
        'map',
        expect.objectContaining({ upserts: [expect.anything()] }),
        { external: true }
      );
      expect(canvases.get('map')?.objects[0]).toMatchObject({ id: 'title' });
    });

    describe('placing an image', () => {
      const place = (src: string) =>
        callTool(tools, 'edit_canvas', {
          elementId: 'map',
          add: [{ id: 'img', type: 'image', src, width: 10, height: 10 }],
        });

      it('accepts one this browser has, without asking the server', async () => {
        hasMedia.mockResolvedValue(true);

        const { error } = await place('media://img-1.png');

        expect(error).toBeUndefined();
        expect(hasMedia).toHaveBeenCalledWith(expect.any(String), 'img-1');
        expect(fetchMissingMedia).not.toHaveBeenCalled();
      });

      it('fetches one this browser does not have yet', async () => {
        fetchMissingMedia.mockResolvedValue(true);

        const { error } = await place('media://img-1.png');

        expect(error).toBeUndefined();
        expect(fetchMissingMedia).toHaveBeenCalledWith(
          expect.any(String),
          'img-1.png'
        );
      });

      it('refuses one that is nowhere, writing nothing', async () => {
        const { error } = await place('media://typo.png');

        expect(error).toContain('typo.png');
        expect(state.applyCanvasEdit).not.toHaveBeenCalled();
      });

      it('does not ask a server when there is none', async () => {
        mode = 'local';

        const { error } = await place('media://typo.png');

        expect(error).toContain('typo.png');
        expect(fetchMissingMedia).not.toHaveBeenCalled();
      });

      it('cannot fetch an id-only reference, which names no file', async () => {
        const { error } = await place('media:img-1');

        expect(error).toContain('media:img-1');
        expect(hasMedia).toHaveBeenCalledWith(expect.any(String), 'img-1');
        expect(fetchMissingMedia).not.toHaveBeenCalled();
      });
    });

    it('tells the live cover about the new contents', async () => {
      await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ id: 'a', type: 'pin', label: 'a' }],
      });
      expect(coverSource.notifyCanvasChanged).toHaveBeenCalledWith(
        'map',
        canvases.get('map')
      );
    });

    it('seeds a canvas that only exists in its metadata before editing', async () => {
      const object = {
        id: 'old',
        layerId: 'l1',
        type: 'pin',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        label: 'Old',
        icon: 'place',
        color: '#000',
      };
      state.updateElementMetadata('map', {
        canvasConfig: JSON.stringify({ layers: [LAYER], objects: [object] }),
      });

      await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ id: 'new', type: 'pin', label: 'New' }],
      });

      expect(state.applyCanvasEdit).toHaveBeenCalledTimes(2);
      expect(canvases.get('map')?.objects.map(o => o.id)).toEqual([
        'old',
        'new',
      ]);
    });

    it('writes nothing when any part of the request is invalid', async () => {
      const { error } = await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ type: 'pin', label: 'a' }],
        delete: ['nope'],
      });
      expect(error).toContain('no object with id "nope"');
      expect(state.applyCanvasEdit).not.toHaveBeenCalled();
      expect(coverSource.notifyCanvasChanged).not.toHaveBeenCalled();
    });

    it('refuses while the user can only read', async () => {
      state.canWrite.set(false);
      const { error } = await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ type: 'pin', label: 'a' }],
      });
      expect(error).toContain('read access');
      expect(state.applyCanvasEdit).not.toHaveBeenCalled();
    });

    it('backs a link with the relationship its object refers to', async () => {
      await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ id: 'p', type: 'pin', label: 'Town', linkedElementId: 'town' }],
      });

      const pin = canvases.get('map')?.objects[0] as unknown as {
        relationshipId: string;
      };
      expect(relationships.addRelationship).toHaveBeenCalledWith(
        'map',
        'town',
        'canvas-pin',
        { id: pin.relationshipId }
      );
    });

    it('refuses a link to an element that does not exist', async () => {
      const { error } = await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        add: [{ type: 'pin', label: 'a', linkedElementId: 'nope' }],
      });
      expect(error).toContain('no element');
    });

    it('removes the relationship of a deleted pin', async () => {
      canvases.set('map', {
        layers: [LAYER],
        objects: [
          {
            id: 'p',
            layerId: 'l1',
            type: 'pin',
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            label: 'Town',
            icon: 'place',
            color: '#000',
            linkedElementId: 'town',
            relationshipId: 'r1',
          },
        ],
      });
      await callTool(tools, 'edit_canvas', {
        elementId: 'map',
        delete: ['p'],
      });
      expect(relationships.removeRelationships).toHaveBeenCalledWith(['r1']);
    });
  });
});
