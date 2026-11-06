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
  publicProjectKey,
  publicServerFromSearch,
} from '@utils/public-project-link';

/**
 * Where the servers public links named are kept for the tab: a reload deeper
 * in a shared project has lost the link's `?server=` but must still read from
 * that server. sessionStorage is per tab and holds only server addresses.
 */
const LINK_SERVERS_KEY = 'inkweld-public-link-servers';

function loadLinkServers(): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(
      globalThis.sessionStorage?.getItem(LINK_SERVERS_KEY) ?? '{}'
    );
    return stored && typeof stored === 'object'
      ? (stored as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function saveLinkServers(servers: Record<string, string>): void {
  try {
    globalThis.sessionStorage?.setItem(
      LINK_SERVERS_KEY,
      JSON.stringify(servers)
    );
  } catch {
    // Storage blocked: the server is still remembered for this page.
  }
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
  private readonly projectKey = computed(() => publicProjectKey(this.path()));
  readonly active = computed(() => this.projectKey() !== null);

  constructor() {
    this.rememberLinkServer(this.path());
    this.router?.events?.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.setPath(event.url);
      if (event instanceof NavigationEnd) this.setPath(event.urlAfterRedirects);
      if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.setPath(this.router?.url ?? '/');
      }
    });
  }

  /**
   * API origin for the public project being viewed, independent of the
   * visitor's saved profile.
   */
  serverUrl(): string {
    const key = this.projectKey();
    return (key && this.linkServers()[key]) || defaultPublicServerUrl();
  }

  /** Keep public caches separate from every authenticated or local profile. */
  storagePrefix(): string {
    return `public:${encodeURIComponent(this.serverUrl())}:`;
  }

  private setPath(url: string): void {
    this.path.set(url);
    this.rememberLinkServer(url);
  }

  /** Record the server a link to a public project names, if it names one. */
  private rememberLinkServer(url: string): void {
    const key = publicProjectKey(url);
    const query = url.indexOf('?');
    if (!key || query === -1) return;
    const server = publicServerFromSearch(url.slice(query).split('#', 1)[0]);
    if (!server || this.linkServers()[key] === server) return;
    const servers = { ...this.linkServers(), [key]: server };
    this.linkServers.set(servers);
    saveLinkServers(servers);
  }
}
