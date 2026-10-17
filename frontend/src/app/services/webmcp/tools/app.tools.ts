import type { Injector } from '@angular/core';
import { Router } from '@angular/router';
import type { Project } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { SetupService } from '@services/core/setup.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { ProjectTemplateService } from '@services/project/project-template.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { type ThemeOption, ThemeService } from '@themes/theme.service';
import { firstValueFrom } from 'rxjs';

import { schema, ToolError, type WebMcpToolDefinition } from './tool';
import { waitUntil } from './wait';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const THEMES: readonly ThemeOption[] = ['light-theme', 'dark-theme', 'system'];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

function projectSummary(project: Project): Record<string, unknown> {
  return {
    username: project.username,
    slug: project.slug,
    title: project.title,
    description: project.description ?? '',
    updated: project.updatedDate,
  };
}

/**
 * Tools that work anywhere in the app: where am I, which projects exist,
 * open or create one, and the user's own preferences.
 */
export function appTools(injector: Injector): WebMcpToolDefinition[] {
  const router = injector.get(Router);
  const projectState = injector.get(ProjectStateService);
  const projects = injector.get(UnifiedProjectService);

  async function openProject(
    username: string,
    slug: string,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    await router.navigate(['/', username, slug]);
    const loaded = await waitUntil(() => {
      const p = projectState.project();
      return (
        p?.username === username && p.slug === slug && !projectState.isLoading()
      );
    }, signal);
    if (!loaded) {
      throw new ToolError(
        projectState.error() ??
          `Project ${username}/${slug} did not finish loading. Check get_app_state.`
      );
    }
    return {
      opened: `${username}/${slug}`,
      title: projectState.project()?.title,
      elementCount: projectState.elements().length,
      canWrite: projectState.canWrite(),
    };
  }

  return [
    {
      name: 'get_app_state',
      title: 'Get Inkweld state',
      description:
        'Where the user is in Inkweld: the storage profile (local browser, cloud folder or server), the signed-in author, the current page, and the open project with its open tabs. Call this first.',
      inputSchema: schema(),
      readOnly: true,
      run: () => {
        const user = injector.get(UnifiedUserService).currentUser();
        const project = projectState.project();
        return {
          profileMode: injector.get(SetupService).getMode() ?? 'not-set-up',
          user: user?.username
            ? { username: user.username, name: user.name ?? undefined }
            : null,
          url: router.url,
          project: project
            ? {
                username: project.username,
                slug: project.slug,
                title: project.title,
                canWrite: projectState.canWrite(),
                elementCount: projectState.elements().length,
                openTabs: projectState.openTabs().map((tab, index) => ({
                  index,
                  name: tab.name,
                  type: tab.type === 'system' ? tab.systemType : tab.type,
                  elementId: tab.element?.id,
                  selected: index === projectState.selectedTabIndex(),
                })),
              }
            : null,
        };
      },
    },
    {
      name: 'list_projects',
      title: 'List projects',
      description:
        'List the projects available in the current profile (title, username/slug, description).',
      inputSchema: schema(),
      readOnly: true,
      untrustedContent: true,
      run: async () => {
        await projects.loadProjects();
        return { projects: projects.projects().map(projectSummary) };
      },
    },
    {
      name: 'open_project',
      title: 'Open project',
      description:
        'Open a project in the editor. Project tools (tree, documents, worldbuilding, …) become available once it has loaded.',
      inputSchema: schema(
        {
          slug: { type: 'string', description: 'Project slug.' },
          username: {
            type: 'string',
            description:
              "Project owner's username. Defaults to the signed-in author.",
          },
        },
        ['slug']
      ),
      run: async (args, signal) => {
        const slug = args.string('slug');
        const username =
          args.optionalString('username') ??
          injector.get(UnifiedUserService).currentUser()?.username;
        if (!username) {
          throw new ToolError('"username" is required (nobody is signed in).');
        }
        return openProject(username, slug, signal);
      },
    },
    {
      name: 'list_project_templates',
      title: 'List project templates',
      description:
        'Starter templates create_project can use (e.g. an empty project, a novel outline).',
      inputSchema: schema(),
      readOnly: true,
      run: async () => {
        const templates = await injector
          .get(ProjectTemplateService)
          .getTemplates();
        return {
          templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
          })),
        };
      },
    },
    {
      name: 'create_project',
      title: 'Create project',
      description:
        'Create a new project in the current profile and open it, like the "New project" page.',
      inputSchema: schema(
        {
          title: { type: 'string', description: 'Project title.' },
          slug: {
            type: 'string',
            description:
              'URL slug: lowercase letters, digits and single hyphens. Derived from the title when omitted.',
          },
          description: { type: 'string' },
          templateId: {
            type: 'string',
            description:
              'Template from list_project_templates. Defaults to "worldbuilding-empty", as on the New project page.',
          },
        },
        ['title']
      ),
      run: async (args, signal) => {
        const title = args.string('title').trim();
        const slug = args.optionalString('slug')?.trim() || slugify(title);
        if (!SLUG_PATTERN.test(slug)) {
          throw new ToolError(
            `"${slug}" is not a valid slug: use lowercase letters, digits and single hyphens.`
          );
        }
        const project = await projects.createProject(
          {
            title,
            slug,
            description: args.optionalString('description') ?? '',
          },
          args.optionalString('templateId') ?? 'worldbuilding-empty'
        );
        await injector
          .get(ProjectActivationService)
          .activate(`${project.username}/${project.slug}`);
        return openProject(project.username, project.slug, signal);
      },
    },
    {
      name: 'go_home',
      title: 'Go to the project list',
      description: 'Leave the open project and show the home page.',
      inputSchema: schema(),
      run: async () => {
        await router.navigate(['/']);
        return { url: router.url };
      },
    },
    {
      name: 'get_preferences',
      title: 'Get preferences',
      description: "The author's display and editing preferences.",
      inputSchema: schema(),
      readOnly: true,
      run: async () => {
        const settings = injector.get(SettingsService);
        return {
          theme: await firstValueFrom(
            injector.get(ThemeService).getCurrentTheme()
          ),
          showBreadcrumbs: settings.showBreadcrumbs(),
          denseLayout: settings.denseLayout(),
          folderClickOpens: settings.folderClickOpens(),
          markdownShortcuts: settings.markdownShortcuts(),
        };
      },
    },
    {
      name: 'update_preferences',
      title: 'Update preferences',
      description:
        "Change the author's display and editing preferences. Only the fields given change.",
      inputSchema: schema({
        theme: { type: 'string', enum: THEMES },
        showBreadcrumbs: {
          type: 'boolean',
          description: 'Show the breadcrumb bar above the editor.',
        },
        denseLayout: {
          type: 'boolean',
          description: 'Use a compact project sidebar on desktop.',
        },
        folderClickOpens: {
          type: 'boolean',
          description: 'Clicking a folder in the tree also opens it.',
        },
        markdownShortcuts: {
          type: 'boolean',
          description:
            'Convert Markdown ("# ", "- ", **bold**) while typing. Applies to documents opened afterwards.',
        },
      }),
      run: args => {
        const settings = injector.get(SettingsService);
        const theme = args.optionalOneOf('theme', THEMES);
        if (theme) injector.get(ThemeService).update(theme);
        const flag = (name: string, apply: (value: boolean) => void): void => {
          const value = args.optionalBoolean(name);
          if (value !== undefined) apply(value);
        };
        flag('showBreadcrumbs', v => settings.setShowBreadcrumbs(v));
        flag('denseLayout', v => settings.setDenseLayout(v));
        flag('folderClickOpens', v => settings.setFolderClickOpens(v));
        flag('markdownShortcuts', v => settings.setMarkdownShortcuts(v));
        return { ok: true };
      },
    },
  ];
}
