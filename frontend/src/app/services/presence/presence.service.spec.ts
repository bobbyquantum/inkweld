import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type PresenceSession } from '@inkweld/presence';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { UnifiedUserService } from '../user/unified-user.service';
import { PresenceService } from './presence.service';

interface MockProvider {
  remotePresence$: BehaviorSubject<PresenceSession[]>;
  setLocalPresence: ReturnType<typeof vi.fn>;
}

function session(
  sessionId: string,
  username: string,
  location?: PresenceSession['location']
): PresenceSession {
  return {
    sessionId,
    user: { id: username, username, color: '#abcdef' },
    status: 'active',
    location: location ?? { kind: 'elements' },
    lastActivityAt: 1,
  };
}

function createMockProvider(): MockProvider {
  return {
    remotePresence$: new BehaviorSubject<PresenceSession[]>([]),
    setLocalPresence: vi.fn(),
  };
}

function setupService(opts: {
  provider: MockProvider;
  currentUser: Signal<{ id?: string; username: string } | null>;
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
  let currentUser: ReturnType<
    typeof signal<{ id?: string; username: string } | null>
  >;

  beforeEach(() => {
    provider = createMockProvider();
    currentUser = signal<{ id?: string; username: string } | null>(null);
  });

  it('sets local presence identity with username and color when current user is known', () => {
    currentUser.set({ id: 'u1', username: 'alice' });
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();

    expect(provider.setLocalPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        user: {
          id: 'u1',
          username: 'alice',
          color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        },
        status: 'active',
        location: { kind: 'elements' },
      })
    );
  });

  it('clears local presence identity when no user is signed in', () => {
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    expect(() => TestBed.flushEffects()).not.toThrow();
    expect(provider.setLocalPresence).toHaveBeenCalledWith({ user: null });
  });

  it('forwards setActiveLocation to the provider', () => {
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();
    provider.setLocalPresence.mockClear();

    service.setActiveLocation('timeline:abc');
    expect(provider.setLocalPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        location: { kind: 'timeline', elementId: 'abc' },
      })
    );

    service.setActiveLocation(null);
    expect(provider.setLocalPresence).toHaveBeenCalledWith(
      expect.objectContaining({ location: null })
    );
  });

  it('mirrors remote sessions via the users signal', () => {
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();

    const users = [session('s1', 'bob'), session('s2', 'eve')];
    provider.remotePresence$.next(users);
    expect(service.users()).toEqual(users);
  });

  it('filters sessions by structured location via usersAtLocation', () => {
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();

    provider.remotePresence$.next([
      session('s1', 'bob', { kind: 'timeline', elementId: 'a' }),
      session('s2', 'eve', { kind: 'canvas', elementId: 'b' }),
      session('s3', 'mallory'),
    ]);

    const target = signal<string | null>('timeline:a');
    const filtered = service.usersAtLocation(target);
    expect(filtered().map(u => u.user.username)).toEqual(['bob']);

    target.set('canvas:b');
    expect(filtered().map(u => u.user.username)).toEqual(['eve']);

    target.set(null);
    expect(filtered().map(u => u.user.username)).toEqual([
      'bob',
      'eve',
      'mallory',
    ]);
  });
});
