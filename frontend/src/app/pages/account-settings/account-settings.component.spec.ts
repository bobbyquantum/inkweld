import { provideLocationMocks } from '@angular/common/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import {
  OAuthService as OAuthApiService,
  OAuthSessionDetails,
  OAuthSessionDetailsGrantsInnerRole,
  PublicOAuthSession,
  UpdateOAuthGrantRequestRole,
} from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { of, throwError } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { AccountSettingsComponent } from './account-settings.component';

describe('AccountSettingsComponent', () => {
  let component: AccountSettingsComponent;
  let fixture: ComponentFixture<AccountSettingsComponent>;
  let oauthService: MockedObject<OAuthApiService>;
  let snackBar: MockedObject<MatSnackBar>;
  let dialogGateway: MockedObject<DialogGatewayService>;

  const mockSessions: PublicOAuthSession[] = [
    {
      id: 'session-1',
      client: {
        id: 'client-1',
        name: 'Test App',
        logoUri: 'https://test-app.example.com/logo.png',
      },
      createdAt: 1705315800000,
      lastUsedAt: null,
      projectCount: 2,
    },
    {
      id: 'session-2',
      client: {
        id: 'client-2',
        name: 'Another App',
        logoUri: null,
      },
      createdAt: 1708437600000,
      lastUsedAt: null,
      projectCount: 1,
    },
  ];

  const mockSessionDetails: OAuthSessionDetails = {
    session: mockSessions[0],
    grants: [
      {
        projectId: 'proj-1',
        projectTitle: 'Project One',
        projectSlug: 'project-one',
        role: OAuthSessionDetailsGrantsInnerRole.Viewer,
      },
      {
        projectId: 'proj-2',
        projectTitle: 'Project Two',
        projectSlug: 'project-two',
        role: OAuthSessionDetailsGrantsInnerRole.Editor,
      },
    ],
  };

  beforeEach(async () => {
    oauthService = {
      listOAuthSessions: vi.fn().mockReturnValue(of(mockSessions)),
      getOAuthSessionDetails: vi.fn().mockReturnValue(of(mockSessionDetails)),
      revokeOAuthSession: vi.fn().mockReturnValue(of({ message: 'ok' })),
      revokeOAuthGrant: vi.fn().mockReturnValue(of({ message: 'ok' })),
      updateOAuthGrant: vi.fn().mockReturnValue(of({ message: 'ok' })),
    } as unknown as MockedObject<OAuthApiService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    dialogGateway = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideLocationMocks(),
        provideRouter([
          { path: 'settings', component: AccountSettingsComponent },
        ]),
        { provide: OAuthApiService, useValue: oauthService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: DialogGatewayService, useValue: dialogGateway },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should load sessions on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(oauthService.listOAuthSessions).toHaveBeenCalled();
      expect(component.sessions().length).toBe(2);
      expect(component.loading()).toBe(false);
    });

    it('should handle load error', async () => {
      oauthService.listOAuthSessions = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('Network error')));

      fixture = TestBed.createComponent(AccountSettingsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.error()).toBe('Failed to load connected apps');
      expect(component.loading()).toBe(false);
    });
  });

  describe('session details', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should load details when panel is expanded', () => {
      component.loadSessionDetails('session-1');

      expect(oauthService.getOAuthSessionDetails).toHaveBeenCalledWith(
        'session-1'
      );
      expect(component.getSessionDetails('session-1')).toEqual(
        mockSessionDetails
      );
    });

    it('should not reload details if already loaded', () => {
      component.loadSessionDetails('session-1');
      component.loadSessionDetails('session-1');

      expect(oauthService.getOAuthSessionDetails).toHaveBeenCalledTimes(1);
    });

    it('should handle details load error', () => {
      oauthService.getOAuthSessionDetails = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('Failed')));

      component.loadSessionDetails('session-1');

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to load session details',
        'Dismiss',
        { duration: 3000 }
      );
    });
  });

  describe('revoke session', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should show confirmation dialog before revoking', async () => {
      await component.revokeSession(mockSessions[0]);

      expect(dialogGateway.openConfirmationDialog).toHaveBeenCalledWith({
        title: 'Revoke Access',
        message: expect.stringContaining('Test App'),
        confirmText: 'Revoke Access',
      });
    });

    it('should revoke session and remove from list', async () => {
      await component.revokeSession(mockSessions[0]);

      expect(oauthService.revokeOAuthSession).toHaveBeenCalledWith('session-1');
      expect(
        component
          .sessions()
          .find((s: PublicOAuthSession) => s.id === 'session-1')
      ).toBeUndefined();
    });

    it('should not revoke if user cancels', async () => {
      dialogGateway.openConfirmationDialog = vi.fn().mockResolvedValue(false);

      await component.revokeSession(mockSessions[0]);

      expect(oauthService.revokeOAuthSession).not.toHaveBeenCalled();
    });

    it('should handle revoke error', async () => {
      oauthService.revokeOAuthSession = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('Failed')));

      await component.revokeSession(mockSessions[0]);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to revoke access',
        'Dismiss',
        { duration: 3000 }
      );
    });
  });

  describe('revoke grant', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      component.loadSessionDetails('session-1');
    });

    it('should revoke grant and update details', async () => {
      const grant = mockSessionDetails.grants[0];
      await component.revokeGrant('session-1', grant);

      expect(oauthService.revokeOAuthGrant).toHaveBeenCalledWith(
        'session-1',
        'proj-1'
      );

      const details = component.getSessionDetails('session-1');
      expect(
        details?.grants.find(g => g.projectId === 'proj-1')
      ).toBeUndefined();
    });
  });

  describe('update grant role', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      component.loadSessionDetails('session-1');
    });

    it('should update grant role', () => {
      const grant = mockSessionDetails.grants[0];
      component.updateGrantRole(
        'session-1',
        grant,
        UpdateOAuthGrantRequestRole.Admin
      );

      expect(oauthService.updateOAuthGrant).toHaveBeenCalledWith(
        'session-1',
        'proj-1',
        { role: UpdateOAuthGrantRequestRole.Admin }
      );
    });

    it('should update the grant in session details', () => {
      const grant = mockSessionDetails.grants[0];
      component.updateGrantRole(
        'session-1',
        grant,
        UpdateOAuthGrantRequestRole.Admin
      );

      const details = component.getSessionDetails('session-1');
      const updatedGrant = details?.grants.find(g => g.projectId === 'proj-1');
      expect(updatedGrant?.role).toBe(OAuthSessionDetailsGrantsInnerRole.Admin);
    });

    it('should handle update error', () => {
      oauthService.updateOAuthGrant = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('Failed')));

      const grant = mockSessionDetails.grants[0];
      component.updateGrantRole(
        'session-1',
        grant,
        UpdateOAuthGrantRequestRole.Admin
      );

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to update access level',
        'Dismiss',
        { duration: 3000 }
      );
    });
  });

  describe('helper methods', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should format date correctly', () => {
      const result = component.formatDate(1705315800000);
      expect(result).toContain('2024');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
    });

    it('should get role label', () => {
      expect(
        component.getRoleLabel(OAuthSessionDetailsGrantsInnerRole.Viewer)
      ).toBe('View only');
      expect(
        component.getRoleLabel(OAuthSessionDetailsGrantsInnerRole.Editor)
      ).toBe('View and edit');
      expect(
        component.getRoleLabel(OAuthSessionDetailsGrantsInnerRole.Admin)
      ).toBe('Full access');
    });

    it('should compute hasSessions correctly', () => {
      expect(component.hasSessions()).toBe(true);

      component.sessions.set([]);
      expect(component.hasSessions()).toBe(false);
    });
  });
});
