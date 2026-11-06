import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import {
  appBasePath,
  appOrigin,
  isHomeAssistantIngress,
} from '@utils/app-base';
import { stripTrailingSlashes } from '@utils/string-utils';

import { environment } from '../../../environments/environment';

/**
 * Ephemeral anonymous browsing context. It never switches or creates a stored
 * profile, and always reads from the server serving the public link.
 */
@Injectable({ providedIn: 'root' })
export class PublicProjectContextService {
  private readonly router = inject(Router, { optional: true });
  private readonly path = signal(
    globalThis.location.pathname.slice(appBasePath().length)
  );
  readonly active = computed(() =>
    /^\/public\/[^/]+\/[^/?#]+(?:[/?#]|$)/.test(this.path())
  );

  constructor() {
    this.router?.events?.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.path.set(event.url);
      if (event instanceof NavigationEnd)
        this.path.set(event.urlAfterRedirects);
      if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.path.set(this.router?.url ?? '/');
      }
    });
  }

  /** API origin for this deployment, independent of the visitor's saved profile. */
  serverUrl(): string {
    return stripTrailingSlashes(
      isHomeAssistantIngress() ? appOrigin() : environment.apiUrl || appOrigin()
    );
  }

  /** Keep public caches separate from every authenticated or local profile. */
  storagePrefix(): string {
    return `public:${encodeURIComponent(this.serverUrl())}:`;
  }
}
