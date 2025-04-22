import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import { UserDto } from '@inkweld/index';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
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
  protected userService = inject(UserService);
  protected projectService = inject(ProjectService);
  protected breakpointObserver = inject(BreakpointObserver);

  username: string | null = null;
  profileUser: UserDto | null = null;
  isMobile = false;
  isLoading = true;
  loadError = false;

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
    try {
      // For now, we'll use the current user as a placeholder
      // In a real implementation, we would fetch the profile for the specific username
      this.profileUser = this.userService.currentUser();
    } catch (error) {
      console.error('Failed to load user profile:', error);
      this.loadError = true;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadUserProjects() {
    try {
      await this.projectService.loadAllProjects();
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  navigateHome() {
    void this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
