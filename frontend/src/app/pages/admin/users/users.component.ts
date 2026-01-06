import { NgClass } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { AdminService, AdminUser } from '@services/admin/admin.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    NgClass,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
    UserAvatarComponent,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly userService = inject(UnifiedUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  @ViewChild('userListContainer')
  userListContainer?: ElementRef<HTMLDivElement>;

  readonly currentUser = this.userService.currentUser;
  readonly users = this.adminService.users;
  readonly pendingUsers = this.adminService.pendingUsers;
  readonly totalUsers = this.adminService.totalUsers;
  readonly hasMoreUsers = this.adminService.hasMoreUsers;
  readonly isLoading = this.adminService.isLoading;
  readonly isLoadingMore = this.adminService.isLoadingMore;
  readonly error = this.adminService.error;

  // Search state
  readonly searchQuery = signal('');
  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: { unsubscribe: () => void };

  // Filter state
  readonly selectedTab = signal(0);

  // Computed lists
  readonly activeUsers = computed(() =>
    this.users().filter(u => u.approved && u.enabled)
  );

  readonly disabledUsers = computed(() =>
    this.users().filter(u => u.approved && !u.enabled)
  );

  readonly adminUsers = computed(() => this.users().filter(u => u.isAdmin));

  ngOnInit(): void {
    // Set up debounced search
    this.searchSubscription = this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(query => {
        this.searchQuery.set(query);
        void this.loadUsers();
      });

    void this.loadUsers();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  clearSearch(): void {
    this.searchSubject.next('');
  }

  async loadUsers(): Promise<void> {
    try {
      await this.adminService.loadAllUsers({
        search: this.searchQuery() || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  async loadMoreUsers(): Promise<void> {
    if (this.isLoadingMore() || !this.hasMoreUsers()) return;

    try {
      await this.adminService.listUsers({
        search: this.searchQuery() || undefined,
        limit: PAGE_SIZE,
        offset: this.users().length,
      });
    } catch (err) {
      console.error('Failed to load more users:', err);
    }
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 100; // pixels from bottom
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      threshold;

    if (atBottom && this.hasMoreUsers() && !this.isLoadingMore()) {
      void this.loadMoreUsers();
    }
  }

  async approveUser(user: AdminUser): Promise<void> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: 'Approve User',
        message: `Are you sure you want to approve ${user.username}?`,
        confirmText: 'Approve',
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.approveUser(user.id);
      this.snackBar.open(`${user.username} has been approved`, 'Close', {
        duration: 3000,
      });
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to approve user:', err);
      this.snackBar.open('Failed to approve user', 'Close', { duration: 3000 });
    }
  }

  async rejectUser(user: AdminUser): Promise<void> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: 'Reject User',
        message: `Are you sure you want to reject ${user.username}? This will permanently delete their account.`,
        confirmText: 'Reject',
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.rejectUser(user.id);
      this.snackBar.open(`${user.username} has been rejected`, 'Close', {
        duration: 3000,
      });
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to reject user:', err);
      this.snackBar.open('Failed to reject user', 'Close', { duration: 3000 });
    }
  }

  async enableUser(user: AdminUser): Promise<void> {
    try {
      await this.adminService.enableUser(user.id);
      this.snackBar.open(`${user.username} has been enabled`, 'Close', {
        duration: 3000,
      });
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to enable user:', err);
      this.snackBar.open('Failed to enable user', 'Close', { duration: 3000 });
    }
  }

  async disableUser(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open('You cannot disable yourself', 'Close', {
        duration: 3000,
      });
      return;
    }

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: 'Disable User',
        message: `Are you sure you want to disable ${user.username}? They will no longer be able to access the system.`,
        confirmText: 'Disable',
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.disableUser(user.id);
      this.snackBar.open(`${user.username} has been disabled`, 'Close', {
        duration: 3000,
      });
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to disable user:', err);
      this.snackBar.open('Failed to disable user', 'Close', { duration: 3000 });
    }
  }

  async toggleAdmin(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open('You cannot change your own admin status', 'Close', {
        duration: 3000,
      });
      return;
    }

    const action = user.isAdmin
      ? 'remove admin privileges from'
      : 'grant admin privileges to';
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: user.isAdmin ? 'Remove Admin' : 'Grant Admin',
        message: `Are you sure you want to ${action} ${user.username}?`,
        confirmText: user.isAdmin ? 'Remove Admin' : 'Grant Admin',
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.setUserAdmin(user.id, !user.isAdmin);
      this.snackBar.open(
        user.isAdmin
          ? `Admin privileges removed from ${user.username}`
          : `Admin privileges granted to ${user.username}`,
        'Close',
        {
          duration: 3000,
        }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to toggle admin:', err);
      this.snackBar.open('Failed to change admin status', 'Close', {
        duration: 3000,
      });
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open('You cannot delete yourself', 'Close', {
        duration: 3000,
      });
      return;
    }

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: 'Delete User',
        message: `Are you sure you want to permanently delete ${user.username}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.deleteUser(user.id);
      this.snackBar.open(`${user.username} has been deleted`, 'Close', {
        duration: 3000,
      });
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      this.snackBar.open('Failed to delete user', 'Close', { duration: 3000 });
    }
  }

  getUserStatusClass(user: AdminUser): string {
    if (!user.approved) return 'pending';
    if (!user.enabled) return 'disabled';
    if (user.isAdmin) return 'admin';
    return 'active';
  }

  getUserStatusLabel(user: AdminUser): string {
    if (!user.approved) return 'Pending';
    if (!user.enabled) return 'Disabled';
    if (user.isAdmin) return 'Admin';
    return 'Active';
  }

  isCurrentUser(user: AdminUser): boolean {
    return String(user.id) === this.currentUser()?.id;
  }
}
