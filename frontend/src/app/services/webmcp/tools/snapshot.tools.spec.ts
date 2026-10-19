import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { YDocAccessService } from '@services/cloud-sync/ydoc-access.service';
import { SetupService } from '@services/core/setup.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { UnifiedSnapshotService } from '@services/project/unified-snapshot.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { xmlFragmentToXmlString } from '@utils/yjs-xml-serializer';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  callTool,
  createProjectStateFake,
  element,
} from '../../../../testing/webmcp-testing';
import { ProjectToolContext } from './project-context';
import { snapshotTools } from './snapshot.tools';
import type { WebMcpToolDefinition } from './tool';

describe('snapshot tools', () => {
  let tools: WebMcpToolDefinition[];
  let doc: Y.Doc;
  let snapshots: Record<string, ReturnType<typeof vi.fn>>;
  let getWorldbuildingData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const state = createProjectStateFake([
      element('ch1', 'Chapter One', ElementType.Item),
      element('ch2', 'Chapter Two', ElementType.Item),
      element('elena', 'Elena', ElementType.Worldbuilding),
      element('folder', 'Folder', ElementType.Folder),
    ]);
    doc = new Y.Doc();
    snapshots = {
      listSnapshots: vi.fn().mockResolvedValue([
        {
          id: 's1',
          documentId: 'alice:novel:ch1',
          name: 'Before edit',
          wordCount: 10,
          createdAt: '2026-10-01',
        },
        {
          id: 's2',
          documentId: 'alice:novel:ch2',
          name: 'Other doc',
          createdAt: '2026-10-01',
        },
      ]),
      createSnapshot: vi
        .fn()
        .mockResolvedValue({ id: 's3', name: 'Checkpoint', wordCount: 4 }),
      getSnapshotForRestore: vi.fn((id: string) =>
        Promise.resolve(
          {
            s1: {
              id: 's1',
              documentId: 'alice:novel:ch1',
              name: 'Before edit',
              xmlContent: '<paragraph>Old text</paragraph>',
            },
            s2: {
              id: 's2',
              documentId: 'alice:novel:ch2',
              name: 'Other doc',
              xmlContent: '<paragraph>x</paragraph>',
            },
            empty: {
              id: 'empty',
              documentId: 'alice:novel:ch1',
              name: 'Empty',
              xmlContent: '',
            },
          }[id]
        )
      ),
      restoreFromSnapshot: vi.fn().mockResolvedValue(true),
    };
    getWorldbuildingData = vi.fn().mockResolvedValue({});
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: UnifiedSnapshotService, useValue: snapshots },
        { provide: WorldbuildingService, useValue: { getWorldbuildingData } },
        {
          provide: LiveDocumentRegistryService,
          useValue: {
            getConnectedYDoc: (id: string) =>
              id === 'alice:novel:ch1' ? doc : null,
            localEdit$: new Subject<string>(),
          },
        },
        { provide: SetupService, useValue: { getMode: () => 'local' } },
        { provide: YDocAccessService, useValue: {} },
      ],
    });
    tools = snapshotTools(injector, new ProjectToolContext(injector));
  });

  it("lists only the element's own snapshots", async () => {
    const { data } = await callTool(tools, 'list_snapshots', {
      elementId: 'ch1',
    });
    expect(snapshots['listSnapshots']).toHaveBeenCalledWith('alice:novel:ch1');
    expect(data.snapshots.map((s: { id: string }) => s.id)).toEqual(['s1']);
  });

  it('files worldbuilding snapshots under the element id', async () => {
    await callTool(tools, 'list_snapshots', { elementId: 'elena' });
    expect(snapshots['listSnapshots']).toHaveBeenCalledWith('elena');
  });

  it('refuses elements without snapshots', async () => {
    const { error } = await callTool(tools, 'list_snapshots', {
      elementId: 'folder',
    });
    expect(error).toContain('Only documents');
  });

  it('creates snapshots of documents and worldbuilding', async () => {
    const { data } = await callTool(tools, 'create_snapshot', {
      elementId: 'ch1',
      name: 'Checkpoint',
      description: 'Before the rewrite',
    });
    expect(snapshots['createSnapshot']).toHaveBeenCalledWith(
      'alice:novel:ch1',
      'Checkpoint',
      'Before the rewrite'
    );
    expect(data).toEqual({ id: 's3', name: 'Checkpoint', wordCount: 4 });

    await callTool(tools, 'create_snapshot', {
      elementId: 'elena',
      name: 'Checkpoint',
    });
    expect(getWorldbuildingData).toHaveBeenCalledWith(
      'elena',
      'alice',
      'novel'
    );
  });

  it('restores a document snapshot through the document', async () => {
    const { data } = await callTool(tools, 'restore_snapshot', {
      elementId: 'ch1',
      snapshotId: 's1',
    });
    expect(xmlFragmentToXmlString(doc.getXmlFragment('prosemirror'))).toBe(
      '<paragraph>Old text</paragraph>'
    );
    expect(data.name).toBe('Before edit');
  });

  it('checks the snapshot before restoring', async () => {
    const other = await callTool(tools, 'restore_snapshot', {
      elementId: 'ch1',
      snapshotId: 's2',
    });
    expect(other.error).toContain('belongs to another element');

    const missing = await callTool(tools, 'restore_snapshot', {
      elementId: 'ch1',
      snapshotId: 'nope',
    });
    expect(missing.error).toContain('No snapshot');

    const empty = await callTool(tools, 'restore_snapshot', {
      elementId: 'ch1',
      snapshotId: 'empty',
    });
    expect(empty.error).toContain('no content');
  });

  it('restores worldbuilding through the snapshot service', async () => {
    await callTool(tools, 'restore_snapshot', {
      elementId: 'elena',
      snapshotId: 's9',
    });
    expect(snapshots['restoreFromSnapshot']).toHaveBeenCalledWith(
      'elena',
      's9'
    );
  });
});
