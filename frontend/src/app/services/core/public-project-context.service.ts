import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { appBasePath } from '@utils/app-base';
import {
  defaultPublicServerUrl,
  normalizePublicServer,
  publicProjectKey,
  publicServerFromSearch,
} from '@utils/public-project-link';

/**
 * Where the servers public links named are kept for the tab: a reload deeper
 * in a shared project has lost the link's `?server=` but must still read from
 * that server. sessionStorage is per tab and holds only server addresses.
 */
const LINK_SERVERS_KEY = 'inkweld-public-link-servers';

/** A project's `username/slug` key and the server a link named for it. */
interface LinkServer {
  key: string;
  server: string;
}

/**
 * The servers stored for this tab, keeping only entries that are still valid
 * server addresses. Empty when storage is unreadable or holds anything else.
 */
function loadLinkServers(): Record<string, string> {
  let stored: unknown;
  try {
    stored = JSON.parse(
      globalThis.sessionStorage?.getItem(LINK_SERVERS_KEY) ?? '{}'
    );
  } catch {
    return {};
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }
  const servers: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    const server =
      typeof value === 'string' ? normalizePublicServer(value) : null;
    if (server) servers[key] = server;
  }
  return servers;
}

/** Store the tab's servers; without storage they last for this page only. */
function saveLinkServers(servers: Record<string, string>): void {
  try {
    globalThis.sessionStorage?.setItem(
      LINK_SERVERS_KEY,
      JSON.stringify(servers)
    );
  } catch {
    // Storage blocked: the servers are still remembered for this page.
  }
}

/**
 * Whether the page was opened afresh (a link followed or an address typed),
 * as opposed to reloaded or reached through the history. Unknown counts as
 * not fresh, so a remembered server is kept.
 */
function isFreshPageLoad(): boolean {
  try {
    const [entry] =
      globalThis.performance?.getEntriesByType?.('navigation') ?? [];
    return (
      (entry as PerformanceNavigationTiming | undefined)?.type === 'navigate'
    );
  } catch {
    return false;
  }
}

/** The server a URL's link names for its public project, if any. */
function linkServerOf(url: string): LinkServer | null {
  const key = publicProjectKey(url);
  const query = url.indexOf('?');
  if (!key || query === -1) return null;
  const server = publicServerFromSearch(url.slice(query).split('#', 1)[0]);
  return server ? { key, server } : null;
}

/**
 * Ephemeral anonymous browsing context. It never switches or creates a stored
 * profile, and always reads from the server the public link names (or, for a
 * link that names none, the server this build belongs to).
 */
@Injectable({ providedIn: 'root' })
export class PublicProjectContextService {
  private readonly router = inject(Router, { optional: true });
  private readonly path = signal(
    globalThis.location.pathname.slice(appBasePath().length) +
      globalThis.location.search
  );
  private readonly linkServers = signal(loadLinkServers());
  /** The server a navigation in progress names, kept once it succeeds. */
  private readonly pendingLinkServer = signal<LinkServer | null>(null);
  private readonly projectKey = computed(() => publicProjectKey(this.path()));
  readonly active = computed(() => this.projectKey() !== null);

  constructor() {
    this.useServerOfOpeningLink();
    this.router?.events?.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.path.set(event.url);
        this.pendingLinkServer.set(linkServerOf(event.url));
      } else if (event instanceof NavigationEnd) {
        this.path.set(event.urlAfterRedirects);
        this.commitPendingLinkServer();
      } else if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.pendingLinkServer.set(null);
        this.path.set(this.router?.url ?? '/');
      }
    });
  }

  /**
   * API origin for the public project being viewed, independent of the
   * visitor's saved profile.
   */
  serverUrl(): string {
    const key = this.projectKey();
    const pending = this.pendingLinkServer();
    if (key && pending?.key === key) return pending.server;
    return (key && this.linkServers()[key]) || defaultPublicServerUrl();
  }

  /** Keep public caches separate from every authenticated or local profile. */
  storagePrefix(): string {
    return `public:${encodeURIComponent(this.serverUrl())}:`;
  }

  /**
   * The page was opened on a public project: a link that names a server is
   * remembered, and a link opened afresh without one goes to the default
   * server even if an earlier link in this tab named another for the project.
   * A reload keeps the remembered server.
   */
  private useServerOfOpeningLink(): void {
    const key = this.projectKey();
    if (!key) return;
    const named = linkServerOf(this.path());
    if (named) {
      this.setLinkServer(named.key, named.server);
    } else if (isFreshPageLoad()) {
      this.setLinkServer(key, null);
    }
  }

  /** Keep the server of a navigation that has now succeeded. */
  private commitPendingLinkServer(): void {
    const pending = this.pendingLinkServer();
    this.pendingLinkServer.set(null);
    if (pending) this.setLinkServer(pending.key, pending.server);
  }

  /** Remember `server` for `key` (or forget it, for null). */
  private setLinkServer(key: string, server: string | null): void {
    const current = this.linkServers();
    if ((current[key] ?? null) === server) return;
    const others = Object.entries(current).filter(([other]) => other !== key);
    const servers = Object.fromEntries(
      server ? [...others, [key, server]] : others
    );
    this.linkServers.set(servers);
    saveLinkServers(servers);
  }
}
