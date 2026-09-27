import type { Project } from '@inkweld/index';
import type { AppTab } from '@services/project/tab-manager.service';

/** Router commands for the URL that shows `tab` inside `project`. */
export function tabRouteCommands(
  tab: AppTab,
  project: Pick<Project, 'username' | 'slug'>
): string[] {
  const base = ['/', project.username, project.slug];
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
