import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { UsersService } from '@inkweld/index';
import { SystemConfigService } from '@services/core/system-config.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  PolicyAcceptanceDialogComponent,
  type PolicyAcceptanceDialogData,
} from './policy-acceptance-dialog.component';

describe('PolicyAcceptanceDialogComponent', () => {
  let fixture: ComponentFixture<PolicyAcceptanceDialogComponent>;
  let component: PolicyAcceptanceDialogComponent;
  let acceptPolicy: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let refreshSystemFeatures: ReturnType<typeof vi.fn>;
  let policyVersion: ReturnType<typeof signal<string | undefined>>;

  async function create(data: PolicyAcceptanceDialogData): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), PolicyAcceptanceDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: UsersService, useValue: { acceptPolicy } },
        {
          provide: SystemConfigService,
          useValue: {
            hasPrivacyPolicy: signal(true),
            hasTerms: signal(false),
            policyVersion,
            refreshSystemFeatures,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyAcceptanceDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    acceptPolicy = vi.fn();
    close = vi.fn();
    refreshSystemFeatures = vi.fn();
    policyVersion = signal<string | undefined>('v1');
  });

  it('asks a first-time user to accept and links the configured documents', async () => {
    await create({ version: 'v1', isUpdate: false });
    expect(el().textContent).toContain('Please review our policies');
    expect(
      el().querySelector('[data-testid="policy-acceptance-privacy-link"]')
    ).toBeTruthy();
    expect(
      el().querySelector('[data-testid="policy-acceptance-terms-link"]')
    ).toBeNull();
  });

  it('uses "changed" wording for a returning user', async () => {
    await create({ version: 'v1', isUpdate: true });
    expect(el().textContent).toContain('Our policies have changed');
  });

  it('records acceptance and closes', async () => {
    acceptPolicy.mockReturnValue(of({ needsAcceptance: false }));
    await create({ version: 'v1', isUpdate: false });

    await component.accept();

    expect(acceptPolicy).toHaveBeenCalledWith({ version: 'v1' });
    expect(close).toHaveBeenCalledWith('accepted');
  });

  it('stays open and refreshes when the documents changed meanwhile', async () => {
    acceptPolicy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400 }))
    );
    await create({ version: 'v1', isUpdate: false });

    await component.accept();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(refreshSystemFeatures).toHaveBeenCalled();
    expect(
      el().querySelector('[data-testid="policy-acceptance-changed"]')
    ).toBeTruthy();

    // The next click sends whatever version the refresh brought in.
    policyVersion.set('v2');
    acceptPolicy.mockReturnValue(of({ needsAcceptance: false }));
    await component.accept();
    expect(acceptPolicy).toHaveBeenLastCalledWith({ version: 'v2' });
    expect(close).toHaveBeenCalledWith('accepted');
  });

  it('shows an error and stays open on other failures', async () => {
    acceptPolicy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );
    await create({ version: 'v1', isUpdate: false });

    await component.accept();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(
      el().querySelector('[data-testid="policy-acceptance-failed"]')
    ).toBeTruthy();
  });

  it('closes with "declined" on sign out', async () => {
    await create({ version: 'v1', isUpdate: false });
    component.decline();
    expect(close).toHaveBeenCalledWith('declined');
  });
});
