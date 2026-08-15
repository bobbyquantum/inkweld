import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OAuthService as OAuthApiService } from '@inkweld/index';
import { ProjectsService } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AccountSettingsComponent } from './account-settings.component';

describe('AccountSettingsComponent (page)', () => {
  let component: AccountSettingsComponent;
  let fixture: ComponentFixture<AccountSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AccountSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideLocationMocks(),
        provideRouter([]),
        provideHttpClient(withXhr()),
        {
          provide: OAuthApiService,
          useValue: {
            listOAuthSessions: vi.fn().mockReturnValue(of([])),
            getOAuthSessionDetails: vi.fn().mockReturnValue(of({})),
          },
        },
        {
          provide: ProjectsService,
          useValue: { listUserProjects: vi.fn().mockReturnValue(of([])) },
        },
        {
          provide: DialogGatewayService,
          useValue: { openConfirmationDialog: vi.fn().mockResolvedValue(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the authorized-apps section', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Authorized Applications');
  });

  it('should render a back button to home', () => {
    const backButton = fixture.nativeElement.querySelector(
      '[data-testid="account-settings-back"]'
    );
    expect(backButton).toBeTruthy();
  });
});
