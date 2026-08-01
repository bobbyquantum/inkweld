import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import { WritingStatsWidgetComponent } from '@components/writing-stats-widget/writing-stats-widget.component';
import { type User } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { Subject, takeUntil } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-user-profile',
  imports: [
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    UserAvatarComponent,
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

  @ViewChild(UserAvatarComponent)
  private readonly avatarComponent!: UserAvatarComponent;

  readonly username = signal<string | null>(null);
  readonly profileUser = signal<User | null>(null);
  readonly isMobile = signal(false);
  readonly isLoading = signal(true);
  readonly loadError = signal(false);
  readonly isOwner = signal(false);

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.setupBreakpointObserver();
    this.route.paramMap
      .pipe(debounceTime(10), takeUntil(this.destroy$))
      .subscribe(params => {
        this.username.set(params.get('username'));
        if (this.username()) {
          void this.loadUserProfile();
          void this.loadUserProjects();
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

  private loadUserProfile() {
    this.isLoading.set(true);
    this.loadError.set(false);

    setTimeout(() => {
      try {
        const user = this.userService.currentUser();
        this.profileUser.set(user);
        this.isOwner.set(
          user?.username === this.userService.currentUser().username
        );
      } catch (error) {
        console.error('Failed to load user profile:', error);
        this.loadError.set(true);
      } finally {
        this.isLoading.set(false);
      }
    });
  }

  private async loadUserProjects() {
    try {
      await this.projectService.loadProjects();
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  navigateHome() {
    void this.router.navigate(['/']);
  }

  openEditAvatarDialog(): void {
    void this.dialogGateway.openEditAvatarDialog().then(result => {
      if (result) {
        void this.avatarComponent.loadAvatar();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
