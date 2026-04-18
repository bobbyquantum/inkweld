import {
  computed,
  effect,
  inject,
  Injectable,
  type Signal,
  signal,
} from '@angular/core';

import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import {
  type IElementSyncProvider,
  type PresenceUser,
} from '../sync/element-sync-provider.interface';
import { UnifiedUserService } from '../user/unified-user.service';
import { generateUserColor } from './user-color';

/**
 * Central service that owns the local user's awareness state and exposes a
 * normalized list of remote users currently present in the project.
 *
 * Tabs (timeline, canvas, …) call {@link setActiveLocation} when they mount
 * so other peers know which surface they're focused on, and call it again
 * with `null` on destroy. UI components read {@link users} for project-wide
 * presence and {@link usersAtLocation} for tab-scoped presence.
 *
 * This service is provider-agnostic — it talks to whatever
 * {@link IElementSyncProvider} the {@link ElementSyncProviderFactory} hands
 * out (Yjs in real-time mode, no-op in offline mode).
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly factory = inject(ElementSyncProviderFactory);
  private readonly unifiedUser = inject(UnifiedUserService);

  private currentProvider: IElementSyncProvider | null = null;
  private subscription: { unsubscribe: () => void } | null = null;
  private readonly remoteUsersSignal = signal<PresenceUser[]>([]);

  readonly users: Signal<PresenceUser[]> = this.remoteUsersSignal.asReadonly();

  constructor() {
    // Whenever the current user changes, push our identity into awareness so
    // other peers see a stable username + color across reconnects.
    effect(() => {
      const user = this.unifiedUser.currentUser();
      const provider = this.ensureProvider();
      if (!provider) return;
      if (user?.username) {
        provider.setLocalAwareness({
          user: {
            name: user.username,
            color: generateUserColor(user.username),
          },
        });
      }
    });
  }

  /**
   * Set (or clear with `null`) the local user's current location inside the
   * project. Use a stable string key per surface, e.g.
   * `timeline:<elementId>` or `canvas:<elementId>`.
   */
  setActiveLocation(location: string | null): void {
    const provider = this.ensureProvider();
    provider?.setLocalAwareness({ location });
  }

  /**
   * Derived signal of remote users at a specific location. Pass `null` or
   * `undefined` to disable filtering.
   */
  usersAtLocation(
    location: Signal<string | null | undefined>
  ): Signal<PresenceUser[]> {
    return computed(() => {
      const target = location();
      const all = this.users();
      if (!target) return all;
      return all.filter(u => u.location === target);
    });
  }

  /**
   * Lazily resolve the current provider and (re)subscribe to its presence
   * stream when it changes. Returns `null` if no provider is available.
   */
  private ensureProvider(): IElementSyncProvider | null {
    const provider = this.factory.getProvider();
    if (provider === this.currentProvider) {
      return provider;
    }
    this.subscription?.unsubscribe();
    this.currentProvider = provider;
    this.subscription = provider.remotePresence$.subscribe(users => {
      this.remoteUsersSignal.set(users);
    });
    return provider;
  }
}
