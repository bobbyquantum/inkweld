import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import {
  OAuthService as OAuthApiService,
  OAuthSessionDetails,
  OAuthSessionDetailsGrantsInner,
  OAuthSessionDetailsGrantsInnerRole,
  PublicOAuthSession,
  UpdateOAuthGrantRequestRole,
} from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';

/**
 * Account Settings Component
 *
 * Provides user-level settings including:
 * - Connected OAuth apps management (revoke, modify permissions)
 * - Future: notification settings, privacy settings, etc.
 */
@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
})
export class AccountSettingsComponent implements OnInit {
  private oauthApiService = inject(OAuthApiService);
  private snackBar = inject(MatSnackBar);
  private dialogGateway = inject(DialogGatewayService);

  /** Connected OAuth sessions */
  sessions = signal<PublicOAuthSession[]>([]);

  /** Detailed session info (loaded on expand) */
  sessionDetails = signal<Map<string, OAuthSessionDetails>>(new Map());

  /** Loading states */
  loading = signal(true);
  loadingDetails = signal<Set<string>>(new Set());
  revokingSession = signal<string | null>(null);
  revokingGrant = signal<string | null>(null);
  updatingGrant = signal<string | null>(null);

  /** Error state */
  error = signal<string | null>(null);

  /** Role options for dropdown */
  readonly roleOptions = [
    { value: UpdateOAuthGrantRequestRole.Viewer, label: 'View only' },
    { value: UpdateOAuthGrantRequestRole.Editor, label: 'View and edit' },
    { value: UpdateOAuthGrantRequestRole.Admin, label: 'Full access' },
  ];

  /** Check if there are any sessions */
  hasSessions = computed(() => this.sessions().length > 0);

  ngOnInit(): void {
    this.loadSessions();
  }

  /** Load all OAuth sessions */
  loadSessions(): void {
    this.loading.set(true);
    this.error.set(null);

    this.oauthApiService.listOAuthSessions().subscribe({
      next: sessions => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: err => {
        console.error('Failed to load OAuth sessions:', err);
        this.error.set('Failed to load connected apps');
        this.loading.set(false);
      },
    });
  }

  /** Load details for a specific session */
  loadSessionDetails(sessionId: string): void {
    if (this.sessionDetails().has(sessionId)) {
      return; // Already loaded
    }

    this.loadingDetails.update(set => {
      const newSet = new Set(set);
      newSet.add(sessionId);
      return newSet;
    });

    this.oauthApiService.getOAuthSessionDetails(sessionId).subscribe({
      next: details => {
        this.sessionDetails.update(map => {
          const newMap = new Map(map);
          newMap.set(sessionId, details);
          return newMap;
        });
        this.loadingDetails.update(set => {
          const newSet = new Set(set);
          newSet.delete(sessionId);
          return newSet;
        });
      },
      error: err => {
        console.error('Failed to load session details:', err);
        this.snackBar.open('Failed to load session details', 'Dismiss', {
          duration: 3000,
        });
        this.loadingDetails.update(set => {
          const newSet = new Set(set);
          newSet.delete(sessionId);
          return newSet;
        });
      },
    });
  }

