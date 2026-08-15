import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ActivatedRoute,
  type Params,
  Router,
  RouterLink,
} from '@angular/router';
import { ProjectGrantListComponent } from '@components/project-grant-list/project-grant-list.component';
import {
  type AuthorizationInfo,
  type AuthorizationInfoProjectsInner,
  ConsentRequestDefaultRole,
  ConsentRequestGrantsInnerRole,
  OAuthService as OAuthApiService,
} from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

/** Grant with selection state for the UI */
interface ProjectGrant {
  project: AuthorizationInfoProjectsInner;
  selected: boolean;
  role: ConsentRequestGrantsInnerRole;
}

/** Error response from OAuth API */
interface OAuthApiError {
  error?: {
    error?: string;
    error_description?: string;
  };
}

@Component({
  selector: 'app-oauth-consent',
  templateUrl: './oauth-consent.component.html',
  styleUrls: ['./oauth-consent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoModule,
    ProjectGrantListComponent,
  ],
})
export class OAuthConsentComponent implements OnInit {
  private readonly oauthApiService = inject(OAuthApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  /** Authorization info from the backend */
  authInfo = signal<AuthorizationInfo | null>(null);

  /** Loading states */
  loading = signal(true);
  submitting = signal(false);

  /** Completed state — authorization was granted and redirect attempted */
  completed = signal(false);

  /** The redirect URI returned after successful consent */
  redirectUri = signal<string | null>(null);

  /** Error message to display */
  error = signal<string | null>(null);

  /** Query parameters from the URL */
  private readonly queryParams = signal<{
    clientId: string;
    redirectUri: string;
    responseType: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope?: string;
    state?: string;
  } | null>(null);

  /** Project grants with selection state */
  projectGrants = signal<ProjectGrant[]>([]);

  /** Rows for the shared {@link ProjectGrantListComponent}. */
  grantRows = computed(() =>
    this.projectGrants().map(g => ({
      projectId: g.project.id,
      projectTitle: g.project.title,
      projectSlug: g.project.slug,
      role: g.role,
      selected: g.selected,
    }))
  );

  /** Whether the user granted access to all projects */
  accessAllProjects = signal(false);

  /** Default role applied in all-projects mode */
  defaultRole = signal<ConsentRequestDefaultRole>(
    ConsentRequestDefaultRole.Viewer
  );

  /** Whether at least one project is selected (when not all-projects) */
  hasSelection = computed(() => {
    return (
      this.accessAllProjects() || this.projectGrants().some(g => g.selected)
    );
  });

  /** Client display info */
  clientName = computed(
    () => this.authInfo()?.client?.clientName ?? 'Unknown App'
  );
  clientUri = computed(() => this.authInfo()?.client?.clientUri);
  clientLogo = computed(() => this.authInfo()?.client?.logoUri);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params: Params) => {
      const clientId = params['client_id'] as string | undefined;
      const redirectUri = params['redirect_uri'] as string | undefined;
      const responseType = params['response_type'] as string | undefined;
      const codeChallenge = params['code_challenge'] as string | undefined;
      const codeChallengeMethod = params['code_challenge_method'] as
        string | undefined;
      const scope = params['scope'] as string | undefined;
      const state = params['state'] as string | undefined;

      // Validate required parameters
      if (
        !clientId ||
        !redirectUri ||
        !responseType ||
        !codeChallenge ||
        !codeChallengeMethod
      ) {
        this.error.set('Missing required OAuth parameters');
        this.loading.set(false);
        return;
      }

      this.queryParams.set({
        clientId,
        redirectUri,
        responseType,
        codeChallenge,
        codeChallengeMethod,
        scope,
        state,
      });

      this.loadAuthorizationInfo();
    });
  }

  /** Load authorization info from the backend */
  private loadAuthorizationInfo(): void {
    const params = this.queryParams();
    if (!params) return;

    this.loading.set(true);
    this.error.set(null);

    this.oauthApiService
      .getAuthorizationInfo(
        params.clientId,
        params.redirectUri,
        params.responseType,
        params.codeChallenge,
        params.codeChallengeMethod,
        params.scope,
        params.state
      )
      .subscribe({
        next: info => {
          this.authInfo.set(info);
          // Initialize project grants with all projects unselected, default to viewer
          this.projectGrants.set(
            info.projects.map(p => ({
              project: p,
              selected: false,
              role: ConsentRequestGrantsInnerRole.Viewer,
            }))
          );
          this.loading.set(false);
        },
        error: (err: OAuthApiError) => {
          console.error('Failed to load authorization info:', err);
          const errorMessage =
            err.error?.error_description ??
            err.error?.error ??
            'Failed to load authorization info';
          this.error.set(errorMessage);
          this.loading.set(false);
        },
      });
  }

  /** Toggle project selection */
  toggleProject(grant: ProjectGrant): void {
    this.patchGrant(grant.project.id, g => ({
      ...g,
      selected: !g.selected,
    }));
  }

  /** Update role for a project */
  updateRole(grant: ProjectGrant, role: ConsentRequestGrantsInnerRole): void {
    this.patchGrant(grant.project.id, g => ({ ...g, role }));
  }

  /**
   * Locate a grant by project ID and apply a partial update, preserving the
   * surrounding array reference so signal equality checks behave predictably.
   */
  private patchGrant(
    projectId: string,
    updater: (grant: ProjectGrant) => ProjectGrant
  ): void {
    const grants = this.projectGrants();
    const idx = grants.findIndex(g => g.project.id === projectId);
    if (idx >= 0) {
      const updated = [...grants];
      updated[idx] = updater(grants[idx]);
      this.projectGrants.set(updated);
    }
  }

  /** Shared component: toggle a project's selection */
  onGrantSelectionChange(event: {
    projectId: string;
    selected: boolean;
  }): void {
    this.patchGrant(event.projectId, g => ({ ...g, selected: event.selected }));
  }

  /** Shared component: change a project's role */
  onGrantRoleChange(event: { projectId: string; role: string }): void {
    this.patchGrant(event.projectId, g => ({
      ...g,
      role: event.role as ConsentRequestGrantsInnerRole,
    }));
  }

  /** Shared component: change all-projects + default role */
  onAllProjectsChange(event: {
    accessAllProjects: boolean;
    defaultRole: string;
  }): void {
    this.accessAllProjects.set(event.accessAllProjects);
    this.defaultRole.set(event.defaultRole as ConsentRequestDefaultRole);
  }

  /** Submit consent (approve) */
  approve(): void {
    const params = this.queryParams();
    if (!params) return;

    const selectedGrants = this.projectGrants()
      .filter(g => g.selected)
      .map(g => ({
        projectId: g.project.id,
        role: g.role,
      }));

    if (selectedGrants.length === 0 && !this.accessAllProjects()) {
      this.snackBar.open(
        this.transloco.translate('auth.oauthConsent.selectAtLeastOne'),
        this.transloco.translate('dismiss'),
        {
          duration: 3000,
        }
      );
      return;
    }

    this.submitting.set(true);

    this.oauthApiService
      .submitConsent(
        params.clientId,
        params.redirectUri,
        params.responseType,
        params.codeChallenge,
        params.codeChallengeMethod,
        params.scope,
        params.state,
        {
          grants: selectedGrants,
          accessAllProjects: this.accessAllProjects(),
          defaultRole: this.defaultRole(),
        }
      )
      .subscribe({
        next: response => {
          // Show the completion state first, then attempt the redirect.
          // For custom-scheme URIs (e.g. claude://) the browser tab stays open,
          // so the user will see the "return to your application" message.
          this.redirectUri.set(response.redirectUri);
          this.completed.set(true);
          this.submitting.set(false);

          // Attempt to navigate to the redirect URI
          globalThis.location.href = response.redirectUri;
        },
        error: (err: OAuthApiError) => {
          console.error('Failed to submit consent:', err);
          const errorMessage =
            err.error?.error_description ??
            err.error?.error ??
            'Failed to authorize';
          this.snackBar.open(errorMessage, 'Dismiss', { duration: 5000 });
          this.submitting.set(false);
        },
      });
  }

  /** Deny authorization */
  deny(): void {
    const params = this.queryParams();
    if (!params) {
      void this.router.navigate(['/']);
      return;
    }

    // Redirect back to the client with access_denied error
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set(
      'error_description',
      'User denied the authorization request'
    );
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }
    globalThis.location.href = redirectUrl.toString();
  }

  /** Select all projects */
  selectAll(): void {
    this.projectGrants.update(grants =>
      grants.map(g => ({ ...g, selected: true }))
    );
  }

  /** Deselect all projects */
  deselectAll(): void {
    this.projectGrants.update(grants =>
      grants.map(g => ({ ...g, selected: false }))
    );
  }
}
