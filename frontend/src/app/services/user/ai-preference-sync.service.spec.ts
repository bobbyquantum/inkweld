import {
  computed,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type User, UserAuthProvider, UsersService } from '@inkweld/index';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import {
  AI_PREFERENCE_KEY,
  AI_PREFERENCE_UNSYNCED_KEY,
  SettingsService,
} from '../core/settings.service';
import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { AiPreferenceSyncService } from './ai-preference-sync.service';
import { UserService } from './user.service';

const ANONYMOUS: User = { id: '', username: 'anonymous', enabled: false };

function author(aiAllowed: boolean | null | undefined): User {
  const user: User = {
    id: 'u1',
    username: 'ada',
    enabled: true,
    authProvider: UserAuthProvider.Local,
  };
  if (aiAllowed !== undefined) user.aiAllowed = aiAllowed;
  return user;
}

describe('AiPreferenceSyncService', () => {
  let currentUser: ReturnType<typeof signal<User>>;
  let serverMode: boolean;
  let updateProfile: ReturnType<typeof vi.fn>;
  let setCurrentUser: ReturnType<typeof vi.fn>;
  let settings: SettingsService;

  /** Build the services against what the test put in localStorage. */
  function start(): AiPreferenceSyncService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SettingsService,
        {
          provide: StorageContextService,
          useValue: { prefixKey: (key: string) => key },
        },
        {
          provide: UserService,
          useValue: {
            currentUser,
            isAuthenticated: computed(
              () => currentUser().username !== 'anonymous'
            ),
            setCurrentUser,
          },
        },
        {
          provide: SetupService,
          useValue: { isServerMode: () => serverMode },
        },
        { provide: UsersService, useValue: { updateProfile } },
        {
          provide: LoggerService,
          useValue: { warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
        },
      ],
    });
    settings = TestBed.inject(SettingsService);
    const service = TestBed.inject(AiPreferenceSyncService);
    service.start();
    TestBed.tick();
    return service;
  }

  /** Let the PATCH promise settle and the effect run again. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    serverMode = true;
    currentUser = signal<User>(ANONYMOUS);
    setCurrentUser = vi.fn((user: User) => {
      currentUser.set(user);
      return Promise.resolve();
    });
    updateProfile = vi.fn((body: { aiAllowed: boolean }) =>
      of({ ...author(body.aiAllowed), authProvider: undefined })
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it("takes the account's Allow AI on a new device", async () => {
    start();
    currentUser.set(author(true));
    await settle();

    expect(settings.aiAllowed()).toBe(true);
    expect(localStorage.getItem(AI_PREFERENCE_KEY)).toBe('allow');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("takes the account's No AI over this browser's earlier Allow AI", async () => {
    localStorage.setItem(AI_PREFERENCE_KEY, 'allow');
    start();
    currentUser.set(author(false));
    await settle();

    expect(settings.aiAllowed()).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('sends a choice made in this browser to the account', async () => {
    start();
    currentUser.set(author(false));
    await settle();

    settings.setAiAllowed(true);
    await settle();

    expect(updateProfile).toHaveBeenCalledWith({ aiAllowed: true });
    expect(settings.aiChoiceUnsynced()).toBe(false);
    expect(localStorage.getItem(AI_PREFERENCE_UNSYNCED_KEY)).toBeNull();
    // The cached user is merged, not replaced by the PATCH response.
    expect(currentUser().aiAllowed).toBe(true);
    expect(currentUser().authProvider).toBe(UserAuthProvider.Local);
  });

  it('sends a choice made on /setup when the account signs in', async () => {
    start();
    settings.setAiAllowed(true); // before any account
    await settle();
    expect(updateProfile).not.toHaveBeenCalled();

    currentUser.set(author(false));
    await settle();

    expect(updateProfile).toHaveBeenCalledWith({ aiAllowed: true });
    expect(settings.aiAllowed()).toBe(true);
    expect(currentUser().aiAllowed).toBe(true);
  });

  it('uploads the browser choice to an account that never chose', async () => {
    localStorage.setItem(AI_PREFERENCE_KEY, 'allow');
    start();
    currentUser.set(author(null));
    await settle();

    expect(updateProfile).toHaveBeenCalledWith({ aiAllowed: true });
  });

  it('leaves an account that never chose alone when the browser has no choice', async () => {
    start();
    currentUser.set(author(null));
    await settle();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(settings.aiAllowed()).toBe(false);
  });

  it('does nothing against a server that does not keep the choice', async () => {
    localStorage.setItem(AI_PREFERENCE_KEY, 'allow');
    start();
    currentUser.set(author(undefined));
    await settle();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(settings.aiAllowed()).toBe(true);
  });

  it('keeps the browser choice in Browser mode', async () => {
    serverMode = false;
    localStorage.setItem(AI_PREFERENCE_KEY, 'allow');
    start();
    currentUser.set(author(false));
    await settle();

    expect(settings.aiAllowed()).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('ignores the anonymous user', async () => {
    localStorage.setItem(AI_PREFERENCE_KEY, 'allow');
    start();
    currentUser.set({ ...ANONYMOUS, aiAllowed: false });
    await settle();

    expect(settings.aiAllowed()).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('keeps an unsent choice pending and retries on the next refresh', async () => {
    updateProfile.mockReturnValueOnce(throwError(() => new Error('offline')));
    start();
    currentUser.set(author(false));
    await settle();

    settings.setAiAllowed(true);
    await settle();
    expect(settings.aiChoiceUnsynced()).toBe(true);
    // Still the user's own choice, not the account's older one.
    expect(settings.aiAllowed()).toBe(true);

    currentUser.set(author(false)); // e.g. the session recheck after reconnecting
    await settle();
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(settings.aiChoiceUnsynced()).toBe(false);
    expect(currentUser().aiAllowed).toBe(true);
  });

  it('sends a change made while a request is in flight once it is done', async () => {
    const first = new Subject<User>();
    updateProfile.mockReturnValueOnce(first);
    start();
    currentUser.set(author(false));
    await settle();

    settings.setAiAllowed(true);
    await settle();
    settings.setAiAllowed(false);
    await settle();
    expect(updateProfile).toHaveBeenCalledTimes(1);

    first.next(author(true));
    first.complete();
    await settle();

    expect(updateProfile).toHaveBeenLastCalledWith({ aiAllowed: false });
    expect(settings.aiAllowed()).toBe(false);
    expect(settings.aiChoiceUnsynced()).toBe(false);
    expect(currentUser().aiAllowed).toBe(false);
  });

  it('keeps the choice pending if the account stored something else', async () => {
    updateProfile.mockReturnValueOnce(of(author(null)));
    start();
    currentUser.set(author(false));
    await settle();

    settings.setAiAllowed(true);
    await settle();

    expect(settings.aiChoiceUnsynced()).toBe(true);
    expect(settings.aiAllowed()).toBe(true);
  });

  it('only starts once', () => {
    const service = start();
    service.start();
    currentUser.set(author(true));
    TestBed.tick();
    expect(settings.aiAllowed()).toBe(true);
  });
});
