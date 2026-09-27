import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { UsersService } from '@inkweld/index';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PolicyAcceptanceService } from './policy-acceptance.service';

describe('PolicyAcceptanceService', () => {
  let service: PolicyAcceptanceService;
  let getPolicyAcceptance: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let afterClosed: Subject<string | undefined>;
  let logout: ReturnType<typeof vi.fn>;
  let routerEvents: Subject<unknown>;
  const required = signal(true);
  const version = signal<string | undefined>('v1');
  const authenticated = signal(true);
  let mode = 'server';
  let systemConfigCreated = 0;
  const currentUser = signal<{ id: string; username: string } | undefined>({
    id: 'u1',
    username: 'alice',
  });

  /** Start the service; `initialUrl` is where the first navigation lands. */
  function setup(initialUrl: string | null = '/'): void {
    routerEvents = new Subject();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // `url` is what Router reports before the first navigation ends.
        { provide: Router, useValue: { events: routerEvents, url: '/' } },
        { provide: SetupService, useValue: { getMode: () => mode } },
        { provide: UsersService, useValue: { getPolicyAcceptance } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        {
          provide: SystemConfigService,
          useFactory: () => {
            systemConfigCreated++;
            return {
              requirePolicyAcceptance: required,
              policyVersion: version,
            };
          },
        },
        {
          provide: UnifiedUserService,
          useValue: { isAuthenticated: authenticated, currentUser, logout },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    });
    service = TestBed.inject(PolicyAcceptanceService);
    service.start();
    if (initialUrl !== null) {
      routerEvents.next(new NavigationEnd(0, initialUrl, initialUrl));
    }
  }

  /** Let effects and the status request settle. */
  async function flush(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    required.set(true);
    version.set('v1');
    authenticated.set(true);
    currentUser.set({ id: 'u1', username: 'alice' });
    mode = 'server';
    systemConfigCreated = 0;
    afterClosed = new Subject();
    dialogOpen = vi.fn().mockReturnValue({ afterClosed: () => afterClosed });
    logout = vi.fn().mockResolvedValue(undefined);
    getPolicyAcceptance = vi.fn().mockReturnValue(
      of({
        required: true,
        currentVersion: 'v1',
        acceptedVersion: null,
        acceptedAt: null,
        needsAcceptance: true,
      })
    );
  });

  it('opens a blocking dialog when the user has not accepted', async () => {
    setup();
    await flush();

    expect(getPolicyAcceptance).toHaveBeenCalledTimes(1);
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    const config = dialogOpen.mock.calls[0][1];
    expect(config.disableClose).toBe(true);
    expect(config.data).toEqual({ version: 'v1', isUpdate: false });
  });

  it('marks the prompt as an update when an older version was accepted', async () => {
    getPolicyAcceptance.mockReturnValue(
      of({
        required: true,
        currentVersion: 'v2',
        acceptedVersion: 'v1',
        acceptedAt: 1,
        needsAcceptance: true,
      })
    );
    version.set('v2');
    setup();
    await flush();
    expect(dialogOpen.mock.calls[0][1].data).toEqual({
      version: 'v2',
      isUpdate: true,
    });
  });

  it('does nothing when the user is up to date', async () => {
    getPolicyAcceptance.mockReturnValue(
      of({ required: true, currentVersion: 'v1', needsAcceptance: false })
    );
    setup();
    await flush();
    expect(dialogOpen).not.toHaveBeenCalled();
  });

  it('does not check when acceptance is not required or nobody is signed in', async () => {
    required.set(false);
    setup();
    await flush();
    authenticated.set(false);
    required.set(true);
    await flush();
    expect(getPolicyAcceptance).not.toHaveBeenCalled();
  });

  it('does not create SystemConfigService before a server user signs in', async () => {
    authenticated.set(false);
    setup();
    await flush();
    expect(systemConfigCreated).toBe(0);

    authenticated.set(true);
    await flush();
    expect(systemConfigCreated).toBe(1);
    expect(getPolicyAcceptance).toHaveBeenCalledTimes(1);
  });

  it('never runs in local mode', async () => {
    mode = 'local';
    setup();
    await flush();
    expect(systemConfigCreated).toBe(0);
    expect(getPolicyAcceptance).not.toHaveBeenCalled();
  });

  it('waits for the first navigation before deciding', async () => {
    setup(null);
    await flush();
    expect(getPolicyAcceptance).not.toHaveBeenCalled();

    routerEvents.next(new NavigationEnd(1, '/terms?x=1', '/terms?x=1'));
    await flush();
    expect(getPolicyAcceptance).not.toHaveBeenCalled();
  });

  it('waits while the user is reading /privacy or /terms', async () => {
    setup('/privacy');
    await flush();
    expect(getPolicyAcceptance).not.toHaveBeenCalled();

    routerEvents.next(new NavigationEnd(1, '/', '/'));
    await flush();
    expect(getPolicyAcceptance).toHaveBeenCalledTimes(1);
  });

  it('lets the user delete their account without accepting first', async () => {
    setup('/delete-account');
    await flush();
    expect(getPolicyAcceptance).not.toHaveBeenCalled();
  });

  it('signs the user out when they decline', async () => {
    setup();
    await flush();
    afterClosed.next('declined');
    afterClosed.complete();
    await flush();
    expect(logout).toHaveBeenCalled();
  });

  it('does not sign out after acceptance, and asks again for a new version', async () => {
    setup();
    await flush();
    afterClosed.next('accepted');
    afterClosed.complete();
    await flush();
    expect(logout).not.toHaveBeenCalled();

    afterClosed = new Subject();
    version.set('v2');
    await flush();
    expect(getPolicyAcceptance).toHaveBeenCalledTimes(2);
  });

  it('never blocks the user when the status check fails', async () => {
    getPolicyAcceptance.mockReturnValue(throwError(() => new Error('down')));
    setup();
    await flush();
    expect(dialogOpen).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});
