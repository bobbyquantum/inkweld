import {
  HttpErrorResponse,
  provideHttpClient,
  withXhr,
} from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AddOAuthGrantRequestRole,
  OAuthService as OAuthApiService,
  type OAuthSessionDetails,
  OAuthSessionDetailsGrantsInnerRole,
  type Project,
  ProjectsService,
  type PublicOAuthSession,
} from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { AuthorizedAppsComponent } from './authorized-apps.component';

function createMockSession(
  overrides: Partial<PublicOAuthSession> = {}
): PublicOAuthSession {
  return {
    id: 'session-1',
    client: { id: 'client-1', name: 'Test App', logoUri: null },
    createdAt: Date.now(),
    lastUsedAt: null,
    projectCount: 2,
    ...overrides,
  };
}

function createMockSessionDetails(
  overrides: Partial<OAuthSessionDetails> = {}
): OAuthSessionDetails {
  return {
    session: createMockSession(),
    grants: [
      {
        projectId: 'proj-1',
        projectTitle: 'My Novel',
        projectSlug: 'my-novel',
        role: OAuthSessionDetailsGrantsInnerRole.Editor,
      },
      {
        projectId: 'proj-2',
        projectTitle: 'Short Stories',
        projectSlug: 'short-stories',
        role: OAuthSessionDetailsGrantsInnerRole.Viewer,
      },
    ],
    ...overrides,
  };
}

