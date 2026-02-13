import { TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AddOAuthGrantRequestRole,
  OAuthService as OAuthApiService,
  OAuthSessionDetails,
  OAuthSessionDetailsGrantsInner,
  OAuthSessionDetailsGrantsInnerRole,
  Project,
  ProjectsService,
  PublicOAuthSession,
  UpdateOAuthGrantRequestRole,
} from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-authorized-apps',
  standalone: true,
  imports: [
    TitleCasePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './authorized-apps.component.html',
  styleUrl: './authorized-apps.component.scss',
})
export class AuthorizedAppsComponent implements OnInit {
  private readonly oauthService = inject(OAuthApiService);
  private readonly projectsService = inject(ProjectsService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly snackBar = inject(MatSnackBar);

  readonly sessions = signal<PublicOAuthSession[]>([]);
  readonly expandedSession = signal<OAuthSessionDetails | null>(null);
  readonly isLoading = signal(false);
  readonly isLoadingDetails = signal(false);
  readonly revokingSessionId = signal<string | null>(null);
  readonly revokingGrantKey = signal<string | null>(null);
  readonly updatingGrantKey = signal<string | null>(null);
  readonly addingProject = signal(false);

  /** All user projects (loaded on demand for the "add project" dropdown) */
  readonly userProjects = signal<Project[]>([]);
  /** Projects available to add (not already granted) */
  readonly availableProjects = signal<Project[]>([]);
  /** Whether the add-project row is visible */
  readonly showAddProject = signal(false);
  /** Selected project + role for the add form */
  readonly selectedProjectId = signal<string | null>(null);
  readonly selectedRole = signal<AddOAuthGrantRequestRole>(
    AddOAuthGrantRequestRole.Viewer
  );

  readonly roles = Object.values(OAuthSessionDetailsGrantsInnerRole);
  readonly addRoles = Object.values(AddOAuthGrantRequestRole);

  ngOnInit(): void {
    void this.loadSessions();
  }

  async loadSessions(): Promise<void> {
    this.isLoading.set(true);
    try {
      const sessions = await firstValueFrom(
        this.oauthService.listOAuthSessions('body', false, {
          transferCache: false,
        })
      );
      this.sessions.set(sessions);
    } catch {
      this.snackBar.open('Failed to load authorized apps', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadSessionDetails(sessionId: string): Promise<void> {
    // Collapse if already expanded
    if (this.expandedSession()?.session.id === sessionId) {
      this.expandedSession.set(null);
      this.showAddProject.set(false);
      return;
    }

    this.isLoadingDetails.set(true);
    try {
      const details = await firstValueFrom(
        this.oauthService.getOAuthSessionDetails(sessionId, 'body', false, {
          transferCache: false,
        })
      );
      this.expandedSession.set(details);
    } catch {
      this.snackBar.open('Failed to load session details', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isLoadingDetails.set(false);
    }
  }

  async revokeSession(session: PublicOAuthSession): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Disconnect Application',
      message: `Are you sure you want to disconnect "${session.client.name}"? It will lose access to all ${session.projectCount} project(s). You can re-authorize it later.`,
      confirmText: 'Disconnect',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    this.revokingSessionId.set(session.id);
    try {
      await firstValueFrom(
        this.oauthService.revokeOAuthSession(session.id, 'body', false, {
          transferCache: false,
        })
      );
      this.removeSessionFromState(session.id);
      this.snackBar.open(`Disconnected ${session.client.name}`, 'Close', {
        duration: 3000,
      });
    } catch (error) {
      if (
        error instanceof HttpErrorResponse &&
        error.status >= 200 &&
        error.status < 300
      ) {
        this.removeSessionFromState(session.id);
        this.snackBar.open(`Disconnected ${session.client.name}`, 'Close', {
          duration: 3000,
        });
        return;
      }

      this.snackBar.open('Failed to disconnect app', 'Close', {
        duration: 3000,
      });
    } finally {
      this.revokingSessionId.set(null);
    }
  }

  async updateGrantRole(
    sessionId: string,
    grant: OAuthSessionDetailsGrantsInner,
    newRole: OAuthSessionDetailsGrantsInnerRole
  ): Promise<void> {
    const key = `${sessionId}:${grant.projectId}`;
    this.updatingGrantKey.set(key);
    try {
      await firstValueFrom(
        this.oauthService.updateOAuthGrant(sessionId, grant.projectId, {
          role: newRole as unknown as UpdateOAuthGrantRequestRole,
        })
      );
      // Update local state
      this.expandedSession.update(details => {
        if (!details) return null;
        return {
          ...details,
          grants: details.grants.map(g =>
            g.projectId === grant.projectId ? { ...g, role: newRole } : g
          ),
        };
      });
      this.snackBar.open('Permission updated', 'Close', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to update permission', 'Close', {
        duration: 3000,
      });
    } finally {
      this.updatingGrantKey.set(null);
    }
  }

  async revokeGrant(
    sessionId: string,
    grant: OAuthSessionDetailsGrantsInner
  ): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Revoke Project Access',
      message: `Remove "${grant.projectTitle}" from this application? It will no longer be able to access this project.`,
      confirmText: 'Revoke',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    const key = `${sessionId}:${grant.projectId}`;
    this.revokingGrantKey.set(key);
    try {
      await firstValueFrom(
        this.oauthService.revokeOAuthGrant(sessionId, grant.projectId)
      );
      // Update local state
      this.expandedSession.update(details => {
        if (!details) return null;
        const grants = details.grants.filter(
          g => g.projectId !== grant.projectId
        );
        return { ...details, grants };
      });
      // Update session project count
      this.sessions.update(s =>
        s.map(session =>
          session.id === sessionId
            ? { ...session, projectCount: session.projectCount - 1 }
            : session
        )
      );
      this.snackBar.open('Project access revoked', 'Close', {
        duration: 2000,
      });
    } catch {
      this.snackBar.open('Failed to revoke project access', 'Close', {
        duration: 3000,
      });
    } finally {
      this.revokingGrantKey.set(null);
    }
  }

  async toggleAddProject(): Promise<void> {
    if (this.showAddProject()) {
      this.showAddProject.set(false);
      return;
    }

    // Load user projects if not already loaded
    if (this.userProjects().length === 0) {
      try {
        const projects = await firstValueFrom(
          this.projectsService.listUserProjects()
        );
        this.userProjects.set(projects);
      } catch {
        this.snackBar.open('Failed to load projects', 'Close', {
          duration: 3000,
        });
        return;
      }
    }

    this.updateAvailableProjects();
    this.selectedProjectId.set(null);
    this.selectedRole.set(AddOAuthGrantRequestRole.Viewer);
    this.showAddProject.set(true);
  }

  private updateAvailableProjects(): void {
    const grantedIds = new Set(
      (this.expandedSession()?.grants ?? []).map(g => g.projectId)
    );
    this.availableProjects.set(
      this.userProjects().filter(p => !grantedIds.has(p.id))
    );
  }

  async addProjectGrant(sessionId: string): Promise<void> {
    const projectId = this.selectedProjectId();
    const role = this.selectedRole();
    if (!projectId) return;

    this.addingProject.set(true);
    try {
      await firstValueFrom(
        this.oauthService.addOAuthGrant(sessionId, {
          projectId,
          role,
        })
      );

      // Reload session details to get updated grants
      const details = await firstValueFrom(
        this.oauthService.getOAuthSessionDetails(sessionId, 'body', false, {
          transferCache: false,
        })
      );
      this.expandedSession.set(details);

      // Update session project count
      this.sessions.update(s =>
        s.map(session =>
          session.id === sessionId
            ? { ...session, projectCount: session.projectCount + 1 }
            : session
        )
      );

      this.showAddProject.set(false);
      this.selectedProjectId.set(null);
      this.snackBar.open('Project access granted', 'Close', {
        duration: 2000,
      });
    } catch {
      this.snackBar.open('Failed to add project access', 'Close', {
        duration: 3000,
      });
    } finally {
      this.addingProject.set(false);
    }
  }

  cancelAddProject(): void {
    this.showAddProject.set(false);
    this.selectedProjectId.set(null);
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  grantKey(sessionId: string, projectId: string): string {
    return `${sessionId}:${projectId}`;
  }

  private removeSessionFromState(sessionId: string): void {
    this.sessions.update(sessions => sessions.filter(s => s.id !== sessionId));
    if (this.expandedSession()?.session.id === sessionId) {
      this.expandedSession.set(null);
    }
  }
}
