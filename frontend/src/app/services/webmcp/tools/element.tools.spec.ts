import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { TagService } from '@services/tag/tag.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { xmlFragmentToXmlString } from '@utils/yjs-xml-serializer';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  callTool,
  createProjectStateFake,
  element,
  type ProjectStateFake,
  TEST_PROJECT,
} from '../../../../testing/webmcp-testing';
import { elementTools } from './element.tools';
import { ProjectToolContext } from './project-context';
import type { WebMcpToolDefinition } from './tool';

describe('element tools', () => {
  let state: ProjectStateFake;
  let tools: WebMcpToolDefinition[];
  let navigation: { openElement: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let projects: { updateProject: ReturnType<typeof vi.fn> };
  let exporter: { exportProject: ReturnType<typeof vi.fn> };
  let tags: { hasTag: ReturnType<typeof vi.fn> };
  let newDoc: Y.Doc;

  const ids = (): string[] => state.elements().map(e => e.id);

  beforeEach(() => {
    state = createProjectStateFake([
      element('part1', 'Part One', ElementType.Folder, 0),
      element('ch1', 'Chapter One', ElementType.Item, 1, {
        parentId: 'part1',
        metadata: { role: 'scene', status: 'draft' },
      }),
      element('ch2', 'Chapter Two', ElementType.Item, 1, {
        parentId: 'part1',
      }),
      element('people', 'People', ElementType.Folder, 0),
      element('elena', 'Elena', ElementType.Worldbuilding, 1, {
        parentId: 'people',
        schemaId: 'character',
      }),
      element('notes', 'Notes', ElementType.Item, 0),
    ]);
    navigation = { openElement: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    projects = {
      updateProject: vi.fn((_u, _s, updates) =>
        Promise.resolve({ ...TEST_PROJECT, ...updates })
      ),
    };
    exporter = { exportProject: vi.fn().mockResolvedValue(undefined) };
    tags = { hasTag: vi.fn((id: string) => id === 'elena') };
    newDoc = new Y.Doc();

    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: ElementNavigationService, useValue: navigation },
        {
          provide: LiveDocumentRegistryService,
          useValue: {
            // The fake names the next element "new-<count>".
            getConnectedYDoc: (id: string) =>
              id === 'alice:novel:new-6' ? newDoc : null,
            localEdit$: new Subject<string>(),
          },
        },
        { provide: Router, useValue: router },
        { provide: UnifiedProjectService, useValue: projects },
        { provide: ProjectExportService, useValue: exporter },
        {
          provide: TagService,
          useValue: {
            ...tags,
            getResolvedTagsForElement: () => [
              { definition: { id: 't1', name: 'Draft' } },
            ],
          },
        },
        {
          provide: RelationshipService,
          useValue: {
            getRelationshipCount: () => ({
              outgoing: 1,
              incoming: 0,
              total: 1,
            }),
          },
        },
        {
          provide: WorldbuildingService,
          useValue: {
            getSchemaById: (id: string) =>
              id === 'character' ? { id, name: 'Character' } : null,
          },
        },
      ],
    });
    tools = elementTools(injector, new ProjectToolContext(injector));
  });

  describe('reading', () => {
    it('describes the project', async () => {
      const { data } = await callTool(tools, 'get_project');
      expect(data).toMatchObject({
        username: 'alice',
        slug: 'novel',
        title: 'The Novel',
        canWrite: true,
        elementCounts: { FOLDER: 2, ITEM: 3, WORLDBUILDING: 1 },
      });
    });

    it('fails clearly when no project is open', async () => {
      state.project.set(undefined);
      const { error } = await callTool(tools, 'get_project_tree');
      expect(error).toContain('No project is open');
    });

    it('lists the tree with folder paths and scene details', async () => {
      const { data } = await callTool(tools, 'get_project_tree');
      expect(data.total).toBe(6);
      expect(data.elements[1]).toEqual({
        id: 'ch1',
        name: 'Chapter One',
        type: 'ITEM',
        parentId: 'part1',
        depth: 1,
        path: 'Part One',
        role: 'scene',
        status: 'draft',
      });
    });

    it('lists one folder, to a depth, filtered by type', async () => {
      const { data } = await callTool(tools, 'get_project_tree', {
        parentId: 'people',
      });
      expect(data.elements.map((e: { id: string }) => e.id)).toEqual(['elena']);

      const shallow = await callTool(tools, 'get_project_tree', {
        maxDepth: 0,
        type: 'WORLDBUILDING',
      });
      expect(shallow.data.elements.map((e: { id: string }) => e.id)).toEqual([
        'part1',
        'people',
      ]);
    });

    it('finds elements by name, type and tag', async () => {
      const byName = await callTool(tools, 'search_elements', {
        query: 'chapter',
      });
      expect(byName.data.total).toBe(2);

      const byTag = await callTool(tools, 'search_elements', {
        query: '',
        tagId: 't1',
      });
      expect(byTag.data.elements.map((e: { id: string }) => e.id)).toEqual([
        'elena',
      ]);
    });

    it('gets one element with its children, tags and relationships', async () => {
      const { data } = await callTool(tools, 'get_element', {
        elementId: 'part1',
      });
      expect(data.children.map((c: { id: string }) => c.id)).toEqual([
        'ch1',
        'ch2',
      ]);
      expect(data.tags).toEqual([{ id: 't1', name: 'Draft' }]);
      expect(data.relationships.total).toBe(1);
    });

    it('names an unknown element id', async () => {
      const { error } = await callTool(tools, 'get_element', {
        elementId: 'nope',
      });
      expect(error).toContain('No element with id "nope"');
    });
  });

  describe('creating', () => {
    it('creates a document in a folder with a role', async () => {
      const { data } = await callTool(tools, 'create_element', {
        type: 'ITEM',
        name: 'Chapter Three',
        parentId: 'part1',
        documentKind: 'scene',
        open: true,
      });
      expect(state.createElement).toHaveBeenCalledWith(
        ElementType.Item,
        'Chapter Three',
        expect.objectContaining({ parentId: 'part1', preset: 'scene' })
      );
      expect(data.name).toBe('Chapter Three');
      expect(navigation.openElement).toHaveBeenCalled();
    });

    it('fills a new document from Markdown', async () => {
      await callTool(tools, 'create_element', {
        type: 'ITEM',
        name: 'Prologue',
        content: 'It *began* here.',
      });
      expect(xmlFragmentToXmlString(newDoc.getXmlFragment('prosemirror'))).toBe(
        '<paragraph>It <em>began</em> here.</paragraph>'
      );
    });

    it('creates a map canvas after a sibling', async () => {
      await callTool(tools, 'create_element', {
        type: 'CANVAS',
        name: 'World map',
        afterId: 'notes',
        canvasKind: 'map',
      });
      expect(state.createElement).toHaveBeenCalledWith(
        ElementType.Canvas,
        'World map',
        expect.objectContaining({
          parentId: undefined,
          afterElementId: 'notes',
          preset: 'map',
        })
      );
    });

    it('requires a known template for worldbuilding', async () => {
      const missing = await callTool(tools, 'create_element', {
        type: 'WORLDBUILDING',
        name: 'Marcus',
      });
      expect(missing.error).toContain('needs a schemaId');

      const unknown = await callTool(tools, 'create_element', {
        type: 'WORLDBUILDING',
        name: 'Marcus',
        schemaId: 'dragon',
      });
      expect(unknown.error).toContain('No template');

      const ok = await callTool(tools, 'create_element', {
        type: 'WORLDBUILDING',
        name: 'Marcus',
        schemaId: 'character',
      });
      expect(ok.error).toBeUndefined();
    });

    it('rejects options that do not fit the type', async () => {
      const notFolder = await callTool(tools, 'create_element', {
        type: 'ITEM',
        name: 'Inside a doc',
        parentId: 'notes',
      });
      expect(notFolder.error).toContain('only folders can hold');

      const kind = await callTool(tools, 'create_element', {
        type: 'FOLDER',
        name: 'Folder',
        documentKind: 'scene',
      });
      expect(kind.error).toContain('only apply to ITEM');

      const canvas = await callTool(tools, 'create_element', {
        type: 'ITEM',
        name: 'Doc',
        canvasKind: 'map',
      });
      expect(canvas.error).toContain('only applies to CANVAS');

      const schemaOnDoc = await callTool(tools, 'create_element', {
        type: 'ITEM',
        name: 'Doc',
        schemaId: 'character',
      });
      expect(schemaOnDoc.error).toContain('only applies to WORLDBUILDING');
    });

    it('refuses to change a read-only project', async () => {
      state.canWrite.set(false);
      const { error } = await callTool(tools, 'create_element', {
        type: 'FOLDER',
        name: 'New',
      });
      expect(error).toContain('read access');
      expect(state.createElement).not.toHaveBeenCalled();
    });
  });

  describe('updating', () => {
    it('renames, pins and sets scene details', async () => {
      const { data } = await callTool(tools, 'update_element', {
        elementId: 'ch2',
        name: 'Chapter 2',
        pinned: true,
        role: 'scene',
        format: 'conversation',
        synopsis: 'They argue.',
        status: 'revised',
        wordTarget: 2500,
      });
      expect(state.renameNode).toHaveBeenCalled();
      expect(state.togglePin).toHaveBeenCalledWith('ch2');
      expect(state.setDocumentRole).toHaveBeenCalledWith('ch2', 'scene');
      expect(state.setDocumentFormat).toHaveBeenCalledWith(
        'ch2',
        'conversation'
      );
      expect(state.updateElementMetadata).toHaveBeenCalledWith('ch2', {
        synopsis: 'They argue.',
        status: 'revised',
        wordTarget: '2500',
      });
      expect(data).toMatchObject({ name: 'Chapter 2', pinned: true });
    });

    it('clears a word target with 0 and leaves pinning alone when unchanged', async () => {
      await callTool(tools, 'update_element', {
        elementId: 'ch1',
        wordTarget: 0,
        pinned: false,
      });
      expect(state.updateElementMetadata).toHaveBeenCalledWith('ch1', {
        wordTarget: '',
      });
      expect(state.togglePin).not.toHaveBeenCalled();
    });

    it('rejects document fields on other types and empty names', async () => {
      const folder = await callTool(tools, 'update_element', {
        elementId: 'part1',
        synopsis: 'x',
      });
      expect(folder.error).toContain('only apply to documents');

      const blank = await callTool(tools, 'update_element', {
        elementId: 'part1',
        name: ' ',
      });
      expect(blank.error).toContain('cannot be empty');
    });

    it('updates the project title and description', async () => {
      await callTool(tools, 'update_project', {
        title: 'Renamed',
        description: 'New blurb',
      });
      expect(projects.updateProject).toHaveBeenCalledWith('alice', 'novel', {
        title: 'Renamed',
        description: 'New blurb',
      });
      expect(state.updateProject).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Renamed' })
      );

      const nothing = await callTool(tools, 'update_project');
      expect(nothing.error).toContain('Give a title');
    });
  });

  describe('moving', () => {
    it('moves a document into another folder at a position', async () => {
      await callTool(tools, 'move_element', {
        elementId: 'notes',
        parentId: 'part1',
        position: 1,
      });
      expect(ids()).toEqual([
        'part1',
        'ch1',
        'notes',
        'ch2',
        'people',
        'elena',
      ]);
      const notes = state.elements().find(e => e.id === 'notes')!;
      expect(notes.level).toBe(1);
      expect(notes.parentId).toBe('part1');
      expect(state.setExpanded).toHaveBeenCalledWith('part1', true);
    });

    it('moves to the end of a folder by default', async () => {
      await callTool(tools, 'move_element', {
        elementId: 'ch1',
        parentId: 'people',
      });
      expect(ids()).toEqual([
        'part1',
        'ch2',
        'people',
        'elena',
        'ch1',
        'notes',
      ]);
    });

    it('moves a folder with its contents to the root', async () => {
      await callTool(tools, 'move_element', {
        elementId: 'people',
        parentId: null,
        position: 0,
      });
      expect(ids()).toEqual([
        'people',
        'elena',
        'part1',
        'ch1',
        'ch2',
        'notes',
      ]);
    });

    it('moves to the end of the root', async () => {
      await callTool(tools, 'move_element', {
        elementId: 'ch1',
        parentId: null,
      });
      expect(ids().at(-1)).toBe('ch1');
      expect(state.elements().at(-1)!.level).toBe(0);
    });

    it('refuses to move a folder into itself', async () => {
      const { error } = await callTool(tools, 'move_element', {
        elementId: 'part1',
        parentId: 'part1',
      });
      expect(error).toContain('into itself');
    });
  });

  describe('deleting and navigating', () => {
    it('deletes an element with its contents', async () => {
      const { data } = await callTool(tools, 'delete_element', {
        elementId: 'part1',
      });
      expect(data.deleted.map((e: { id: string }) => e.id)).toEqual([
        'part1',
        'ch1',
        'ch2',
      ]);
      expect(state.closeTabByElementId).toHaveBeenCalledWith('part1');
      expect(ids()).toEqual(['people', 'elena', 'notes']);
    });

    it('opens an element in a tab', async () => {
      await callTool(tools, 'open_element', { elementId: 'elena' });
      expect(navigation.openElement).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'elena' })
      );
    });

    it('opens project views', async () => {
      await callTool(tools, 'open_view', { view: 'media' });
      expect(state.openSystemTab).toHaveBeenCalledWith('media');
      expect(state.selectTab).toHaveBeenCalledWith(1);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'alice',
        'novel',
        'media',
      ]);

      await callTool(tools, 'open_view', { view: 'home' });
      expect(state.openHomeTab).toHaveBeenCalled();
    });

    it('closes tabs by element or index', async () => {
      state.openTabs.set([{ id: 'a', name: 'A', type: 'document' }]);
      await callTool(tools, 'close_tab', { elementId: 'ch1' });
      expect(state.closeTabByElementId).toHaveBeenCalledWith('ch1');

      await callTool(tools, 'close_tab', { index: 0 });
      expect(state.closeTab).toHaveBeenCalledWith(0);

      expect(
        (await callTool(tools, 'close_tab', { index: 4 })).error
      ).toContain('no tab 4');
      expect((await callTool(tools, 'close_tab')).error).toContain(
        'Give elementId or index'
      );
    });

    it('exports the project archive', async () => {
      const { data } = await callTool(tools, 'export_project');
      expect(exporter.exportProject).toHaveBeenCalled();
      expect(data.ok).toBe(true);
    });
  });
});
