import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import { UserDto } from '@inkweld/index';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { Subject, takeUntil } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    UserAvatarComponent,
  ],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  protected router = inject(Router);
  protected userService = inject(UnifiedUserService);
  protected projectService = inject(UnifiedProjectService);
  protected breakpointObserver = inject(BreakpointObserver);
  private dialogGateway = inject(DialogGatewayService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild(UserAvatarComponent) private avatarComponent!: UserAvatarComponent;

  username: string | null = null;
  profileUser: UserDto | null = null;
  isMobile = false;
  isLoading = true;
  loadError = false;
  isOwner = false;

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.setupBreakpointObserver();
    this.route.paramMap
      .pipe(
        debounceTime(10), // Prevent rapid succession processing
        takeUntil(this.destroy$)
      )
      .subscribe(params => {
        this.username = params.get('username');
        if (this.username) {
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
        this.isMobile = result.matches;
      });
  }

  private loadUserProfile() {
    this.isLoading = true;
    this.loadError = false;

    // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      try {
        // For now, we'll use the current user as a placeholder
        // In a real implementation, we would fetch the profile for the specific username
        this.profileUser = this.userService.currentUser();
        this.isOwner =
          this.profileUser?.username ===
          this.userService.currentUser().username;
      } catch (error) {
        console.error('Failed to load user profile:', error);
        this.loadError = true;
      } finally {
        this.isLoading = false;
        this.cdr.detectChanges();
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




