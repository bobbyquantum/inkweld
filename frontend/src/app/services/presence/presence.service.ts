import {
  computed,
  effect,
  inject,
  Injectable,
  type Signal,
  signal,
} from '@angular/core';
import {
  type PresenceLocation,
  type PresenceSelection,
  type PresenceSession,
  type PresenceStatus,
} from '@inkweld/presence';
import { generateUserColor } from '@services/presence/user-color';
import { ElementSyncProviderFactory } from '@services/sync/element-sync-provider.factory';
import { type IElementSyncProvider } from '@services/sync/element-sync-provider.interface';
import { UnifiedUserService } from '@services/user/unified-user.service';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function locationsEqual(
  a: PresenceLocation | null | undefined,
  b: PresenceLocation | null | undefined
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Central service that owns the local user's presence state and exposes a
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
  private readonly remoteUsersSignal = signal<PresenceSession[]>([]);
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentStatus: PresenceStatus = 'active';

  readonly users: Signal<PresenceSession[]> =
    this.remoteUsersSignal.asReadonly();

  constructor() {
    // Whenever the current user changes, push our identity into presence so
    // other peers see a stable username + color across reconnects.
    effect(() => {
      this.unifiedUser.currentUser();
      if (this.currentProvider) this.syncIdentity(this.currentProvider);
    });

    this.installActivityListeners();
  }

  /**
   * Set (or clear with `null`) the local user's current location inside the
   * project. Use a stable string key per surface, e.g.
   * `timeline:<elementId>` or `canvas:<elementId>`.
   */
  setActiveLocation(location: PresenceLocation | string | null): void {
    const provider = this.ensureProvider();
    provider?.setLocalPresence({
      location: this.normalizeLocation(location),
      lastActivityAt: Date.now(),
    });
    this.markActive();
  }

  setSelection(selection: PresenceSelection | null): void {
    const provider = this.ensureProvider();
    provider?.setLocalPresence({ selection, lastActivityAt: Date.now() });
    this.markActive();
  }

  markEditing(selection?: PresenceSelection): void {
    const provider = this.ensureProvider();
    this.currentStatus = 'editing';
    provider?.setLocalPresence({
      status: 'editing',
      ...(selection !== undefined && { selection }),
      lastActivityAt: Date.now(),
    });
    this.armIdleTimer();
  }

  /**
   * Derived signal of remote users at a specific location. Pass `null` or
   * `undefined` to disable filtering.
   */
  usersAtLocation(
    location: Signal<PresenceLocation | string | null | undefined>
  ): Signal<PresenceSession[]> {
    return computed(() => {
      const target = this.normalizeLocation(location() ?? null);
      const all = this.users();
      if (!target) return all;
      return all.filter(u => locationsEqual(u.location, target));
    });
  }

  private markActive(): void {
    const provider = this.ensureProvider();
    if (!provider) return;
    if (this.currentStatus !== 'active') {
      this.currentStatus = 'active';
      provider.setLocalPresence({
        status: 'active',
        lastActivityAt: Date.now(),
      });
    }
    this.armIdleTimer();
  }

  private markIdle(): void {
    const provider = this.ensureProvider();
    if (!provider) return;
    this.currentStatus = 'idle';
    provider.setLocalPresence({ status: 'idle', lastActivityAt: Date.now() });
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.markIdle(), IDLE_TIMEOUT_MS);
  }

  private installActivityListeners(): void {
    const onActivity = (): void => this.markActive();
    globalThis.addEventListener?.('mousemove', onActivity, { passive: true });
    globalThis.addEventListener?.('keydown', onActivity, { passive: true });
    globalThis.addEventListener?.('pointerdown', onActivity, { passive: true });
  }

  private normalizeLocation(
    location: PresenceLocation | string | null | undefined
  ): PresenceLocation | null {
    if (!location) return null;
    if (typeof location !== 'string') return location;
    const [kind, ...rest] = location.split(':');
    const id = rest.join(':');
    switch (kind) {
      case 'timeline':
        return { kind: 'timeline', elementId: id };
      case 'canvas':
        return { kind: 'canvas', elementId: id };
      case 'document':
        return { kind: 'document', documentId: id };
      case 'worldbuilding':
        return id
          ? { kind: 'worldbuilding', schemaId: id }
          : { kind: 'worldbuilding' };
      case 'media':
        return { kind: 'media' };
      case 'settings':
        return { kind: 'settings' };
      case 'elements':
        return { kind: 'elements' };
      default:
        return { kind: 'other', label: location };
    }
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
    this.syncIdentity(provider);
    return provider;
  }

  private syncIdentity(provider: IElementSyncProvider): void {
    const user = this.unifiedUser.currentUser();
    if (user?.username) {
      provider.setLocalPresence({
        user: {
          id: String(user.id ?? ''),
          username: user.username,
          color: generateUserColor(user.username),
        },
        status: this.currentStatus,
        location: { kind: 'elements' },
        lastActivityAt: Date.now(),
      });
      this.armIdleTimer();
    } else {
      provider.setLocalPresence({ user: null });
    }
  }
}
