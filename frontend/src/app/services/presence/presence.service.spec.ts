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

  it('does not re-call setLocalPresence when already active', () => {
    currentUser.set({ id: 'u1', username: 'alice' });
    const service = setupService({ provider, currentUser });
    // First call: sets identity and marks active
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();
    const callCount = provider.setLocalPresence.mock.calls.length;

    // Second call while still active — markActive should be a no-op re: status
    // (setActiveLocation still calls setLocalPresence for location, but markActive's
    //  inner if-block should NOT fire again)
    service.setActiveLocation({ kind: 'timeline', elementId: 'e1' });
    // Only one additional setLocalPresence call (for location update), not two
    expect(provider.setLocalPresence.mock.calls.length).toBe(callCount + 1);
  });

  it('re-marks status as active after becoming editing/idle (covers markActive if-branch)', () => {
    currentUser.set({ id: 'u1', username: 'alice' });
    const service = setupService({ provider, currentUser });
    service.setActiveLocation({ kind: 'elements' });
    TestBed.flushEffects();

    // Transition to editing status
    service.markEditing();
    provider.setLocalPresence.mockClear();

    // Now setActiveLocation calls markActive while status is 'editing' → should
    // enter the `if (currentStatus !== 'active')` branch and push active status
    service.setActiveLocation({ kind: 'timeline', elementId: 'e1' });

    const calls = provider.setLocalPresence.mock.calls;
    const statusCall = calls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>)?.['status'] === 'active'
    );
    expect(statusCall).toBeDefined();
  });

  describe('normalizeLocation string parsing', () => {
    let service: PresenceService;

    beforeEach(() => {
      service = setupService({ provider, currentUser });
    });

    function getLastLocation() {
      const calls = provider.setLocalPresence.mock.calls;
      return calls[calls.length - 1]?.[0]?.location ?? null;
    }

    it('parses canvas:id string', () => {
      service.setActiveLocation('canvas:elem-5');
      expect(getLastLocation()).toEqual({
        kind: 'canvas',
        elementId: 'elem-5',
      });
    });

    it('parses document:id string', () => {
      service.setActiveLocation('document:doc-9');
      expect(getLastLocation()).toEqual({
        kind: 'document',
        documentId: 'doc-9',
      });
    });

    it('parses worldbuilding:schemaId string', () => {
      service.setActiveLocation('worldbuilding:schema-3');
      expect(getLastLocation()).toEqual({
        kind: 'worldbuilding',
        schemaId: 'schema-3',
      });
    });

    it('parses worldbuilding (no id) string', () => {
      service.setActiveLocation('worldbuilding:');
      expect(getLastLocation()).toEqual({ kind: 'worldbuilding' });
    });

    it('parses media string', () => {
      service.setActiveLocation('media:something');
      expect(getLastLocation()).toEqual({ kind: 'media' });
    });

    it('parses settings string', () => {
      service.setActiveLocation('settings:');
      expect(getLastLocation()).toEqual({ kind: 'settings' });
    });

    it('parses elements string', () => {
      service.setActiveLocation('elements:');
      expect(getLastLocation()).toEqual({ kind: 'elements' });
    });

    it('falls back to other for unknown kind', () => {
      service.setActiveLocation('unknown:label-xyz');
      expect(getLastLocation()).toEqual({
        kind: 'other',
        label: 'unknown:label-xyz',
      });
    });
  });
});
