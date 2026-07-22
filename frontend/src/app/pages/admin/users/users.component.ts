import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  type OnDestroy,
  type OnInit,
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
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AdminService, type AdminUser } from '@services/admin/admin.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-users',
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
    TranslocoModule,
    UserAvatarComponent,
  ],
  templateUrl: './users.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './users.component.scss',
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly userService = inject(UnifiedUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

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
        title: this.transloco.translate('admin.users.approveTitle'),
        message: this.transloco.translate('admin.users.approveMessage', {
          name: user.username,
        }),
        confirmText: this.transloco.translate('admin.users.approve'),
        cancelText: this.transloco.translate('cancel'),
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.approveUser(user.id);
      this.snackBar.open(
        this.transloco.translate('admin.users.approved', {
          name: user.username,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to approve user:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.approveFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    }
  }

  async rejectUser(user: AdminUser): Promise<void> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('admin.users.rejectTitle'),
        message: this.transloco.translate('admin.users.rejectMessage', {
          name: user.username,
        }),
        confirmText: this.transloco.translate('admin.users.reject'),
        cancelText: this.transloco.translate('cancel'),
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.rejectUser(user.id);
      this.snackBar.open(
        this.transloco.translate('admin.users.rejected', {
          name: user.username,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to reject user:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.rejectFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    }
  }

  async enableUser(user: AdminUser): Promise<void> {
    try {
      await this.adminService.enableUser(user.id);
      this.snackBar.open(
        this.transloco.translate('admin.users.enabled', {
          name: user.username,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to enable user:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.enableFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    }
  }

  async disableUser(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open(
        this.transloco.translate('admin.users.cannotDisableSelf'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      return;
    }

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('admin.users.disableTitle'),
        message: this.transloco.translate('admin.users.disableMessage', {
          name: user.username,
        }),
        confirmText: this.transloco.translate('admin.users.disable'),
        cancelText: this.transloco.translate('cancel'),
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.disableUser(user.id);
      this.snackBar.open(
        this.transloco.translate('admin.users.disabled', {
          name: user.username,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to disable user:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.disableFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    }
  }

  async toggleAdmin(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open(
        this.transloco.translate('admin.users.cannotChangeOwnAdmin'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      return;
    }

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: user.isAdmin
          ? this.transloco.translate('admin.users.removeAdminTitle')
          : this.transloco.translate('admin.users.grantAdminTitle'),
        message: `Are you sure you want to ${user.isAdmin ? 'remove admin privileges from' : 'grant admin privileges to'} ${user.username}?`,
        confirmText: user.isAdmin
          ? this.transloco.translate('admin.users.removeAdmin')
          : this.transloco.translate('admin.users.grantAdmin'),
        cancelText: this.transloco.translate('cancel'),
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
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to toggle admin:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.adminChangeFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    if (this.isCurrentUser(user)) {
      this.snackBar.open(
        this.transloco.translate('admin.users.cannotDeleteSelf'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      return;
    }

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('admin.users.deleteTitle'),
        message: this.transloco.translate('admin.users.deleteMessage', {
          name: user.username,
        }),
        confirmText: this.transloco.translate('delete'),
        cancelText: this.transloco.translate('cancel'),
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      await this.adminService.deleteUser(user.id);
      this.snackBar.open(
        this.transloco.translate('admin.users.deleted', {
          name: user.username,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      await this.loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.deleteFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
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
