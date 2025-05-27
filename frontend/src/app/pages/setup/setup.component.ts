import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { SetupService } from '../../services/setup.service';
import { UnifiedUserService } from '../../services/unified-user.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule,
  ],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent {
  private setupService = inject(SetupService);
  private unifiedUserService = inject(UnifiedUserService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  protected readonly isLoading = this.setupService.isLoading;
  protected readonly showServerSetup = signal(false);
  protected readonly showOfflineSetup = signal(false);

  protected serverUrl = 'http://localhost:8333';
  protected userName = '';
  protected displayName = '';

  protected chooseServerMode(): void {
    this.showServerSetup.set(true);
    this.showOfflineSetup.set(false);
  }

  protected chooseOfflineMode(): void {
    this.showOfflineSetup.set(true);
    this.showServerSetup.set(false);
  }

  protected async setupServerMode(): Promise<void> {
    if (!this.serverUrl.trim()) {
      this.snackBar.open('Please enter a server URL', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      await this.setupService.configureServerMode(this.serverUrl.trim());
      this.snackBar.open('Server configuration saved!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/welcome']);
    } catch {
      this.snackBar.open(
        'Failed to connect to server. Please check the URL and try again.',
        'Close',
        {
          duration: 5000,
        }
      );
    }
  }

  protected async setupOfflineMode(): Promise<void> {
    if (!this.userName.trim() || !this.displayName.trim()) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      this.setupService.configureOfflineMode({
        username: this.userName.trim(),
        name: this.displayName.trim(),
      });

      // Initialize the user service after configuration
      await this.unifiedUserService.initialize();

      this.snackBar.open('Offline mode configured!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/']);
    } catch {
      this.snackBar.open('Failed to configure offline mode', 'Close', {
        duration: 3000,
      });
    }
  }

  protected goBack(): void {
    this.showServerSetup.set(false);
    this.showOfflineSetup.set(false);
  }
}
