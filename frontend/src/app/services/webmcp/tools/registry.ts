import {
  effect,
  type EffectRef,
  type Injector,
  untracked,
} from '@angular/core';
import { ProjectStateService } from '@services/project/project-state.service';

import {
  type ModelContextLike,
  registerModelContextTool,
} from '../model-context';
import { buildAppTools, buildProjectTools } from './catalog';
import { toModelContextTool, type WebMcpToolDefinition } from './tool';

/**
 * Keeps the registered tools in step with the page: the app tools for as
 * long as WebMCP is on, and the project tools while a project is open — the
 * tools that change it only while the user may edit it. Agents learn about
 * the change through the browser's `toolchange` event.
 */
export class WebMcpRegistry {
  private readonly appScope = new AbortController();
  private projectScope: AbortController | null = null;
  private projectKey: string | null = null;
  private watcher: EffectRef | null = null;

  constructor(
    private readonly injector: Injector,
    private readonly context: ModelContextLike
  ) {}

  start(): void {
    this.register(buildAppTools(this.injector), this.appScope.signal);
    const state = this.injector.get(ProjectStateService);
    this.watcher = effect(
      () => {
        const project = state.project();
        let key: string | null = null;
        if (project?.username && project.slug) {
          const access = state.canWrite() ? 'write' : 'read';
          key = `${project.username}/${project.slug}#${access}`;
        }
        untracked(() => this.updateProjectTools(key));
      },
      { injector: this.injector }
    );
  }

  /** Remove every tool. */
  dispose(): void {
    this.watcher?.destroy();
    this.watcher = null;
    this.projectScope?.abort();
    this.projectScope = null;
    this.projectKey = null;
    this.appScope.abort();
  }

  private updateProjectTools(key: string | null): void {
    if (key === this.projectKey) return;
    this.projectScope?.abort();
    this.projectScope = null;
    this.projectKey = key;
    if (!key) return;
    const canWrite = key.endsWith('#write');
    const scope = new AbortController();
    this.projectScope = scope;
    this.register(
      buildProjectTools(this.injector).filter(tool => canWrite || !tool.writes),
      scope.signal
    );
  }

  private register(tools: WebMcpToolDefinition[], signal: AbortSignal): void {
    for (const tool of tools) {
      registerModelContextTool(
        this.context,
        toModelContextTool(tool),
        signal
      ).catch((error: unknown) => {
        console.warn(`[WebMCP] Could not register ${tool.name}`, error);
      });
    }
  }
}
