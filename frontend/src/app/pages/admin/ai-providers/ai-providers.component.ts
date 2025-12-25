import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AIProvidersService, ProviderStatus } from 'api-client';
import { firstValueFrom } from 'rxjs';

interface ProviderUIState extends ProviderStatus {
  isEditingKey: boolean;
  isEditingEndpoint: boolean;
  apiKey: string;
  endpoint: string;
  isSaving: boolean;
}

@Component({
  selector: 'app-admin-ai-providers',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './ai-providers.component.html',
  styleUrl: './ai-providers.component.scss',
})
export class AdminAiProvidersComponent implements OnInit {
  private readonly providersService = inject(AIProvidersService);
  private readonly snackBar = inject(MatSnackBar);

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
          apiKey: '',
          endpoint: '',
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

  async saveApiKey(provider: ProviderUIState): Promise<void> {
    if (!provider.apiKey.trim()) {
      this.snackBar.open('API key cannot be empty', 'Dismiss', {
        duration: 3000,
      });
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderKey(provider.id, {
          apiKey: provider.apiKey.trim(),
        })
      );

      this.snackBar.open(`${provider.name} API key saved`, 'Dismiss', {
        duration: 3000,
      });

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to save ${provider.name} API key:`, err);
      this.snackBar.open(`Failed to save ${provider.name} API key`, 'Dismiss', {
        duration: 3000,
      });
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  async deleteApiKey(provider: ProviderUIState): Promise<void> {
    if (
      !confirm(`Are you sure you want to delete the ${provider.name} API key?`)
    ) {
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.deleteAiProviderKey(provider.id)
      );

      this.snackBar.open(`${provider.name} API key deleted`, 'Dismiss', {
        duration: 3000,
      });

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to delete ${provider.name} API key:`, err);
      this.snackBar.open(
        `Failed to delete ${provider.name} API key`,
        'Dismiss',
        {
          duration: 3000,
        }
      );
      this.updateProvider(provider.id, { isSaving: false });
    }
  }

  async saveEndpoint(provider: ProviderUIState): Promise<void> {
    if (!provider.endpoint.trim()) {
      this.snackBar.open('Endpoint URL cannot be empty', 'Dismiss', {
        duration: 3000,
      });
      return;
    }

    this.updateProvider(provider.id, { isSaving: true });

    try {
      await firstValueFrom(
        this.providersService.setAiProviderEndpoint(provider.id, {
          endpoint: provider.endpoint.trim(),
        })
      );

      this.snackBar.open(`${provider.name} endpoint saved`, 'Dismiss', {
        duration: 3000,
      });

      // Reload to get updated status
      await this.loadProviders();
    } catch (err) {
      console.error(`Failed to save ${provider.name} endpoint:`, err);
      this.snackBar.open(
        `Failed to save ${provider.name} endpoint`,
        'Dismiss',
        {
          duration: 3000,
        }
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

  getProviderIcon(providerId: string): string {
    const icons: Record<string, string> = {
      openai: 'auto_awesome',
      openrouter: 'hub',
      anthropic: 'psychology',
      'stable-diffusion': 'brush',
      falai: 'bolt',
    };
    return icons[providerId] || 'extension';
  }

  getCapabilityLabel(provider: ProviderStatus): string {
    const capabilities: string[] = [];
    if (provider.supportsImages) capabilities.push('Images');
    if (provider.supportsText) capabilities.push('Text');
    return capabilities.join(', ') || 'None';
  }
}
