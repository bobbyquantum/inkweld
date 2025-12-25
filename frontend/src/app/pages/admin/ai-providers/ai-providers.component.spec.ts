import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  AIProvidersService,
  ProvidersStatusResponse,
  ProviderStatus,
  ProviderSuccessResponse,
} from 'api-client';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { AdminAiProvidersComponent } from './ai-providers.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('AdminAiProvidersComponent', () => {
  let component: AdminAiProvidersComponent;
  let mockProvidersService: MockedObject<AIProvidersService>;

  const createMockProviders = (): ProvidersStatusResponse => ({
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'OpenAI GPT models',
        hasApiKey: true,
        supportsImages: true,
        supportsText: true,
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Multiple AI providers via OpenRouter',
        hasApiKey: false,
        supportsImages: true,
        supportsText: true,
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude models',
        hasApiKey: false,
        supportsImages: false,
        supportsText: true,
      },
      {
        id: 'stable-diffusion',
        name: 'Stable Diffusion',
        description: 'Self-hosted Stable Diffusion',
        hasApiKey: false,
        supportsImages: true,
        supportsText: false,
        requiresEndpoint: true,
        hasEndpoint: false,
      },
      {
        id: 'falai',
        name: 'Fal.ai',
        description: 'Fal.ai cloud inference',
        hasApiKey: false,
        supportsImages: true,
        supportsText: false,
      },
    ] satisfies ProviderStatus[],
  });

  beforeEach(async () => {
    mockProvidersService = {
      getAiProvidersStatus: vi.fn().mockReturnValue(of(createMockProviders())),
      setAiProviderKey: vi
        .fn()
        .mockReturnValue(
          of({ success: true } satisfies ProviderSuccessResponse)
        ),
      deleteAiProviderKey: vi
        .fn()
        .mockReturnValue(
          of({ success: true } satisfies ProviderSuccessResponse)
        ),
      setAiProviderEndpoint: vi
        .fn()
        .mockReturnValue(
          of({ success: true } satisfies ProviderSuccessResponse)
        ),
    } as unknown as MockedObject<AIProvidersService>;

    await TestBed.configureTestingModule({
      imports: [
        AdminAiProvidersComponent,
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
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AIProvidersService, useValue: mockProvidersService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAiProvidersComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should load providers on init', async () => {
      component.ngOnInit();
      await flushPromises();

      expect(mockProvidersService.getAiProvidersStatus).toHaveBeenCalled();
      expect(component.providers().length).toBe(5);
      expect(component.isLoading()).toBe(false);
    });

    it('should set error when loading fails', async () => {
      const error = new Error('Failed to load');
      mockProvidersService.getAiProvidersStatus = vi.fn(() => {
        throw error;
      });

      component.ngOnInit();
      await flushPromises();

      expect(component.error()).toBeTruthy();
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('API key management', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should start editing key', () => {
      const provider = component.providers()[0];
      component.startEditingKey(provider);

      const updatedProvider = component.providers()[0];
      expect(updatedProvider.isEditingKey).toBe(true);
    });

    it('should cancel editing key', () => {
      const provider = component.providers()[0];
      component.startEditingKey(provider);
      component.cancelEditingKey(provider);

      const updatedProvider = component.providers()[0];
      expect(updatedProvider.isEditingKey).toBe(false);
    });

    it('should save API key', async () => {
      const provider = component.providers()[0];
      component.startEditingKey(provider);
      component.updateProviderApiKey(component.providers()[0], 'new-api-key');

      await component.saveApiKey(component.providers()[0]);
      await flushPromises();

      expect(mockProvidersService.setAiProviderKey).toHaveBeenCalledWith(
        'openai',
        { apiKey: 'new-api-key' }
      );
    });

    it('should not save empty API key', async () => {
      const provider = component.providers()[0];
      component.startEditingKey(provider);
      component.updateProviderApiKey(component.providers()[0], '   ');

      await component.saveApiKey(component.providers()[0]);

      expect(mockProvidersService.setAiProviderKey).not.toHaveBeenCalled();
    });

    it('should delete API key with confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const provider = component.providers()[0];

      await component.deleteApiKey(provider);
      await flushPromises();

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockProvidersService.deleteAiProviderKey).toHaveBeenCalledWith(
        'openai'
      );
    });

    it('should not delete API key when cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const provider = component.providers()[0];

      await component.deleteApiKey(provider);

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockProvidersService.deleteAiProviderKey).not.toHaveBeenCalled();
    });
  });

  describe('endpoint management', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should start editing endpoint', () => {
      const sdProvider = component
        .providers()
        .find(p => p.id === 'stable-diffusion')!;
      component.startEditingEndpoint(sdProvider);

      const updatedProvider = component
        .providers()
        .find(p => p.id === 'stable-diffusion')!;
      expect(updatedProvider.isEditingEndpoint).toBe(true);
    });

    it('should save endpoint', async () => {
      const sdProvider = component
        .providers()
        .find(p => p.id === 'stable-diffusion')!;
      component.startEditingEndpoint(sdProvider);
      component.updateProviderEndpoint(
        component.providers().find(p => p.id === 'stable-diffusion')!,
        'https://sd.example.com'
      );

      await component.saveEndpoint(
        component.providers().find(p => p.id === 'stable-diffusion')!
      );
      await flushPromises();

      expect(mockProvidersService.setAiProviderEndpoint).toHaveBeenCalledWith(
        'stable-diffusion',
        { endpoint: 'https://sd.example.com' }
      );
    });
  });

  describe('helper methods', () => {
    it('should return correct provider icons', () => {
      expect(component.getProviderIcon('openai')).toBe('auto_awesome');
      expect(component.getProviderIcon('openrouter')).toBe('hub');
      expect(component.getProviderIcon('anthropic')).toBe('psychology');
      expect(component.getProviderIcon('stable-diffusion')).toBe('brush');
      expect(component.getProviderIcon('falai')).toBe('bolt');
      expect(component.getProviderIcon('unknown')).toBe('extension');
    });

    it('should return correct capability labels', () => {
      const imageAndText = {
        supportsImages: true,
        supportsText: true,
      } as ProviderStatus;
      expect(component.getCapabilityLabel(imageAndText)).toBe('Images, Text');

      const imageOnly = {
        supportsImages: true,
        supportsText: false,
      } as ProviderStatus;
      expect(component.getCapabilityLabel(imageOnly)).toBe('Images');

      const textOnly = {
        supportsImages: false,
        supportsText: true,
      } as ProviderStatus;
      expect(component.getCapabilityLabel(textOnly)).toBe('Text');
    });
  });
});
