import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import {
  type IElementSyncProvider,
  type PresenceUser,
} from '../sync/element-sync-provider.interface';
import { UnifiedUserService } from '../user/unified-user.service';
import { PresenceService } from './presence.service';

interface MockProvider {
  remotePresence$: BehaviorSubject<PresenceUser[]>;
  setLocalAwareness: ReturnType<typeof vi.fn>;
}

function createMockProvider(): MockProvider {
  return {
    remotePresence$: new BehaviorSubject<PresenceUser[]>([]),
    setLocalAwareness: vi.fn(),
  };
}

function setupService(opts: {
  provider: MockProvider;
  currentUser: Signal<{ username: string } | null>;
}): PresenceService {
  TestBed.configureTestingModule({
    providers: [
      PresenceService,
      {
        provide: ElementSyncProviderFactory,
        useValue: {
          getProvider: () => opts.provider as unknown as IElementSyncProvider,
        },
      },
      {
        provide: UnifiedUserService,
        useValue: { currentUser: opts.currentUser },
      },
    ],
  });
  return TestBed.inject(PresenceService);
}

describe('PresenceService', () => {
  let provider: MockProvider;
  let currentUser: ReturnType<typeof signal<{ username: string } | null>>;

  beforeEach(() => {
    provider = createMockProvider();
    currentUser = signal<{ username: string } | null>(null);
  });

  it('sets local awareness with username and color when current user is known', () => {
    currentUser.set({ username: 'alice' });
    setupService({ provider, currentUser });
    TestBed.flushEffects();

    expect(provider.setLocalAwareness).toHaveBeenCalledWith({
      user: { name: 'alice', color: expect.stringMatching(/^#[0-9a-f]{6}$/) },
    });
  });

  it('clears local awareness identity when no user is signed in', () => {
    setupService({ provider, currentUser });
    expect(() => TestBed.flushEffects()).not.toThrow();
    expect(provider.setLocalAwareness).toHaveBeenCalledWith({ user: null });
  });

  it('forwards setActiveLocation to the provider', () => {
    const service = setupService({ provider, currentUser });
    TestBed.flushEffects();
    provider.setLocalAwareness.mockClear();

    service.setActiveLocation('timeline:abc');
    expect(provider.setLocalAwareness).toHaveBeenCalledWith({
      location: 'timeline:abc',
    });

    service.setActiveLocation(null);
    expect(provider.setLocalAwareness).toHaveBeenCalledWith({
      location: null,
    });
  });

  it('mirrors remote users via the users signal', () => {
    const service = setupService({ provider, currentUser });
    TestBed.flushEffects();

    expect(service.users()).toEqual([]);

    const users: PresenceUser[] = [
      { clientId: 1, username: 'bob', color: '#abcdef' },
      { clientId: 2, username: 'eve', color: '#123456', location: 'canvas:x' },
    ];
    provider.remotePresence$.next(users);
    expect(service.users()).toEqual(users);
  });

  it('filters users by location via usersAtLocation', () => {
    const service = setupService({ provider, currentUser });
    TestBed.flushEffects();

    provider.remotePresence$.next([
      { clientId: 1, username: 'bob', color: '#1', location: 'timeline:a' },
      { clientId: 2, username: 'eve', color: '#2', location: 'canvas:b' },
      { clientId: 3, username: 'mallory', color: '#3' },
    ]);

    const target = signal<string | null>('timeline:a');
    const filtered = service.usersAtLocation(target);
    expect(filtered().map(u => u.username)).toEqual(['bob']);

    target.set('canvas:b');
    expect(filtered().map(u => u.username)).toEqual(['eve']);

    target.set(null);
    expect(filtered().map(u => u.username)).toEqual(['bob', 'eve', 'mallory']);
  });
});
