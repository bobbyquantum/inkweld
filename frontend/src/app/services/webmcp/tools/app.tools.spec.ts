import { Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { SetupService } from '@services/core/setup.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { ProjectTemplateService } from '@services/project/project-template.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { ThemeService } from '@themes/theme.service';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
  type ProjectStateFake,
  TEST_PROJECT,
} from '../../../../testing/webmcp-testing';
import { appTools } from './app.tools';
import type { WebMcpToolDefinition } from './tool';

describe('app tools', () => {
  let state: ProjectStateFake;
  let tools: WebMcpToolDefinition[];
  let navigate: ReturnType<typeof vi.fn>;
  let createProject: ReturnType<typeof vi.fn>;
  let activate: ReturnType<typeof vi.fn>;
  let settings: Record<string, unknown>;
  let themeUpdate: ReturnType<typeof vi.fn>;
  let user: { username: string; name?: string } | undefined;

  beforeEach(() => {
    state = createProjectStateFake([
      element('ch1', 'Chapter One', ElementType.Item),
    ]);
    state.openTabs.set([
      {
        id: 'ch1',
        name: 'Chapter One',
        type: 'document',
        element: state.elements()[0],
      },
      { id: 'media', name: 'Media', type: 'system', systemType: 'media' },
    ]);
    user = { username: 'alice', name: 'Alice' };
    // Navigating "loads" whichever project the URL names.
    navigate = vi.fn((commands: string[]) => {
      if (commands.length === 3) {
        state.project.set({
          ...TEST_PROJECT,
          username: commands[1],
          slug: commands[2],
        });
      } else {
        state.project.set(undefined);
      }
      return Promise.resolve(true);
    });
    createProject = vi.fn((data: { title: string; slug: string }) =>
      Promise.resolve({ ...TEST_PROJECT, ...data })
    );
    activate = vi.fn().mockResolvedValue(undefined);
    themeUpdate = vi.fn();
    settings = {
      showBreadcrumbs: signal(true),
      denseLayout: signal(true),
      folderClickOpens: signal(false),
      markdownShortcuts: signal(false),
      setShowBreadcrumbs: vi.fn(),
      setDenseLayout: vi.fn(),
      setFolderClickOpens: vi.fn(),
      setMarkdownShortcuts: vi.fn(),
    };
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: Router, useValue: { navigate, url: '/alice/novel' } },
        {
          provide: UnifiedProjectService,
          useValue: {
            loadProjects: vi.fn().mockResolvedValue(undefined),
            projects: () => [TEST_PROJECT],
            createProject,
          },
        },
        { provide: UnifiedUserService, useValue: { currentUser: () => user } },
        { provide: SetupService, useValue: { getMode: () => 'server' } },
        { provide: ProjectActivationService, useValue: { activate } },
        {
          provide: ProjectTemplateService,
          useValue: {
            getTemplates: () =>
              Promise.resolve([
                {
                  id: 'empty',
                  name: 'Empty',
                  description: 'Nothing',
                  icon: 'x',
                  folder: 'empty',
                },
              ]),
          },
        },
        { provide: SettingsService, useValue: settings },
        {
          provide: ThemeService,
          useValue: {
            getCurrentTheme: () => new BehaviorSubject('dark-theme'),
            update: themeUpdate,
          },
        },
      ],
    });
    tools = appTools(injector);
  });

  it('reports where the user is', async () => {
    const { data } = await callTool(tools, 'get_app_state');
    expect(data).toMatchObject({
      profileMode: 'server',
      user: { username: 'alice', name: 'Alice' },
      url: '/alice/novel',
      project: {
        username: 'alice',
        slug: 'novel',
        canWrite: true,
        elementCount: 1,
      },
    });
    expect(data.project.openTabs).toEqual([
      {
        index: 0,
        name: 'Chapter One',
        type: 'document',
        elementId: 'ch1',
        selected: true,
      },
      { index: 1, name: 'Media', type: 'media', selected: false },
    ]);
  });

  it('reports no project and no user', async () => {
    state.project.set(undefined);
    user = undefined;
    const { data } = await callTool(tools, 'get_app_state');
    expect(data.project).toBeNull();
    expect(data.user).toBeNull();
  });

  it('lists projects and templates', async () => {
    const projects = await callTool(tools, 'list_projects');
    expect(projects.data.projects[0]).toMatchObject({
      username: 'alice',
      slug: 'novel',
      title: 'The Novel',
    });
    const templates = await callTool(tools, 'list_project_templates');
    expect(templates.data.templates).toEqual([
      { id: 'empty', name: 'Empty', description: 'Nothing' },
    ]);
  });

  it("opens a project, defaulting to the user's own", async () => {
    const { data } = await callTool(tools, 'open_project', { slug: 'saga' });
    expect(navigate).toHaveBeenCalledWith(['/', 'alice', 'saga']);
    expect(data).toMatchObject({ opened: 'alice/saga', canWrite: true });
  });

  it('needs a username when nobody is signed in', async () => {
    user = undefined;
    const { error } = await callTool(tools, 'open_project', { slug: 'saga' });
    expect(error).toContain('"username" is required');
  });

  it('creates a project from its title and opens it', async () => {
    const { data } = await callTool(tools, 'create_project', {
      title: 'My New Saga!',
      description: 'Epic',
    });
    expect(createProject).toHaveBeenCalledWith(
      { title: 'My New Saga!', slug: 'my-new-saga', description: 'Epic' },
      'worldbuilding-empty'
    );
    expect(activate).toHaveBeenCalledWith('alice/my-new-saga');
    expect(data.opened).toBe('alice/my-new-saga');
  });

  it('rejects an invalid slug', async () => {
    const { error } = await callTool(tools, 'create_project', {
      title: 'Saga',
      slug: 'Bad Slug',
    });
    expect(error).toContain('not a valid slug');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('rejects a slug the server would refuse as too short', async () => {
    const { error } = await callTool(tools, 'create_project', { title: 'É' });
    expect(error).toContain('"e" is too short');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('goes home', async () => {
    await callTool(tools, 'go_home');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('reads and updates preferences', async () => {
    const { data } = await callTool(tools, 'get_preferences');
    expect(data).toEqual({
      theme: 'dark-theme',
      showBreadcrumbs: true,
      denseLayout: true,
      folderClickOpens: false,
      markdownShortcuts: false,
    });

    await callTool(tools, 'update_preferences', {
      theme: 'light-theme',
      markdownShortcuts: true,
      denseLayout: false,
    });
    expect(themeUpdate).toHaveBeenCalledWith('light-theme');
    expect(settings['setMarkdownShortcuts']).toHaveBeenCalledWith(true);
    expect(settings['setDenseLayout']).toHaveBeenCalledWith(false);
    expect(settings['setShowBreadcrumbs']).not.toHaveBeenCalled();
  });
});
