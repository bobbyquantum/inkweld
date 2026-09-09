import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CloudSyncConnectService } from '@services/cloud-sync/cloud-sync-connect.service';
import { CloudSyncEngineService } from '@services/cloud-sync/cloud-sync-engine.service';
import { LoggerService } from '@services/core/logger.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncCallbackComponent } from './cloud-sync-callback.component';

describe('CloudSyncCallbackComponent', () => {
  let fixture: ComponentFixture<CloudSyncCallbackComponent>;
  let component: CloudSyncCallbackComponent;
  let params: Record<string, string | null>;
  let query: Record<string, string | null>;
  let connect: { completeAuthorization: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let userService: { initialize: ReturnType<typeof vi.fn> };
  let engine: {
    initialize: ReturnType<typeof vi.fn>;
    syncNow: ReturnType<typeof vi.fn>;
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CloudSyncCallbackComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (k: string) => params[k] ?? null },
              queryParamMap: { get: (k: string) => query[k] ?? null },
            },
          },
        },
        { provide: Router, useValue: router },
        { provide: CloudSyncConnectService, useValue: connect },
        { provide: UnifiedUserService, useValue: userService },
        { provide: CloudSyncEngineService, useValue: engine },
        {
          provide: LoggerService,
          useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CloudSyncCallbackComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    params = { provider: 'dropbox' };
    query = { code: 'code-1', state: 'state-1' };
    connect = { completeAuthorization: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    userService = { initialize: vi.fn().mockResolvedValue(undefined) };
    engine = {
      initialize: vi.fn(),
      syncNow: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('sends an account with existing authors to the setup chooser', async () => {
    connect.completeAuthorization.mockResolvedValue({
      kind: 'choose-profile',
      pending: { existingProfiles: [{ name: 'A', username: 'a', slugs: [] }] },
    });
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalled());

    expect(connect.completeAuthorization).toHaveBeenCalledWith(
      'dropbox',
      'code-1',
      'state-1'
    );
    // Nothing is configured until the user picks or adds an author
    expect(userService.initialize).not.toHaveBeenCalled();
    expect(engine.initialize).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/setup'], {
      replaceUrl: true,
      queryParams: { cloud: 'dropbox' },
    });
    expect(component.errorMessage()).toBe('');
  });

  it('sends a fresh account to the setup profile step', async () => {
    connect.completeAuthorization.mockResolvedValue({
      kind: 'needs-profile',
      pending: {},
    });
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.navigate).toHaveBeenCalledWith(['/setup'], {
      replaceUrl: true,
      queryParams: { cloud: 'dropbox' },
    });
    expect(userService.initialize).not.toHaveBeenCalled();
    expect(engine.initialize).not.toHaveBeenCalled();
  });

  it('shows a friendly message when the user cancelled at the provider', async () => {
    query = { error: 'access_denied' };
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe('You cancelled the Dropbox sign-in.');
    expect(connect.completeAuthorization).not.toHaveBeenCalled();
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-testid="cloud-sync-callback-error"]')?.textContent
    ).toContain('cancelled');
  });

  it('rejects unknown providers', async () => {
    params = { provider: 'icloud' };
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe('Unknown cloud storage provider.');
    expect(connect.completeAuthorization).not.toHaveBeenCalled();
  });

  it('reports an incomplete response', async () => {
    query = { code: 'only-code' };
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe(
      'The sign-in response was incomplete.'
    );
  });

  it('surfaces exchange failures without navigating', async () => {
    connect.completeAuthorization.mockRejectedValue(
      new Error('Authorization state mismatch. Please start again.')
    );
    await setup();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe(
      'Authorization state mismatch. Please start again.'
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
