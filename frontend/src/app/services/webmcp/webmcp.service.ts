import {
  effect,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { SettingsService } from '@services/core/settings.service';

import { getModelContext, type ModelContextLike } from './model-context';

/** When to look for a WebMCP API that appeared after startup. */
const LATE_SUPPORT_CHECKS_MS = [1000, 3000, 10000];

/** What `WebMcpService` needs from the lazily loaded tool registry. */
export interface WebMcpRegistryHandle {
  start(): void;
  dispose(): void;
}

export type WebMcpRegistryLoader = () => Promise<
  new (injector: Injector, context: ModelContextLike) => WebMcpRegistryHandle
>;

/**
 * Loads the tool registry. A dynamic import keeps the tools, and the editor
 * services they reach, out of the initial bundle. Replaceable in tests.
 */
export const WEBMCP_REGISTRY_LOADER = new InjectionToken<WebMcpRegistryLoader>(
  'WEBMCP_REGISTRY_LOADER',
  {
    providedIn: 'root',
    factory: () => () => import('./tools').then(m => m.WebMcpRegistry),
  }
);

/**
 * Exposes Inkweld to AI agents built into the browser through WebMCP
 * (`document.modelContext`), so an agent can do what the user can do in the
 * app — browse and edit projects, documents, worldbuilding, relationships,
 * tags, snapshots and publish plans — through the same services the UI uses.
 *
 * Off unless the user chooses "Allow AI" (`SettingsService.aiAllowed`, in
 * Settings → General or on /setup), and inert in browsers without WebMCP.
 * The tools are loaded with a dynamic import on first activation so they
 * add nothing to the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class WebMcpService {
  private readonly settings = inject(SettingsService);
  private readonly injector = inject(Injector);
  private readonly loadRegistry = inject(WEBMCP_REGISTRY_LOADER);

  /**
   * Whether this browser offers WebMCP at all. Re-checked after startup
   * (see {@link refreshSupport}): an extension or polyfill can add
   * `document.modelContext` after the app has booted, and Chrome adds it
   * when an origin-trial token is inserted at runtime.
   */
  readonly supported = signal(getModelContext() !== null);

  /** Whether Inkweld's tools are currently registered. */
  readonly active = signal(false);

  private registry: WebMcpRegistryHandle | null = null;
  /** Bumped on every toggle so a slow import cannot activate a stale state. */
  private generation = 0;
  private started = false;

  /** Start following the preference. Called once from `AppComponent`. */
  start(): void {
    if (this.started) return;
    this.started = true;
    effect(
      () => {
        const wanted = this.settings.aiAllowed() && this.supported();
        untracked(() => {
          if (wanted) void this.activate();
          else this.deactivate();
        });
      },
      { injector: this.injector }
    );
    this.watchForLateSupport();
  }

  /** Look for the WebMCP API again, e.g. when the settings are opened. */
  refreshSupport(): boolean {
    const found = getModelContext() !== null;
    if (found !== this.supported()) this.supported.set(found);
    return found;
  }

  /**
   * Re-check a few times after startup, then stop: the API is either there
   * by then or the browser doesn't have it (and `refreshSupport()` still
   * catches it when Settings or setup is opened).
   */
  private watchForLateSupport(): void {
    if (this.supported() || typeof window === 'undefined') return;
    const check = (): void => {
      this.refreshSupport();
    };
    window.addEventListener('load', check, { once: true });
    for (const delay of LATE_SUPPORT_CHECKS_MS) {
      setTimeout(check, delay);
    }
  }

  private async activate(): Promise<void> {
    const generation = ++this.generation;
    const context = getModelContext();
    if (!context || this.registry) return;
    try {
      const Registry = await this.loadRegistry();
      if (generation !== this.generation || this.registry) return;
      const registry = new Registry(this.injector, context);
      registry.start();
      this.registry = registry;
      this.active.set(true);
    } catch (error) {
      console.warn('[WebMCP] Could not load the tools', error);
    }
  }

  private deactivate(): void {
    this.generation++;
    this.registry?.dispose();
    this.registry = null;
    this.active.set(false);
  }
}
