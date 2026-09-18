import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { AdminUserProjects } from '@inkweld/model/admin-user-projects';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { type AdminUserProjectsQuota } from '@services/admin/admin.service';
import { AdminService } from '@services/admin/admin.service';
import { formatBytes } from '@utils/format-bytes';
export interface AdminUserProjectsDialogData {
  userId: string;
  username: string;
}

/** 1 MiB, used to present the byte allowance as an editable MB field. */
const MEBIBYTE = 1024 * 1024;

@Component({
  selector: 'app-admin-user-projects-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './admin-user-projects-dialog.component.html',
  styleUrl: './admin-user-projects-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminUserProjectsDialogComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  readonly userId: string;
  readonly username: string;

  readonly data = signal<(AdminUserProjects & AdminUserProjectsQuota) | null>(
    null
  );
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

  /** Editable allowance (in MB); `null` means "use the instance default". */
  readonly quotaMb = signal<number | null>(null);
  readonly useDefaultQuota = signal(true);
  readonly isSavingQuota = signal(false);

  constructor() {
    const injected = inject<AdminUserProjectsDialogData>(MAT_DIALOG_DATA);
    this.userId = injected.userId;
    this.username = injected.username;
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.isLoading.set(true);
    this.error.set(null);
    void this.adminService
      .listUserProjects(this.userId)
      .then(result => {
        this.data.set(result);
        this.syncQuotaForm(result);
        this.isLoading.set(false);
      })
      .catch(err => {
        console.error('Failed to load user projects:', err);
        this.error.set(this.transloco.translate('admin.projects.loadFailed'));
        this.isLoading.set(false);
      });
  }

  /** Seed the quota editor from the loaded override (null = instance default). */
  private syncQuotaForm(
    result: AdminUserProjects & AdminUserProjectsQuota
  ): void {
    const override = result.syncQuotaBytes;
    this.useDefaultQuota.set(override === null);
    this.quotaMb.set(
      override === null ? null : Math.round(override / MEBIBYTE)
    );
  }

  /** Toggle between the instance default and an explicit override. */
  onUseDefaultChange(useDefault: boolean): void {
    this.useDefaultQuota.set(useDefault);
    if (!useDefault && this.quotaMb() === null) {
      // Seed the field with the current effective allowance so the admin edits
      // a sensible starting point rather than a blank.
      const current = this.data()?.effectiveQuotaBytes ?? 0;
      this.quotaMb.set(Math.round(current / MEBIBYTE));
    }
  }

  async saveQuota(): Promise<void> {
    const bytes = this.useDefaultQuota()
      ? null
      : Math.max(0, Math.round((this.quotaMb() ?? 0) * MEBIBYTE));

    this.isSavingQuota.set(true);
    try {
      await this.adminService.setUserQuota(this.userId, bytes);
      this.snackBar.open(
        this.transloco.translate('admin.users.quotaUpdated'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      this.refresh();
    } catch (err) {
      console.error('Failed to set quota:', err);
      this.snackBar.open(
        this.transloco.translate('admin.users.quotaUpdateFailed'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    } finally {
      this.isSavingQuota.set(false);
    }
  }

  formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }
}
