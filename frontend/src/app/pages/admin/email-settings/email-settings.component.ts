import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { AdminEmailService } from '@services/admin/admin-email.service';
import { SystemConfigService } from '@services/core/system-config.service';

@Component({
  selector: 'app-admin-email-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './email-settings.component.html',
  styleUrl: './email-settings.component.scss',
})
export class AdminEmailSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly emailApiService = inject(AdminEmailService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isSendingTest = signal(false);
  readonly error = signal<Error | null>(null);
  readonly testResult = signal<{ success: boolean; message: string } | null>(
    null
  );

  // Form state
  readonly emailEnabled = signal(false);
  readonly host = signal('');
  readonly port = signal('587');
  readonly encryption = signal('starttls');
  readonly username = signal('');
  readonly password = signal('');
  readonly fromAddress = signal('');
  readonly fromName = signal('Inkweld');

  readonly encryptionOptions = [
    { value: 'starttls', label: 'STARTTLS (port 587)' },
    { value: 'tls', label: 'TLS/SSL (port 465)' },
    { value: 'none', label: 'None (port 25)' },
  ];

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [enabled, host, port, encryption, username, fromAddress, fromName] =
        await Promise.all([
          this.configService.getConfig('EMAIL_ENABLED'),
          this.configService.getConfig('EMAIL_HOST'),
          this.configService.getConfig('EMAIL_PORT'),
          this.configService.getConfig('EMAIL_ENCRYPTION'),
          this.configService.getConfig('EMAIL_USERNAME'),
          this.configService.getConfig('EMAIL_FROM'),
          this.configService.getConfig('EMAIL_FROM_NAME'),
        ]);

      this.emailEnabled.set(enabled?.value === 'true');
      this.host.set(host?.value || '');
      this.port.set(port?.value || '587');
      this.encryption.set(encryption?.value || 'starttls');
      this.username.set(username?.value || '');
      this.fromAddress.set(fromAddress?.value || '');
      this.fromName.set(fromName?.value || 'Inkweld');
      // Password is not loaded (it's encrypted); field stays blank
    } catch (err) {
      console.error('Failed to load email config:', err);
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load email settings')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleEmailEnabled(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'EMAIL_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.emailEnabled.set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open(
        enabled ? 'Email enabled' : 'Email disabled',
        'Close',
        { duration: 2000 }
      );
    } catch (err) {
      console.error('Failed to toggle email:', err);
      this.snackBar.open('Failed to save setting', 'Close', {
        duration: 3000,
      });
      this.emailEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveSmtpConfig(): Promise<void> {
    this.isSaving.set(true);
    try {
      const saves: Promise<void>[] = [
        this.configService.setConfig('EMAIL_HOST', this.host()),
        this.configService.setConfig('EMAIL_PORT', this.port()),
        this.configService.setConfig('EMAIL_ENCRYPTION', this.encryption()),
        this.configService.setConfig('EMAIL_USERNAME', this.username()),
        this.configService.setConfig('EMAIL_FROM', this.fromAddress()),
        this.configService.setConfig('EMAIL_FROM_NAME', this.fromName()),
      ];

      // Only save password if user entered a new one
      if (this.password()) {
        saves.push(
          this.configService.setConfig('EMAIL_PASSWORD', this.password())
        );
      }

      await Promise.all(saves);
      this.password.set(''); // Clear password field after save
      this.snackBar.open('SMTP settings saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save SMTP config:', err);
      this.snackBar.open('Failed to save SMTP settings', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async sendTestEmail(): Promise<void> {
    this.isSendingTest.set(true);
    this.testResult.set(null);

    try {
      const result = await this.emailApiService.sendTestEmail();
      this.testResult.set(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to send test email';
      this.testResult.set({ success: false, message });
    } finally {
      this.isSendingTest.set(false);
    }
  }
}
