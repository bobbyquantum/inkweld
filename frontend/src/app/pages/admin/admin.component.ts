import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { AdminService, AdminUser } from '@services/admin/admin.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { firstValueFrom } from 'rxjs';

import { UserAvatarComponent } from '../../components/user-avatar/user-avatar.component';
import { UserMenuComponent } from '../../components/user-menu/user-menu.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    NgClass,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
    RouterModule,
    UserAvatarComponent,
    UserMenuComponent,
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly userService = inject(UnifiedUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly currentUser = this.userService.currentUser;
  readonly users = this.adminService.users;
  readonly pendingUsers = this.adminService.pendingUsers;
  readonly isLoading = this.adminService.isLoading;
  readonly error = this.adminService.error;

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
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    try {
      await Promise.all([
        this.adminService.listUsers(),
        this.adminService.listPendingUsers(),
      ]);
    } catch {
      this.showError('Failed to load users');
    }
  }

  async approveUser(user: AdminUser): Promise<void> {
    try {
      await this.adminService.approveUser(user.id);
      this.showSuccess(`User ${user.username} approved`);
      await this.loadUsers();
    } catch {
      this.showError(`Failed to approve user ${user.username}`);
    }
  }

  async rejectUser(user: AdminUser): Promise<void> {
    const confirmed = await this.confirmAction(
      'Reject User',
      `Are you sure you want to reject ${user.username}? They will need to register again.`
    );

    if (confirmed) {
      try {
        await this.adminService.rejectUser(user.id);
        this.showSuccess(`User ${user.username} rejected`);
        await this.loadUsers();
      } catch {
        this.showError(`Failed to reject user ${user.username}`);
      }
    }
  }

  async enableUser(user: AdminUser): Promise<void> {
    try {
      await this.adminService.enableUser(user.id);
      this.showSuccess(`User ${user.username} enabled`);
      await this.loadUsers();
    } catch {
      this.showError(`Failed to enable user ${user.username}`);
    }
  }

  async disableUser(user: AdminUser): Promise<void> {
    const confirmed = await this.confirmAction(
      'Disable User',
      `Are you sure you want to disable ${user.username}? They will not be able to log in.`
    );

    if (confirmed) {
      try {
        await this.adminService.disableUser(user.id);
        this.showSuccess(`User ${user.username} disabled`);
        await this.loadUsers();
      } catch {
        this.showError(`Failed to disable user ${user.username}`);
      }
    }
  }

  async toggleAdmin(user: AdminUser): Promise<void> {
    const isCurrentlyAdmin = user.isAdmin;
    const action = isCurrentlyAdmin
      ? 'remove admin privileges from'
      : 'grant admin privileges to';

    const confirmed = await this.confirmAction(
      isCurrentlyAdmin ? 'Remove Admin' : 'Grant Admin',
      `Are you sure you want to ${action} ${user.username}?`
    );

    if (confirmed) {
      try {
        await this.adminService.setUserAdmin(user.id, !isCurrentlyAdmin);
        this.showSuccess(
          `Admin privileges ${isCurrentlyAdmin ? 'removed from' : 'granted to'} ${user.username}`
        );
        await this.loadUsers();
      } catch {
        this.showError(`Failed to update admin status for ${user.username}`);
      }
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    const confirmed = await this.confirmAction(
      'Delete User',
      `Are you sure you want to permanently delete ${user.username}? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        await this.adminService.deleteUser(user.id);
        this.showSuccess(`User ${user.username} deleted`);
        await this.loadUsers();
      } catch {
        this.showError(`Failed to delete user ${user.username}`);
      }
    }
  }

  getUserStatus(user: AdminUser): { label: string; cssClass: string } {
    if (!user.approved) {
      return { label: 'Pending', cssClass: 'status-pending' };
    }
    if (!user.enabled) {
      return { label: 'Disabled', cssClass: 'status-disabled' };
    }
    if (user.isAdmin) {
      return { label: 'Admin', cssClass: 'status-admin' };
    }
    return { label: 'Active', cssClass: 'status-active' };
  }

  isCurrentUser(user: AdminUser): boolean {
    // currentUser?.id is a string, user.id is a number
    return user.id.toString() === this.currentUser()?.id;
  }

  private async confirmAction(
    title: string,
    message: string
  ): Promise<boolean> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      width: '400px',
      data: { title, message },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result === true;
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: 'success-snackbar',
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: 'error-snackbar',
    });
  }
}
