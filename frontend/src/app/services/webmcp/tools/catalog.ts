/** Every WebMCP tool, grouped by what it needs to run. */
import type { Injector } from '@angular/core';

import { appTools } from './app.tools';
import { documentTools } from './document.tools';
import { elementTools } from './element.tools';
import { ProjectToolContext } from './project-context';
import { publishTools } from './publish.tools';
import { relationshipTools } from './relationship.tools';
import { snapshotTools } from './snapshot.tools';
import { tagTools } from './tag.tools';
import type { WebMcpToolDefinition } from './tool';
import { worldbuildingTools } from './worldbuilding.tools';

/** Tools available on every page. */
export function buildAppTools(injector: Injector): WebMcpToolDefinition[] {
  return appTools(injector);
}

/** Tools that act on the open project. */
export function buildProjectTools(injector: Injector): WebMcpToolDefinition[] {
  const ctx = new ProjectToolContext(injector);
  return [
    ...elementTools(injector, ctx),
    ...documentTools(injector, ctx),
    ...worldbuildingTools(injector, ctx),
    ...relationshipTools(injector, ctx),
    ...tagTools(injector, ctx),
    ...snapshotTools(injector, ctx),
    ...publishTools(injector, ctx),
  ];
}
