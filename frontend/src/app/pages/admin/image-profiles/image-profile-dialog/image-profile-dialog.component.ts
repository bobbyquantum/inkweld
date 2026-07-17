import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { applyEach, form, FormField, required } from '@angular/forms/signals';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  type AdminImageModelProfile,
  type AdminListImageProviders200ResponseInner,
  AIImageGenerationService,
  AIProvidersService,
  type CreateImageModelProfileRequest,
  type CreateImageModelProfileRequestProvider,
  type ImageModelInfo,
  type ImageProviderType,
} from 'api-client';
import { firstValueFrom } from 'rxjs';

export interface ImageProfileDialogData {
  mode: 'create' | 'edit';
  profile?: AdminImageModelProfile;
  providers: AdminListImageProviders200ResponseInner[];
}

/** Fal.ai category types - must match backend enum */
type FalaiCategory =
  'text-to-image' | 'image-to-image' | 'image-to-video' | 'text-to-video';

/** Extended model info with optional supportsImageInput for internal use */
interface ExtendedImageModelInfo extends ImageModelInfo {
  supportsImageInput?: boolean;
}

interface ImageProfileFormValue {
  name: string;
  description: string;
  provider: string;
  modelId: string;
  enabled: boolean;
  supportsImageInput: boolean;
  supportsCustomResolutions: boolean;
  usesAspectRatioOnly: boolean;
  supportedSizes: string[];
  defaultSize: string;
  sortOrder: number;
  modelConfigJson: string;
}

