import { Injector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { UnifiedSnapshotService } from '@services/project/unified-snapshot.service';
import { PublishPlanService } from '@services/publish/publish-plan.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { TagService } from '@services/tag/tag.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProjectStateFake,
  type ProjectStateFake,
} from '../../../../testing/webmcp-testing';
import type { ModelContextLike, ModelContextTool } from '../model-context';
import { WebMcpRegistry } from './registry';

/** A ModelContext that keeps the registered tools, like the spec's tool map. */
function createModelContext() {
  const tools = new Map<string, ModelContextTool>();
  const context: ModelContextLike = {
    registerTool: vi.fn(
      (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
        if (tools.has(tool.name)) {
          return Promise.reject(new Error(`Duplicate tool ${tool.name}`));
        }
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () =>
          tools.delete(tool.name)
        );
        return Promise.resolve();
      }
    ),
  };
  return { context, tools };
}

describe('WebMcpRegistry', () => {
  let state: ProjectStateFake;
  let model: ReturnType<typeof createModelContext>;
  let registry: WebMcpRegistry;

  const names = (): string[] => [...model.tools.keys()];

  beforeEach(() => {
    state = createProjectStateFake([]);
    state.project.set(undefined);
    model = createModelContext();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: Router, useValue: {} },
        { provide: UnifiedProjectService, useValue: {} },
        { provide: WorldbuildingService, useValue: {} },
        { provide: RelationshipService, useValue: {} },
        { provide: TagService, useValue: {} },
        { provide: UnifiedSnapshotService, useValue: {} },
        { provide: PublishPlanService, useValue: {} },
      ],
    });
    registry = new WebMcpRegistry(TestBed.inject(Injector), model.context);
    registry.start();
    TestBed.tick();
  });

  afterEach(() => {
    registry.dispose();
    TestBed.resetTestingModule();
  });

  it('registers the app tools straight away', () => {
    expect(names()).toContain('get_app_state');
    expect(names()).toContain('open_project');
    expect(names()).not.toContain('get_project_tree');
  });

  it('adds the project tools while a project is open', () => {
    state.project.set({
      id: 'p',
      username: 'alice',
      slug: 'novel',
      title: 'Novel',
      createdDate: '',
      updatedDate: '',
    });
    TestBed.tick();

    expect(names()).toContain('get_project_tree');
    expect(names()).toContain('update_document_content');
    expect(names()).toContain('delete_element');

    state.project.set(undefined);
    TestBed.tick();

    expect(names()).not.toContain('get_project_tree');
    expect(names()).toContain('get_app_state');
  });

  it('leaves out the tools that change the project without write access', () => {
    state.canWrite.set(false);
    state.project.set({
      id: 'p',
      username: 'bob',
      slug: 'shared',
      title: 'Shared',
      createdDate: '',
      updatedDate: '',
    });
    TestBed.tick();

    expect(names()).toContain('get_document_content');
    expect(names()).toContain('open_element');
    expect(names()).not.toContain('update_document_content');
    expect(names()).not.toContain('create_element');

    state.canWrite.set(true);
    TestBed.tick();

    expect(names()).toContain('update_document_content');
  });

  it('re-registers when another project opens', () => {
    const open = (slug: string): void => {
      state.project.set({
        id: slug,
        username: 'alice',
        slug,
        title: slug,
        createdDate: '',
        updatedDate: '',
      });
      TestBed.tick();
    };
    open('one');
    open('two');

    expect(names().filter(n => n === 'get_project_tree')).toHaveLength(1);
  });

  it('removes everything on dispose', () => {
    registry.dispose();
    expect(names()).toEqual([]);
  });

  it('logs a tool the browser refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = new WebMcpRegistry(TestBed.inject(Injector), model.context);
    second.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not register'),
      expect.any(Error)
    );
    second.dispose();
    warn.mockRestore();
  });
});
