import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { DeleteAccountComponent } from '@components/delete-account/delete-account.component';
import { LegalLinksComponent } from '@components/legal-links/legal-links.component';
import { SetupService } from '@services/core/setup.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { DeleteAccountPageComponent } from './delete-account-page.component';

describe('DeleteAccountPageComponent', () => {
  let mode: string | null;
  let authenticated: boolean;
  let query: Record<string, string>;
  let initialize: ReturnType<typeof vi.fn>;

  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), DeleteAccountPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
        { provide: SetupService, useValue: { getMode: () => mode } },
        {
          provide: UnifiedUserService,
          useValue: { initialize, isAuthenticated: () => authenticated },
        },
        {
          provide: SystemConfigService,
          useValue: { systemFeatures: () => ({ defaultServerName: 'Quill' }) },
        },
        {
          provide: StorageContextService,
          useValue: { getActiveConfig: () => null },
        },
      ],
    })
      .overrideComponent(DeleteAccountPageComponent, {
        remove: { imports: [DeleteAccountComponent, LegalLinksComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(DeleteAccountPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    mode = 'server';
    authenticated = false;
    query = {};
    initialize = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    sessionStorage.removeItem('oauth_return_url');
  });

  it('shows the delete flow to a signed-in user', async () => {
    authenticated = true;
    const el = await render();

    expect(initialize).toHaveBeenCalled();
    expect(el.querySelector('app-delete-account')).toBeTruthy();
    expect(el.textContent).toContain('contact the administrator of Quill');
  });

  it('asks a signed-out visitor to sign in, then come back', async () => {
    const el = await render();
    expect(el.querySelector('app-delete-account')).toBeFalsy();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    el.querySelector<HTMLButtonElement>(
      '[data-testid="delete-account-sign-in-button"]'
    )!.click();

    expect(sessionStorage.getItem('oauth_return_url')).toBe('/delete-account');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('explains there is no online account in local mode', async () => {
    mode = 'local';
    const el = await render();

    expect(initialize).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="delete-account-local"]')
    ).toBeTruthy();
  });

  it('confirms the deletion after the flow lands here', async () => {
    query = { deleted: '1' };
    const el = await render();

    expect(
      el.querySelector('[data-testid="delete-account-done"]')
    ).toBeTruthy();
    expect(el.querySelector('app-delete-account')).toBeFalsy();
  });
});