  /** Revoke an entire OAuth session */
  async revokeSession(session: PublicOAuthSession): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Revoke Access',
      message: `Are you sure you want to revoke all access for "${session.client.name}"? This app will no longer be able to access any of your projects.`,
      confirmText: 'Revoke Access',
    });

    if (!confirmed) return;

    this.revokingSession.set(session.id);

    this.oauthApiService.revokeOAuthSession(session.id).subscribe({
      next: () => {
        this.sessions.update(sessions =>
          sessions.filter(s => s.id !== session.id)
        );
        this.sessionDetails.update(map => {
          const newMap = new Map(map);
          newMap.delete(session.id);
          return newMap;
        });
        this.snackBar.open('Access revoked successfully', 'Dismiss', {
          duration: 3000,
        });
        this.revokingSession.set(null);
      },
      error: err => {
        console.error('Failed to revoke session:', err);
        this.snackBar.open('Failed to revoke access', 'Dismiss', {
          duration: 3000,
        });
        this.revokingSession.set(null);
      },
    });
  }

  /** Revoke access to a specific project */
  async revokeGrant(
    sessionId: string,
    grant: OAuthSessionDetailsGrantsInner
  ): Promise<void> {
    const details = this.sessionDetails().get(sessionId);
    if (!details) return;

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Revoke Project Access',
      message: `Are you sure you want to revoke access to "${grant.projectTitle}" for this app?`,
      confirmText: 'Revoke',
    });

    if (!confirmed) return;

    const grantKey = `${sessionId}:${grant.projectId}`;
    this.revokingGrant.set(grantKey);

    this.oauthApiService
      .revokeOAuthGrant(sessionId, grant.projectId)
      .subscribe({
        next: () => {
          // Update the session details
          this.sessionDetails.update(map => {
            const newMap = new Map(map);
            const session = newMap.get(sessionId);
            if (session) {
              newMap.set(sessionId, {
                ...session,
                grants: session.grants.filter(
                  g => g.projectId !== grant.projectId
                ),
              });
            }
            return newMap;
          });

          // If no grants left, remove the session entirely
          const updatedDetails = this.sessionDetails().get(sessionId);
          if (updatedDetails && updatedDetails.grants.length === 0) {
            this.sessions.update(sessions =>
              sessions.filter(s => s.id !== sessionId)
            );
            this.sessionDetails.update(map => {
              const newMap = new Map(map);
              newMap.delete(sessionId);
              return newMap;
            });
          }

          this.snackBar.open('Project access revoked', 'Dismiss', {
            duration: 3000,
          });
          this.revokingGrant.set(null);
        },
        error: err => {
          console.error('Failed to revoke grant:', err);
          this.snackBar.open('Failed to revoke project access', 'Dismiss', {
            duration: 3000,
          });
          this.revokingGrant.set(null);
        },
      });
  }

  /** Update access level for a specific project */
  updateGrantRole(
    sessionId: string,
    grant: OAuthSessionDetailsGrantsInner,
    newRole: UpdateOAuthGrantRequestRole
  ): void {
    const grantKey = `${sessionId}:${grant.projectId}`;
    this.updatingGrant.set(grantKey);

    this.oauthApiService
      .updateOAuthGrant(sessionId, grant.projectId, { role: newRole })
      .subscribe({
        next: () => {
          // Update the grant in session details
          this.sessionDetails.update(map => {
            const newMap = new Map(map);
            const session = newMap.get(sessionId);
            if (session) {
              newMap.set(sessionId, {
                ...session,
                grants: session.grants.map(g =>
                  g.projectId === grant.projectId
                    ? {
                        ...g,
                        role: newRole as unknown as OAuthSessionDetailsGrantsInnerRole,
                      }
                    : g
                ),
              });
            }
            return newMap;
          });

          this.snackBar.open('Access level updated', 'Dismiss', {
            duration: 3000,
          });
          this.updatingGrant.set(null);
        },
        error: err => {
          console.error('Failed to update grant:', err);
          this.snackBar.open('Failed to update access level', 'Dismiss', {
            duration: 3000,
          });
          this.updatingGrant.set(null);
        },
      });
  }

  /** Get role label for display */
  getRoleLabel(
    role: OAuthSessionDetailsGrantsInnerRole | UpdateOAuthGrantRequestRole
  ): string {
    const option = this.roleOptions.find(o => o.value === role);
    return option?.label ?? role;
  }

  /** Format date for display */
  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Check if a session is being revoked */
  isRevokingSession(sessionId: string): boolean {
    return this.revokingSession() === sessionId;
  }

  /** Check if a grant is being revoked */
  isRevokingGrant(sessionId: string, projectId: string): boolean {
    return this.revokingGrant() === `${sessionId}:${projectId}`;
  }

  /** Check if a grant is being updated */
  isUpdatingGrant(sessionId: string, projectId: string): boolean {
    return this.updatingGrant() === `${sessionId}:${projectId}`;
  }

  /** Check if session details are loading */
  isLoadingDetails(sessionId: string): boolean {
    return this.loadingDetails().has(sessionId);
  }

  /** Get session details */
  getSessionDetails(sessionId: string): OAuthSessionDetails | undefined {
    return this.sessionDetails().get(sessionId);
  }
}
