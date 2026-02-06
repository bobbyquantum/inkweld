import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  AuthorizationInfo,
  AuthorizationInfoProjectsInner,
  ConsentRequestGrantsInnerRole,
  OAuthService as OAuthApiService,
} from '@inkweld/index';

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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink,
  ],
})
export class OAuthConsentComponent implements OnInit {
  private oauthApiService = inject(OAuthApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

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
  private queryParams = signal<{
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

  /** Available roles for selection */
  readonly roles: { value: ConsentRequestGrantsInnerRole; label: string }[] = [
    { value: ConsentRequestGrantsInnerRole.Viewer, label: 'View only' },
    { value: ConsentRequestGrantsInnerRole.Editor, label: 'View and edit' },
    { value: ConsentRequestGrantsInnerRole.Admin, label: 'Full access' },
  ];

  /** Whether at least one project is selected */
  hasSelection = computed(() => {
    return this.projectGrants().some(g => g.selected);
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
        | string
        | undefined;
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
    const grants = this.projectGrants();
    const idx = grants.findIndex(g => g.project.id === grant.project.id);
    if (idx >= 0) {
      const updated = [...grants];
      updated[idx] = { ...grants[idx], selected: !grants[idx].selected };
      this.projectGrants.set(updated);
    }
  }

  /** Update role for a project */
  updateRole(grant: ProjectGrant, role: ConsentRequestGrantsInnerRole): void {
    const grants = this.projectGrants();
    const idx = grants.findIndex(g => g.project.id === grant.project.id);
    if (idx >= 0) {
      const updated = [...grants];
      updated[idx] = { ...grants[idx], role };
      this.projectGrants.set(updated);
    }
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

    if (selectedGrants.length === 0) {
      this.snackBar.open('Please select at least one project', 'Dismiss', {
        duration: 3000,
      });
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
        { grants: selectedGrants }
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
          window.location.href = response.redirectUri;
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
    window.location.href = redirectUrl.toString();
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
