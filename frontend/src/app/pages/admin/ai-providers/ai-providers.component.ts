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
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';
import { AIProvidersService, type ProviderStatus } from 'api-client';
import { firstValueFrom } from 'rxjs';

interface ProviderUIState extends ProviderStatus {
  isEditingKey: boolean;
  isEditingEndpoint: boolean;
  isEditingAccountId: boolean;
  apiKey: string;
  endpoint: string;
  accountId: string;
  isSaving: boolean;
}

@Component({
  selector: 'app-admin-ai-providers',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './ai-providers.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './ai-providers.component.scss',
})
export class AdminAiProvidersComponent implements OnInit {
  private readonly providersService = inject(AIProvidersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly transloco = inject(TranslocoService);

  readonly isLoading = signal(true);
  readonly error = signal<Error | null>(null);
  readonly providers = signal<ProviderUIState[]>([]);

  ngOnInit(): void {
    void this.loadProviders();
  }

  async loadProviders(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.providersService.getAiProvidersStatus()
      );

      // Map providers to UI state
      this.providers.set(
        response.providers.map(p => ({
          ...p,
          isEditingKey: false,
          isEditingEndpoint: false,
          isEditingAccountId: false,
          apiKey: '',
          endpoint: '',
          accountId: '',
          isSaving: false,
        }))
      );
    } catch (err) {
      console.error('Failed to load AI providers:', err);
      this.error.set(err as Error);
    } finally {
      this.isLoading.set(false);
    }
  }

  startEditingKey(provider: ProviderUIState): void {
    this.updateProvider(provider.id, { isEditingKey: true, apiKey: '' });
  }

  cancelEditingKey(provider: ProviderUIState): void {
    this.updateProvider(provider.id, { isEditingKey: false, apiKey: '' });
  }

  startEditingEndpoint(provider: ProviderUIState): void {
    this.updateProvider(provider.id, { isEditingEndpoint: true, endpoint: '' });
  }

  cancelEditingEndpoint(provider: ProviderUIState): void {
    this.updateProvider(provider.id, {
      isEditingEndpoint: false,
      endpoint: '',
    });
  }

  startEditingAccountId(provider: ProviderUIState): void {
    this.updateProvider(provider.id, {
      isEditingAccountId: true,
      accountId: '',
    });
  }

  cancelEditingAccountId(provider: ProviderUIState): void {
    this.updateProvider(provider.id, {
      isEditingAccountId: false,
      accountId: '',
    });
  }

  async saveApiKey(provider: ProviderUIState): Promise<void> {
    if (!provider.apiKey.trim()) {
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.apiKeyEmpty'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderKey(provider.id, {
          apiKey: provider.apiKey.trim(),
        })
      );

      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.apiKeySaved', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to save ${provider.name} API key:`, err);
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.apiKeySaveFailed', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  async deleteApiKey(provider: ProviderUIState): Promise<void> {
    if (
      !confirm(
        this.transloco.translate('admin.aiProviders.deleteKeyConfirm', {
          provider: provider.name,
        })
      )
    ) {
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.deleteAiProviderKey(provider.id)
      );

      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.apiKeyDeleted', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to delete ${provider.name} API key:`, err);
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.apiKeySaveFailed', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  async saveEndpoint(provider: ProviderUIState): Promise<void> {
    if (!provider.endpoint.trim()) {
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.endpointEmpty'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderEndpoint(provider.id, {
          endpoint: provider.endpoint.trim(),
        })
      );

      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.endpointSaved', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to save ${provider.name} endpoint:`, err);
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.updateFailed', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  async saveAccountId(provider: ProviderUIState): Promise<void> {
    if (!provider.accountId.trim()) {
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.accountIdEmpty'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderAccountId(provider.id, {
          accountId: provider.accountId.trim(),
        })
      );

      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.accountIdSaved', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to save ${provider.name} account ID:`, err);
      this.snackBar.open(
        this.transloco.translate('admin.aiProviders.updateFailed', {
          provider: provider.name,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  private updateProvider(id: string, updates: Partial<ProviderUIState>): void {
    this.providers.update(providers =>
      providers.map(p => (p.id === id ? { ...p, ...updates } : p))
    );
  }

  updateProviderApiKey(provider: ProviderUIState, value: string): void {
    this.updateProvider(provider.id, { apiKey: value });
  }

  updateProviderEndpoint(provider: ProviderUIState, value: string): void {
    this.updateProvider(provider.id, { endpoint: value });
  }

  updateProviderAccountId(provider: ProviderUIState, value: string): void {
    this.updateProvider(provider.id, { accountId: value });
  }

  getProviderIcon(providerId: string): string {
    // Use custom SVG icons for OpenRouter and Fal.ai
    if (providerId === 'openrouter' || providerId === 'falai') {
      return providerId;
    }
    const icons: Record<string, string> = {
      openai: 'auto_awesome',
      anthropic: 'psychology',
      'stable-diffusion': 'brush',
      workersai: 'cloud',
    };
    return icons[providerId] || 'extension';
  }

  isSvgIcon(providerId: string): boolean {
    return providerId === 'openrouter' || providerId === 'falai';
  }

  async toggleProviderEnabled(provider: ProviderUIState): Promise<void> {
    const newEnabled = !provider.imageEnabled;
    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderImageEnabled(provider.id, {
          enabled: newEnabled,
        })
      );

      this.updateProvider(provider.id, {
        imageEnabled: newEnabled,
        imageEnabledExplicit: true,
        isSaving: false,
      });

      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open(
        `${provider.name} ${newEnabled ? 'enabled' : 'disabled'}`,
        'Close',
        { duration: 2000 }
      );
    } catch (err) {
      console.error(`Failed to toggle ${provider.name}:`, err);
      this.updateProvider(provider.id, { isSaving: false });
      this.snackBar.open(`Failed to update ${provider.name}`, 'Close', {
        duration: 3000,
      });
    }
  }

  getCapabilityLabel(provider: ProviderStatus): string {
    const capabilities: string[] = [];
    if (provider.supportsImages) capabilities.push('Images');
    if (provider.supportsText) capabilities.push('Text');
    return capabilities.join(', ') || 'None';
  }
}
