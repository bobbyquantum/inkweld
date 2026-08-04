import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { AdminUserProjects } from '@inkweld/model/admin-user-projects';
import { TranslocoModule } from '@jsverse/transloco';
import { AdminService } from '@services/admin/admin.service';

import { formatBytes } from '../../utils/format-bytes';
export interface AdminUserProjectsDialogData {
  userId: string;
  username: string;
}

@Component({
  selector: 'app-admin-user-projects-dialog',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './admin-user-projects-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminUserProjectsDialogComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly userId: string;
  readonly username: string;

  readonly data = signal<AdminUserProjects | null>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

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
        this.isLoading.set(false);
      })
      .catch(err => {
        console.error('Failed to load user projects:', err);
        this.error.set('Failed to load projects');
        this.isLoading.set(false);
      });
  }

  formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }
}
