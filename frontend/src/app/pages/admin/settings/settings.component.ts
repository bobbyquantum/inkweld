import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminConfigService } from '@services/admin/admin-config.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class AdminSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);
  readonly userApprovalRequired = signal(false);

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const value = await this.configService.getConfig(
        'USER_APPROVAL_REQUIRED'
      );
      this.userApprovalRequired.set(value?.value === 'true');
    } catch (err) {
      console.error('Failed to load config:', err);
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleUserApproval(enabled: boolean): Promise<void> {
    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'USER_APPROVAL_REQUIRED',
        enabled ? 'true' : 'false'
      );
      this.userApprovalRequired.set(enabled);
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      // Revert toggle on failure
      this.userApprovalRequired.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }
}
