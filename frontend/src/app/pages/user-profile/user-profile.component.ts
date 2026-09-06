import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ActivityGridComponent } from '@components/activity-grid/activity-grid.component';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import { WritingStatsWidgetComponent } from '@components/writing-stats-widget/writing-stats-widget.component';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import type { UserProfile } from '@inkweld/model/user-profile';
import { TranslocoModule } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserProfileService } from '@services/user/user-profile.service';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

/** What the page is showing, beyond a successfully loaded profile. */
export type ProfileLoadState =
  'loading' | 'ready' | 'private' | 'not-found' | 'error';

/**
 * Public user profile page (`/:username`).
 *
 * Anyone may open it; the server decides what the caller gets back based
 * on the owner's visibility settings. Private profiles render a dedicated
 * "this profile is private" state rather than an error.
 *
 * In local (offline) mode there is no server to ask, so the page falls back
 * to showing the local user's own card and projects.
 */
@Component({
  selector: 'app-user-profile',
  imports: [
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
    UserAvatarComponent,
    ActivityGridComponent,
    WritingStatsWidgetComponent,
  ],
  templateUrl: './user-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  protected router = inject(Router);
  protected userService = inject(UnifiedUserService);
  protected projectService = inject(UnifiedProjectService);
  protected breakpointObserver = inject(BreakpointObserver);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly profileService = inject(UserProfileService);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  @ViewChild(UserAvatarComponent)
  private readonly avatarComponent?: UserAvatarComponent;

  readonly username = signal<string | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly loadState = signal<ProfileLoadState>('loading');
  readonly isMobile = signal(false);

  readonly activity = signal<ProfileActivityYear | null>(null);
  readonly activityLoading = signal(false);
  readonly activityError = signal(false);

  readonly isOwner = computed(() => this.profile()?.isOwner ?? false);
  /** Offline mode has no server-side stats, so the widget has nothing to show. */
  readonly isLocalMode = computed(
    () => this.setupService.getMode() === 'local'
  );
  readonly isAnonymous = computed(() => !this.userService.isAuthenticated());
  readonly projects = computed(() => this.profile()?.projects ?? []);

  /** Kept for the existing template contract; mirrors `loadState`. */
  readonly isLoading = computed(() => this.loadState() === 'loading');
  readonly loadError = computed(() => this.loadState() === 'error');

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.setupBreakpointObserver();
    this.route.paramMap
      .pipe(debounceTime(10), takeUntil(this.destroy$))
      .subscribe(params => {
        const username = params.get('username');
        this.username.set(username);
        if (username) {
          void this.loadProfile(username);
        }
      });
  }

  private setupBreakpointObserver() {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
      });
  }

  /** Load the profile card, then (if visible) the current year's activity. */
  async loadProfile(username: string): Promise<void> {
    this.loadState.set('loading');
    this.profile.set(null);
    this.activity.set(null);
    this.activityError.set(false);

    if (this.setupService.getMode() === 'local') {
      this.loadLocalProfile(username);
      return;
    }

    try {
      const profile = await firstValueFrom(
        this.profileService.getProfile(username)
      );
      this.profile.set(profile);
      this.loadState.set('ready');
      if (profile.sections.activity) {
        void this.loadActivity(username);
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.loadState.set('private');
      } else if (err instanceof HttpErrorResponse && err.status === 404) {
        this.loadState.set('not-found');
      } else {
        this.logger.error('UserProfile', 'Failed to load profile', err);
        this.loadState.set('error');
      }
    }
  }

  /**
   * Offline fallback: only the local user exists, so anything else is a 404.
   * Their projects come from the local project store.
   */
  private loadLocalProfile(username: string): void {
    const current = this.userService.currentUser();
    if (current?.username !== username) {
      this.loadState.set('not-found');
      return;
    }
    void this.projectService
      .loadProjects()
      .catch(err =>
        this.logger.warn('UserProfile', 'Failed to load local projects', err)
      )
      .finally(() => {
        this.profile.set({
          username: current.username,
          name: current.name ?? null,
          bio: current.bio ?? null,
          hasAvatar: current.hasAvatar ?? false,
          isOwner: true,
          sections: { activity: false, projects: true },
          projects: this.projectService.projects().map(p => ({
            slug: p.slug,
            title: p.title,
            description: p.description ?? null,
            updatedDate: 0,
          })),
        });
        this.loadState.set('ready');
      });
  }

  async loadActivity(username: string, year?: number): Promise<void> {
    this.activityLoading.set(true);
    this.activityError.set(false);
    try {
      const data = await firstValueFrom(
        this.profileService.getActivity(username, year)
      );
      this.activity.set(data);
    } catch (err) {
      this.logger.warn('UserProfile', 'Failed to load activity', err);
      this.activityError.set(true);
    } finally {
      this.activityLoading.set(false);
    }
  }

  onYearChange(year: number): void {
    const username = this.username();
    if (username) void this.loadActivity(username, year);
  }

  navigateHome() {
    void this.router.navigate(['/']);
  }

  openEditAvatarDialog(): void {
    void this.dialogGateway.openEditAvatarDialog().then(result => {
      if (result) {
        void this.avatarComponent?.loadAvatar();
      }
    });
  }

  /** Open the account settings (bio + visibility live there), then refresh. */
  openEditProfile(): void {
    void this.dialogGateway.openUserSettingsDialog('account').then(() => {
      const username = this.username();
      if (username) void this.loadProfile(username);
    });
  }

  /** Router link for a project card; only meaningful in server mode. */
  projectLink(slug: string): string[] {
    return ['/', this.profile()?.username ?? '', slug];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
