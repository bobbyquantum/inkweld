import type { Project } from '@inkweld/index';
import type { AppTab } from '@services/project/tab-manager.service';

/** A project's root router commands, preserving anonymous browsing. */
export function projectRouteCommands(
  project: Pick<Project, 'username' | 'slug'>,
  publicView = false
): string[] {
  return [
    '/',
    ...(publicView ? ['public'] : []),
    project.username,
    project.slug,
  ];
}

/** Project-relative URL segments for either authenticated or public routes. */
export function projectUrlSegments(url: string): string[] {
  const segments = url.split(/[?#]/)[0].split('/').filter(Boolean);
  return segments[0] === 'public' ? segments.slice(1) : segments;
}

/** Router commands for the URL that shows `tab` inside `project`. */
export function tabRouteCommands(
  tab: AppTab,
  project: Pick<Project, 'username' | 'slug'>,
  publicView = false
): string[] {
  const base = projectRouteCommands(project, publicView);
  if (tab.type === 'system') {
    return tab.systemType === 'home' ? base : [...base, tab.systemType ?? ''];
  }
  if (tab.type === 'publishPlan') {
    const planId =
      tab.publishPlan?.id ||
      (tab.id.startsWith('publish-plan-')
        ? tab.id.slice('publish-plan-'.length)
        : tab.id);
    return [...base, 'publish-plan', planId];
  }
  if (tab.type === 'schema-editor') {
    // Schema editor tab — id is "schema-<schemaId>"
    const schemaId = tab.id.startsWith('schema-')
      ? tab.id.slice('schema-'.length)
      : tab.id;
    return [...base, 'schema', schemaId];
  }
  // Document, folder, worldbuilding, canvas, ... tab
  return [...base, tab.type, tab.id];
}