@Component({
  selector: 'app-image-profile-dialog',
  imports: [
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './image-profile-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './image-profile-dialog.component.scss',
})
export class ImageProfileDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<ImageProfileDialogComponent>
  );
  private readonly aiImageService = inject(AIImageGenerationService);
  private readonly aiProvidersService = inject(AIProvidersService);
  readonly data = inject<ImageProfileDialogData>(MAT_DIALOG_DATA);

  readonly model = signal<ImageProfileFormValue>({
    name: this.data.profile?.name ?? '',
    description: this.data.profile?.description ?? '',
    provider: this.data.profile?.provider ?? '',
    modelId: this.data.profile?.modelId ?? '',
    enabled: this.data.profile?.enabled ?? true,
    supportsImageInput: this.data.profile?.supportsImageInput ?? false,
    supportsCustomResolutions:
      this.data.profile?.supportsCustomResolutions ?? false,
    usesAspectRatioOnly: Boolean(
      this.data.profile?.usesAspectRatioOnly ?? false
    ),
    supportedSizes: this.data.profile?.supportedSizes
      ? [...this.data.profile.supportedSizes]
      : [],
    defaultSize: this.data.profile?.defaultSize ?? '',
    sortOrder: this.data.profile?.sortOrder ?? 0,
    modelConfigJson: this.data.profile?.modelConfig
      ? JSON.stringify(this.data.profile.modelConfig, null, 2)
      : '',
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.name, { message: 'Name is required' });
    required(schemaPath.provider, { message: 'Provider is required' });
    required(schemaPath.modelId, { message: 'Model ID is required' });
    applyEach(schemaPath.supportedSizes, item => {
      required(item, { message: 'Size is required' });
    });
  });

  readonly showModelConfig = signal(false);
  readonly isLoadingModels = signal(false);
  readonly availableModels = signal<ExtendedImageModelInfo[]>([]);
  readonly modelSearchTerm = signal('');
  readonly selectedFalaiCategory = signal<FalaiCategory>('text-to-image');

  // Providers that support model browsing (require API fetch)
  readonly browsableProviders = ['openrouter', 'falai', 'workersai'];

  // OpenAI hardcoded models - no API fetch needed
  readonly openaiModels: ExtendedImageModelInfo[] = [
    {
      id: 'gpt-image-1',
      name: 'GPT Image 1',
      description:
        'High-quality image generation with excellent prompt understanding',
      provider: 'openai' as ImageProviderType,
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      supportsQuality: true,
      supportsStyle: false,
      maxImages: 10,
    },
    {
      id: 'gpt-image-1-mini',
      name: 'GPT Image 1 Mini',
      description: 'Fast and cost-effective image generation',
      provider: 'openai' as ImageProviderType,
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      supportsQuality: true,
      supportsStyle: false,
      maxImages: 10,
    },
    {
      id: 'gpt-image-1.5',
      name: 'GPT Image 1.5',
      description: 'Latest GPT image model with enhanced capabilities',
      provider: 'openai' as ImageProviderType,
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      supportsQuality: true,
      supportsStyle: false,
      maxImages: 10,
    },
  ];

  // Fal.ai category options
  readonly falaiCategories: {
    value: FalaiCategory;
    label: string;
    supportsImageInput: boolean;
  }[] = [
    {
      value: 'text-to-image',
      label: 'Text to Image',
      supportsImageInput: false,
    },
    {
      value: 'image-to-image',
      label: 'Image to Image',
      supportsImageInput: true,
    },
  ];

  /**
   * OpenRouter supported aspect ratios.
   * All OpenRouter image models use aspect_ratio only, not pixel dimensions.
   * These are stored directly and sent to the API as-is.
   */
  readonly openrouterAspectRatios = [
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '4:5',
    '5:4',
    '9:16',
    '16:9',
    '21:9',
  ];

  // Computed: filter models based on search term
  readonly filteredModels = computed(() => {
    const models = this.availableModels();
    const search = this.modelSearchTerm().toLowerCase();
    if (!search) {
      return models.slice(0, 50); // Show first 50 when no search
    }
    return models
      .filter(
        m =>
          m.name.toLowerCase().includes(search) ||
          m.id.toLowerCase().includes(search)
      )
      .slice(0, 50);
  });

  /** Check if current provider is OpenAI (uses hardcoded dropdown) */
  isOpenAiProvider(): boolean {
    return this.model().provider === 'openai';
  }

  /** Check if current provider is OpenRouter (uses aspect ratio only) */
  isOpenRouterProvider(): boolean {
    return this.model().provider === 'openrouter';
  }

  /** Check if current provider is Fal.ai (needs category selection first) */
  isFalaiProvider(): boolean {
    return this.model().provider === 'falai';
  }

  /** Check if current provider is Workers AI */
  isWorkersAiProvider(): boolean {
    return this.model().provider === 'workersai';
  }

  /** Check if current provider supports model browsing via API */
  canBrowseModels(): boolean {
    const provider = this.model().provider;
    return !!provider && this.browsableProviders.includes(provider);
  }

  /** Check if provider requires manual model ID entry */
  isManualModelEntry(): boolean {
    const provider = this.model().provider;
    return provider === 'stable-diffusion';
  }

  constructor() {
    // Effect to load models when provider changes
    effect(() => {
      // Access signal to track it
      const models = this.availableModels();
      // This will trigger when availableModels changes
      if (models.length > 0) {
        // Models loaded, update search
        this.modelSearchTerm.set('');
      }
    });

    if (
      this.data.profile?.modelConfig &&
      Object.keys(this.data.profile.modelConfig).length > 0
    ) {
      this.showModelConfig.set(true);
    }
  }

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  get sizesArray(): string[] {
    return this.model().supportedSizes;
  }

  addSize(): void {
    this.model.update(m => ({
      ...m,
      supportedSizes: [...m.supportedSizes, ''],
    }));
  }

  removeSize(index: number): void {
    this.model.update(m => ({
      ...m,
      supportedSizes: m.supportedSizes.filter((_, i) => i !== index),
    }));
  }

  toggleModelConfig(): void {
    this.showModelConfig.update(v => !v);
  }

  /** Load available models for the selected provider from dynamic API */
  async loadModelsForProvider(): Promise<void> {
    const provider = this.model().provider;
    if (!provider || !this.browsableProviders.includes(provider)) {
      this.availableModels.set([]);
      return;
    }

    this.isLoadingModels.set(true);
    try {
      let models: ImageModelInfo[] = [];

      if (provider === 'openrouter') {
        // Fetch from OpenRouter image models API
        const response = await firstValueFrom(
          this.aiProvidersService.getOpenRouterImageModels()
        );
        models =
          response?.models?.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            provider: 'openrouter' as ImageProviderType,
            supportedSizes: [],
            supportsQuality: false,
            supportsStyle: false,
            supportsImageInput: m.supportsImageInput ?? false, // From API
            maxImages: 1,
          })) ?? [];
      } else if (provider === 'falai') {
        // Fetch from Fal.ai models API with selected category
        const category = this.selectedFalaiCategory();
        const response = await firstValueFrom(
          this.aiProvidersService.getFalaiModels(category)
        );
        // Determine supportsImageInput based on category
        const supportsImageInput = category === 'image-to-image';
        models =
          response?.models?.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            provider: 'falai' as ImageProviderType,
            supportedSizes: [],
            supportsQuality: false,
            supportsStyle: false,
            supportsImageInput,
            maxImages: 4,
          })) ?? [];
      } else if (provider === 'workersai') {
        // Fetch from Workers AI image models API
        const response = await firstValueFrom(
          this.aiProvidersService.getWorkersAiImageModels()
        );
        models =
          response?.models?.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            provider: 'workersai' as ImageProviderType,
            // Workers AI FLUX.2 models support various aspect ratios
            supportedSizes: [
              '512x512',
              '1024x1024',
              '1024x768',
              '768x1024',
              '1280x768',
              '768x1280',
              '1536x1024',
              '1024x1536',
            ],
            supportsQuality: false,
            supportsStyle: false,
            supportsImageInput: m.id?.includes('flux-2') ?? false,
            maxImages: 1,
          })) ?? [];
      } else {
        // Fallback to legacy endpoint for other providers
        const response = await firstValueFrom(
          this.aiImageService.getProviderModels(provider as ImageProviderType)
        );
        models = response?.models ?? [];
      }

      this.availableModels.set(models);
    } catch (error) {
      console.error('Failed to load models:', error);
      this.availableModels.set([]);
    } finally {
      this.isLoadingModels.set(false);
    }
  }

  /** Handle provider change */
  onProviderChange(): void {
    // Reset models and category when provider changes
    this.availableModels.set([]);
    this.selectedFalaiCategory.set('text-to-image');
    this.model.update(m => ({ ...m, modelId: '' }));

    // For OpenAI, set available models immediately (hardcoded)
    // All OpenAI image models support image input
    if (this.isOpenAiProvider()) {
      this.availableModels.set(this.openaiModels);
      this.model.update(m => ({
        ...m,
        usesAspectRatioOnly: false,
        supportsImageInput: true,
      }));
    } else if (this.isOpenRouterProvider()) {
      // OpenRouter uses aspect ratio only - auto-configure
      this.model.update(m => ({
        ...m,
        usesAspectRatioOnly: true,
        supportsCustomResolutions: false,
        supportedSizes: [...this.openrouterAspectRatios],
        defaultSize: '1:1',
      }));

      void this.loadModelsForProvider();
    } else if (this.isWorkersAiProvider()) {
      // Workers AI uses pixel dimensions, not aspect ratios
      this.model.update(m => ({
        ...m,
        usesAspectRatioOnly: false,
        supportsCustomResolutions: true,
        supportedSizes: [
          '512x512',
          '1024x1024',
          '1024x768',
          '768x1024',
          '1280x768',
          '768x1280',
          '1536x1024',
          '1024x1536',
        ],
        defaultSize: '1024x1024',
      }));

      void this.loadModelsForProvider();
    } else if (this.canBrowseModels() && !this.isFalaiProvider()) {
      void this.loadModelsForProvider();
    }
    // For Fal.ai, wait for category selection before loading
  }

  /** Handle Fal.ai category change */
  onFalaiCategoryChange(category: FalaiCategory): void {
    this.selectedFalaiCategory.set(category);
    this.model.update(m => ({ ...m, modelId: '' }));
    this.availableModels.set([]);

    // Auto-set supportsImageInput based on category
    const categoryConfig = this.falaiCategories.find(c => c.value === category);
    if (categoryConfig) {
      this.model.update(m => ({
        ...m,
        supportsImageInput: categoryConfig.supportsImageInput,
      }));
    }

    // Load models for the selected category
    void this.loadModelsForProvider();
  }

  /** Handle model selection from autocomplete or dropdown */
  selectModel(model: ExtendedImageModelInfo): void {
    this.model.update(m => ({
      ...m,
      modelId: model.id,
      supportsImageInput: model.supportsImageInput ?? false,
    }));

    // Auto-fill supported sizes if available
    if (model.supportedSizes?.length) {
      this.model.update(m => ({
        ...m,
        supportedSizes: [...model.supportedSizes!],
        defaultSize: model.supportedSizes[0],
      }));
    }
  }

  /** Update search term for filtering */
  onModelSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.modelSearchTerm.set(input.value);
  }

  /** Display function for autocomplete */
  displayModel(model: ImageModelInfo | string): string {
    if (typeof model === 'string') {
      return model;
    }
    return model?.name ?? '';
  }

  onSubmit(): void {
    if (this.form().invalid()) {
      return;
    }

    const values = this.model();

    let modelConfig: Record<string, unknown> | undefined;
    if (values.modelConfigJson?.trim()) {
      try {
        modelConfig = JSON.parse(values.modelConfigJson) as Record<
          string,
          unknown
        >;
      } catch {
        // Invalid JSON, ignore
      }
    }

    const result: CreateImageModelProfileRequest = {
      name: values.name,
      description: values.description || undefined,
      provider: values.provider as CreateImageModelProfileRequestProvider,
      modelId: values.modelId,
      enabled: values.enabled,
      supportsImageInput: values.supportsImageInput,
      supportsCustomResolutions: values.supportsCustomResolutions,
      usesAspectRatioOnly: values.usesAspectRatioOnly,
      supportedSizes:
        values.supportedSizes.length > 0 ? values.supportedSizes : undefined,
      defaultSize: values.defaultSize || undefined,
      sortOrder: values.sortOrder,
      modelConfig: modelConfig,
    };

    this.dialogRef.close(result);
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