describe('AuthorizedAppsComponent', () => {
  let component: AuthorizedAppsComponent;
  let fixture: ComponentFixture<AuthorizedAppsComponent>;
  let oauthServiceMock: {
    listOAuthSessions: ReturnType<typeof vi.fn>;
    getOAuthSessionDetails: ReturnType<typeof vi.fn>;
    revokeOAuthSession: ReturnType<typeof vi.fn>;
    updateOAuthGrant: ReturnType<typeof vi.fn>;
    revokeOAuthGrant: ReturnType<typeof vi.fn>;
    addOAuthGrant: ReturnType<typeof vi.fn>;
    updateOAuthSessionSettings: ReturnType<typeof vi.fn>;
  };
  let projectsServiceMock: {
    listUserProjects: ReturnType<typeof vi.fn>;
  };
  let dialogGatewayMock: {
    openConfirmationDialog: ReturnType<typeof vi.fn>;
  };
  let snackBarMock: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    oauthServiceMock = {
      listOAuthSessions: vi.fn().mockReturnValue(of([])),
      getOAuthSessionDetails: vi
        .fn()
        .mockReturnValue(of(createMockSessionDetails())),
      revokeOAuthSession: vi.fn().mockReturnValue(of({ message: 'Revoked' })),
      updateOAuthGrant: vi.fn().mockReturnValue(of({ message: 'Updated' })),
      revokeOAuthGrant: vi.fn().mockReturnValue(of({ message: 'Revoked' })),
      addOAuthGrant: vi.fn().mockReturnValue(of({ message: 'Added' })),
      updateOAuthSessionSettings: vi
        .fn()
        .mockReturnValue(of({ message: 'Updated' })),
    };

    projectsServiceMock = {
      listUserProjects: vi.fn().mockReturnValue(
        of([
          { id: 'proj-1', title: 'My Novel', slug: 'my-novel' },
          { id: 'proj-2', title: 'Short Stories', slug: 'short-stories' },
          { id: 'proj-3', title: 'New Project', slug: 'new-project' },
        ] as Project[])
      ),
    };

    dialogGatewayMock = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };

    snackBarMock = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AuthorizedAppsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: OAuthApiService, useValue: oauthServiceMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: MatSnackBar, useValue: snackBarMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorizedAppsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load sessions on init', async () => {
    const sessions = [createMockSession()];
    oauthServiceMock.listOAuthSessions.mockReturnValue(of(sessions));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(oauthServiceMock.listOAuthSessions).toHaveBeenCalled();
    expect(component.sessions()).toEqual(sessions);
    expect(component.isLoading()).toBe(false);
  });

  it('should show empty state when no sessions', async () => {
    oauthServiceMock.listOAuthSessions.mockReturnValue(of([]));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sessions()).toEqual([]);
  });

  it('should handle load sessions error', async () => {
    oauthServiceMock.listOAuthSessions.mockReturnValue(
      throwError(() => new Error('Network error'))
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sessions()).toEqual([]);
    expect(component.isLoading()).toBe(false);
  });

  it('should load session details when expanded', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    expect(oauthServiceMock.getOAuthSessionDetails).toHaveBeenCalledWith(
      'session-1',
      'body',
      false,
      { transferCache: false }
    );
    expect(component.expandedSession()).toEqual(details);
  });

  it('should collapse when clicking expanded session', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    // Expand
    await component.loadSessionDetails('session-1');
    expect(component.expandedSession()).toBeTruthy();

    // Collapse
    await component.loadSessionDetails('session-1');
    expect(component.expandedSession()).toBeNull();
  });

  it('should revoke a session after confirmation', async () => {
    const session = createMockSession();
    oauthServiceMock.listOAuthSessions.mockReturnValue(of([session]));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.revokeSession(session);

    expect(dialogGatewayMock.openConfirmationDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Disconnect Application' })
    );
    expect(oauthServiceMock.revokeOAuthSession).toHaveBeenCalledWith(
      'session-1',
      'body',
      false,
      { transferCache: false }
    );
    expect(component.sessions()).toEqual([]);
  });

  it('should not revoke a session when confirmation is cancelled', async () => {
    dialogGatewayMock.openConfirmationDialog.mockResolvedValue(false);
    const session = createMockSession();
    oauthServiceMock.listOAuthSessions.mockReturnValue(of([session]));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.revokeSession(session);

    expect(oauthServiceMock.revokeOAuthSession).not.toHaveBeenCalled();
    expect(component.sessions()).toHaveLength(1);
  });

  it('should handle revoke session error', async () => {
    const session = createMockSession();
    oauthServiceMock.listOAuthSessions.mockReturnValue(of([session]));
    oauthServiceMock.revokeOAuthSession.mockReturnValue(
      throwError(() => new Error('Failed'))
    );

    fixture.detectChanges();
    await fixture.whenStable();

    await component.revokeSession(session);

    // Session should still be there
    expect(component.sessions()).toHaveLength(1);
    expect(component.revokingSessionId()).toBeNull();
  });

  it('should treat 2xx parse error as successful revoke', async () => {
    const session = createMockSession();
    oauthServiceMock.listOAuthSessions.mockReturnValue(of([session]));
    oauthServiceMock.revokeOAuthSession.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 200,
            statusText: 'OK',
            error: new SyntaxError('Unexpected end of JSON input'),
          })
      )
    );

    fixture.detectChanges();
    await fixture.whenStable();

    await component.revokeSession(session);

    expect(component.sessions()).toEqual([]);
    expect(component.revokingSessionId()).toBeNull();
  });

  it('should update grant role', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    const grant = details.grants[0];
    await component.updateGrantRole(
      'session-1',
      grant.projectId,
      OAuthSessionDetailsGrantsInnerRole.Admin
    );

    expect(oauthServiceMock.updateOAuthGrant).toHaveBeenCalledWith(
      'session-1',
      'proj-1',
      { role: OAuthSessionDetailsGrantsInnerRole.Admin }
    );
    expect(component.expandedSession()!.grants[0].role).toBe(
      OAuthSessionDetailsGrantsInnerRole.Admin
    );
  });

  it('should revoke a grant after confirmation', async () => {
    const details = createMockSessionDetails();
    const sessions = [createMockSession()];
    oauthServiceMock.listOAuthSessions.mockReturnValue(of(sessions));
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.loadSessionDetails('session-1');

    const grant = details.grants[0];
    await component.revokeGrant('session-1', grant);

    expect(dialogGatewayMock.openConfirmationDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Revoke Project Access' })
    );
    expect(oauthServiceMock.revokeOAuthGrant).toHaveBeenCalledWith(
      'session-1',
      'proj-1'
    );
    expect(component.expandedSession()!.grants).toHaveLength(1);
    expect(component.sessions()[0].projectCount).toBe(1);
  });

  it('should not revoke a grant when confirmation is cancelled', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    dialogGatewayMock.openConfirmationDialog.mockResolvedValue(false);

    const grant = details.grants[0];
    await component.revokeGrant('session-1', grant);

    expect(oauthServiceMock.revokeOAuthGrant).not.toHaveBeenCalled();
    expect(component.expandedSession()!.grants).toHaveLength(2);
  });

  it('should update all-projects settings and refresh session details', async () => {
    const details = createMockSessionDetails();
    const updatedDetails = createMockSessionDetails({
      session: {
        ...createMockSession(),
        accessAllProjects: true,
        defaultRole: 'admin' as never,
      },
    });
    oauthServiceMock.getOAuthSessionDetails
      .mockReturnValueOnce(of(details))
      .mockReturnValue(of(updatedDetails));

    await component.loadSessionDetails('session-1');

    await component.onAllProjectsChange({
      accessAllProjects: true,
      defaultRole: 'admin',
    });

    expect(oauthServiceMock.updateOAuthSessionSettings).toHaveBeenCalledWith(
      'session-1',
      { accessAllProjects: true, defaultRole: 'admin' }
    );
    expect(oauthServiceMock.getOAuthSessionDetails).toHaveBeenCalledTimes(2);
    expect(component.accessAllProjects()).toBe(true);
    expect(component.defaultRole()).toBe('admin');
  });

  it('should expose computed grant rows and all-projects state from session details', async () => {
    const details = createMockSessionDetails();
    details.session.accessAllProjects = true;
    details.session.defaultRole = 'admin' as never;
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    expect(component.accessAllProjects()).toBe(true);
    expect(component.defaultRole()).toBe('admin');
    expect(component.grantRows()).toHaveLength(2);
    expect(component.grantRows()[0]).toEqual(
      expect.objectContaining({ projectId: 'proj-1', role: 'editor' })
    );
  });

  it('onGrantRoleChange updates a grant role through the shared handler', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    await component.onGrantRoleChange({
      projectId: 'proj-1',
      role: 'admin',
    });

    expect(oauthServiceMock.updateOAuthGrant).toHaveBeenCalledWith(
      'session-1',
      'proj-1',
      { role: OAuthSessionDetailsGrantsInnerRole.Admin }
    );
    expect(component.expandedSession()!.grants[0].role).toBe(
      OAuthSessionDetailsGrantsInnerRole.Admin
    );
  });

  it('onGrantRemove revokes a project grant via the shared handler', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    await component.onGrantRemove('proj-1');

    expect(oauthServiceMock.revokeOAuthGrant).toHaveBeenCalledWith(
      'session-1',
      'proj-1'
    );
    expect(component.expandedSession()!.grants).toHaveLength(1);
  });

  it('onGrantRemove does nothing when the grant is not present', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');

    await component.onGrantRemove('non-existent');
    expect(oauthServiceMock.revokeOAuthGrant).not.toHaveBeenCalled();
  });

  it('should handle all-projects update failure', async () => {
    component.expandedSession.set(createMockSessionDetails());
    oauthServiceMock.updateOAuthSessionSettings = vi
      .fn()
      .mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 }))
      );

    await component.onAllProjectsChange({
      accessAllProjects: true,
      defaultRole: 'admin',
    });

    expect(oauthServiceMock.updateOAuthSessionSettings).toHaveBeenCalled();
    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to update access settings',
      'Close',
      { duration: 3000 }
    );
    expect(component.savingAllProjects()).toBe(false);
  });

  it('should format dates correctly', () => {
    const timestamp = new Date('2025-06-15').getTime();
    const formatted = component.formatDate(timestamp);
    expect(formatted).toContain('2025');
    expect(formatted).toContain('Jun');
  });

  it('should generate grant keys', () => {
    expect(component.grantKey('session-1', 'proj-1')).toBe('session-1:proj-1');
  });

  it('should load and filter available projects for add', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');
    await component.toggleAddProject();

    expect(projectsServiceMock.listUserProjects).toHaveBeenCalled();
    expect(component.showAddProject()).toBe(true);
    // proj-1 and proj-2 are already granted, only proj-3 should be available
    expect(component.availableProjects()).toHaveLength(1);
    expect(component.availableProjects()[0].id).toBe('proj-3');
  });

  it('should toggle add project form off', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');
    await component.toggleAddProject();
    expect(component.showAddProject()).toBe(true);

    await component.toggleAddProject();
    expect(component.showAddProject()).toBe(false);
  });

  it('should add a project grant', async () => {
    const details = createMockSessionDetails();
    const sessions = [createMockSession()];
    oauthServiceMock.listOAuthSessions.mockReturnValue(of(sessions));
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.loadSessionDetails('session-1');
    await component.toggleAddProject();

    component.selectedProjectId.set('proj-3');
    component.selectedRole.set(AddOAuthGrantRequestRole.Editor);

    // After adding, session details are reloaded
    const updatedDetails = createMockSessionDetails({
      grants: [
        ...details.grants,
        {
          projectId: 'proj-3',
          projectTitle: 'New Project',
          projectSlug: 'new-project',
          role: OAuthSessionDetailsGrantsInnerRole.Editor,
        },
      ],
    });
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(updatedDetails));

    await component.addProjectGrant('session-1');

    expect(oauthServiceMock.addOAuthGrant).toHaveBeenCalledWith('session-1', {
      projectId: 'proj-3',
      role: AddOAuthGrantRequestRole.Editor,
    });
    expect(component.expandedSession()!.grants).toHaveLength(3);
    expect(component.showAddProject()).toBe(false);
    expect(component.sessions()[0].projectCount).toBe(3);
  });

  it('should cancel add project', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');
    await component.toggleAddProject();

    component.cancelAddProject();

    expect(component.showAddProject()).toBe(false);
  });

  it('should close add project form when collapsing session', async () => {
    const details = createMockSessionDetails();
    oauthServiceMock.getOAuthSessionDetails.mockReturnValue(of(details));

    await component.loadSessionDetails('session-1');
    await component.toggleAddProject();
    expect(component.showAddProject()).toBe(true);

    // Collapse by clicking again
    await component.loadSessionDetails('session-1');
    expect(component.showAddProject()).toBe(false);
  });
});
