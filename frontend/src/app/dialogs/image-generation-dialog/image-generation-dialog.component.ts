import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import {
  CustomImageSize,
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateRequestQuality,
  ImageGenerateRequestStyle,
  ImageGenerateResponse,
  ImageGenerationStatus,
  ImageModelInfo,
  ImageProviderType,
  ImageSize,
  WorldbuildingContext,
  WorldbuildingContextRole,
} from '../../../api-client/model/models';
import { ImageGenerationService } from '../../services/ai/image-generation.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

export interface ImageGenerationDialogData {
  /** Pre-fill prompt */
  prompt?: string;
  /** Pre-selected worldbuilding element IDs */
  selectedElementIds?: string[];
  /** Whether this is for cover generation (affects sizing) */
  forCover?: boolean;
}

export interface ImageGenerationDialogResult {
  /** Whether user confirmed/saved the image */
  saved: boolean;
  /** The generated image data (base64 or URL) */
  imageData?: string;
  /** The generation response */
  response?: ImageGenerateResponse;
}

interface WorldbuildingElement {
  id: string;
  name: string;
  type: string;
  selected: boolean;
  role: WorldbuildingContextRole;
  data?: Record<string, unknown>;
}

type DialogStage = 'form' | 'generating';

@Component({
  selector: 'app-image-generation-dialog',
  templateUrl: './image-generation-dialog.component.html',
  styleUrls: ['./image-generation-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatChipsModule,
    MatExpansionModule,
    MatSliderModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
})
export class ImageGenerationDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<ImageGenerationDialogComponent>
  );
  private readonly data = inject<ImageGenerationDialogData>(MAT_DIALOG_DATA);
  private readonly aiImageService = inject(AIImageGenerationService);
  private readonly generationService = inject(ImageGenerationService);
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly snackBar = inject(MatSnackBar);

  // Provider type constants for template
  readonly ImageProviderType = ImageProviderType;

  // Dialog stage: 'form' or 'generating'
  readonly stage = signal<DialogStage>('form');

  // Status & loading states
  readonly isLoadingStatus = signal(true);
  readonly isLoadingModels = signal(false);
  readonly error = signal<string | null>(null);

  // Current generation job (when in generating stage)
  readonly currentJobId = signal<string | null>(null);
  readonly currentJob = computed(() => {
    const jobId = this.currentJobId();
    if (!jobId) return null;
    return this.generationService.getJob(jobId) ?? null;
  });

  // Provider status
  readonly status = signal<ImageGenerationStatus | null>(null);
  readonly enabledProviders = computed(() => {
    const s = this.status();
    if (!s) return [];
    return s.providers
      .filter(p => p.enabled && p.available)
      .map(p => ({ key: p.type, ...p }));
  });

  // Form state
  readonly prompt = signal<string>(this.data.prompt || '');
  readonly selectedProvider = signal<ImageProviderType | null>(null);
  readonly selectedModel = signal<string | null>(null);
  readonly imageCount = signal<number>(1);
  readonly selectedSize = signal<ImageSize>(ImageSize._1024x1024);
  readonly quality = signal<ImageGenerateRequestQuality>(
    ImageGenerateRequestQuality.Standard
  );
  readonly style = signal<ImageGenerateRequestStyle>(
    ImageGenerateRequestStyle.Vivid
  );
  readonly negativePrompt = signal<string>('');

  // Available models for selected provider
  readonly availableModels = signal<ImageModelInfo[]>([]);

  // Worldbuilding elements
  readonly worldbuildingElements = signal<WorldbuildingElement[]>([]);
  readonly showWorldbuilding = signal(false);

  // Generation results (for selection in generating stage)
  readonly selectedImageIndex = signal<number>(0);

  // Poll interval for job updates
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  // Role options for worldbuilding elements
  readonly roleOptions: {
    value: WorldbuildingContextRole;
    label: string;
    description: string;
  }[] = [
    {
      value: WorldbuildingContextRole.Subject,
      label: 'Subject',
      description: 'Main focus of the image',
    },
    {
      value: WorldbuildingContextRole.Setting,
      label: 'Setting',
      description: 'Background or environment',
    },
    {
      value: WorldbuildingContextRole.Style,
      label: 'Style',
      description: 'Artistic style influence',
    },
    {
      value: WorldbuildingContextRole.Reference,
      label: 'Reference',
      description: 'Additional context',
    },
  ];

  // Custom sizes loaded from backend
  readonly customSizes = signal<CustomImageSize[]>([]);

  // Default size options based on OpenRouter/Gemini supported aspect ratios
  readonly defaultSizeOptions: {
    value: ImageSize;
    label: string;
    megapixels: string;
    isCustom?: boolean;
  }[] = [
    {
      value: ImageSize._1024x1024,
      label: '1024×1024 (1:1 Square)',
      megapixels: '1.05',
    },
    {
      value: ImageSize._832x1248,
      label: '832×1248 (2:3 Portrait)',
      megapixels: '1.04',
    },
    {
      value: ImageSize._1248x832,
      label: '1248×832 (3:2 Landscape)',
      megapixels: '1.04',
    },
    {
      value: ImageSize._864x1184,
      label: '864×1184 (3:4 Portrait)',
      megapixels: '1.02',
    },
    {
      value: ImageSize._1184x864,
      label: '1184×864 (4:3 Landscape)',
      megapixels: '1.02',
    },
    {
      value: ImageSize._896x1152,
      label: '896×1152 (4:5 Portrait)',
      megapixels: '1.03',
    },
    {
      value: ImageSize._1152x896,
      label: '1152×896 (5:4 Landscape)',
      megapixels: '1.03',
    },
    {
      value: ImageSize._768x1344,
      label: '768×1344 (9:16 Tall)',
      megapixels: '1.03',
    },
    {
      value: ImageSize._1344x768,
      label: '1344×768 (16:9 Wide)',
      megapixels: '1.03',
    },
    {
      value: ImageSize._1536x672,
      label: '1536×672 (21:9 Ultra-wide)',
      megapixels: '1.03',
    },
    // Fal.ai extended sizes
    {
      value: ImageSize._1920x1080,
      label: '1920×1080 (HD Landscape)',
      megapixels: '2.07',
    },
    {
      value: ImageSize._1080x1920,
      label: '1080×1920 (HD Portrait)',
      megapixels: '2.07',
    },
    {
      value: ImageSize._1600x2560,
      label: '1600×2560 (Ebook Cover)',
      megapixels: '4.10',
    },
    {
      value: ImageSize._2560x1600,
      label: '2560×1600 (Wide Ebook)',
      megapixels: '4.10',
    },
  ];

  /**
   * Parse an aspect ratio size string (e.g., "16:9@4K") and return label info.
   */
  private parseAspectRatioSize(size: string): {
    ratio: string;
    resolution: string;
    label: string;
  } | null {
    const match = size.match(/^(\d+:\d+)@(\d+K)$/);
    if (match) {
      return {
        ratio: match[1],
        resolution: match[2],
        label: `${match[1]} @ ${match[2]}`,
      };
    }
    return null;
  }

  /**
   * Build size options based on:
   * 1. Selected model's supported sizes
   * 2. Custom sizes (for dimension-based models)
   *
   * Handles both dimension format (1920x1080) and aspect ratio format (16:9@4K)
   */
  readonly sizeOptions = computed(() => {
    const selectedModelId = this.selectedModel();
    const models = this.availableModels();
    const custom = this.customSizes();

    // Find the selected model
    const selectedModel = selectedModelId
      ? models.find(m => m.id === selectedModelId)
      : null;

    // Get supported sizes from the model, or fall back to defaults
    const supportedSizes = selectedModel?.supportedSizes ?? [];

    // Build options list
    const options: {
      value: ImageSize | string;
      label: string;
      megapixels: string;
      isCustom?: boolean;
    }[] = [];

    // First, add sizes from the model's supported sizes
    for (const size of supportedSizes) {
      // Check if this is an aspect ratio format (e.g., "16:9@4K")
      const aspectRatio = this.parseAspectRatioSize(size);
      if (aspectRatio) {
        options.push({
          value: size,
          label: aspectRatio.label,
          megapixels: '-', // Not applicable for aspect ratio format
        });
      } else {
        // Dimension format - check if we have a default label
        const defaultOption = this.defaultSizeOptions.find(
          d => (d.value as string) === size
        );
        if (defaultOption) {
          options.push(defaultOption);
        } else {
          // Parse dimensions
          const match = size.match(/^(\d+)x(\d+)$/);
          if (match) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            const mp = (w * h) / 1_000_000;
            options.push({
              value: size as ImageSize,
              label: `${w}×${h}`,
              megapixels: mp.toFixed(2),
            });
          }
        }
      }
    }

    // If no model is selected or model has no sizes, use defaults
    if (options.length === 0) {
      options.push(...this.defaultSizeOptions);
    }

    // Add custom sizes (only for dimension-based models)
    const hasAspectRatioSizes = supportedSizes.some(
      s => this.parseAspectRatioSize(s) !== null
    );
    if (!hasAspectRatioSizes) {
      const customOptions = custom.map(cs => {
        const mp = (cs.width * cs.height) / 1_000_000;
        return {
          value: `${cs.width}x${cs.height}` as ImageSize,
          label: `${cs.width}×${cs.height} (${cs.name})`,
          megapixels: mp.toFixed(2),
          isCustom: true,
        };
      });

      // Filter out any custom sizes that match existing options
      const existingValues = new Set(options.map(o => o.value));
      const uniqueCustom = customOptions.filter(
        c => !existingValues.has(c.value)
      );
      options.push(...uniqueCustom);
    }

    return options;
  });

  constructor() {
    // When provider changes, load models
    effect(() => {
      const provider = this.selectedProvider();
      if (provider) {
        void this.loadModels(provider);
      }
    });

    // When model changes, reset selected size to first available option
    effect(() => {
      const modelId = this.selectedModel();
      if (modelId) {
        const options = this.sizeOptions();
        if (options.length > 0) {
          const currentSize = this.selectedSize();
          // Check if current size is still valid for this model
          const isValid = options.some(
            o => o.value === (currentSize as string)
          );
          if (!isValid) {
            // Reset to first option
            this.selectedSize.set(options[0].value as ImageSize);
          }
        }
      }
    });

    // Default to cover sizes and prepopulate prompt if forCover
    if (this.data.forCover) {
      this.selectedSize.set(ImageSize._768x1344);

      // Prepopulate prompt with project info if no prompt provided
      if (!this.data.prompt) {
        const project = this.projectState.project();
        if (project) {
          let coverPrompt = `Generate a front cover image for "${project.title}"`;
          if (project.description) {
            coverPrompt += `: ${project.description}`;
          }
          coverPrompt +=
            '. Create an evocative, visually striking book cover that captures the essence of the story.';
          this.prompt.set(coverPrompt);
        }
      }
    }
  }

  ngOnInit(): void {
    void this.loadStatus();
    void this.loadWorldbuildingElements();
    void this.loadCustomSizes();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** Load custom image sizes from the backend */
  private async loadCustomSizes(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.aiImageService.getCustomImageSizes()
      );
      this.customSizes.set(response?.sizes || []);
    } catch (err) {
      // Non-critical - just use default sizes
      console.warn('Failed to load custom sizes:', err);
      this.customSizes.set([]);
    }
  }

  private async loadStatus(): Promise<void> {
    this.isLoadingStatus.set(true);
    this.error.set(null);

    try {
      const status = await firstValueFrom(
        this.aiImageService.getImageGenerationStatus()
      );
      this.status.set(status);

      // Auto-select default provider
      if (status.available && status.defaultProvider) {
        const defaultProviderStatus = status.providers.find(
          p => p.type === status.defaultProvider
        );
        if (
          defaultProviderStatus?.enabled &&
          defaultProviderStatus?.available
        ) {
          this.selectedProvider.set(status.defaultProvider);
        } else {
          const available = this.enabledProviders();
          if (available.length > 0) {
            this.selectedProvider.set(available[0].key);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load image generation status:', err);
      this.error.set('Failed to load image generation configuration');
    } finally {
      this.isLoadingStatus.set(false);
    }
  }

  private async loadModels(provider: ImageProviderType): Promise<void> {
    this.isLoadingModels.set(true);
    this.availableModels.set([]);
    this.selectedModel.set(null);

    try {
      const response = await firstValueFrom(
        this.aiImageService.getProviderModels(provider)
      );
      this.availableModels.set(response.models);

      if (response.models.length > 0) {
        this.selectedModel.set(response.models[0].id);
      }
    } catch (err) {
      console.error('Failed to load models for provider:', provider, err);
      this.snackBar.open('Failed to load available models', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isLoadingModels.set(false);
    }
  }

  private async loadWorldbuildingElements(): Promise<void> {
    const elements = this.projectState.elements();
    const username = this.projectState.project()?.username;
    const slug = this.projectState.project()?.slug;

    const worldbuildingElements = elements.filter(
      el => el.type && el.type.startsWith('worldbuilding/')
    );

    const loadedElements: WorldbuildingElement[] = [];

    for (const el of worldbuildingElements) {
      let data: Record<string, unknown> | undefined;
      try {
        if (username && slug) {
          const result = await this.worldbuildingService.getWorldbuildingData(
            el.id,
            username,
            slug
          );
          data = result ?? undefined;
        }
      } catch {
        // Ignore errors loading individual elements
      }

      const isPreSelected =
        this.data.selectedElementIds?.includes(el.id) || false;

      loadedElements.push({
        id: el.id,
        name: el.name,
        type: el.type.replace('worldbuilding/', ''),
        selected: isPreSelected,
        role: WorldbuildingContextRole.Reference,
        data: data,
      });
    }

    this.worldbuildingElements.set(loadedElements);

    if (
      this.data.selectedElementIds &&
      this.data.selectedElementIds.length > 0
    ) {
      this.showWorldbuilding.set(true);
    }
  }

  toggleElementSelection(element: WorldbuildingElement): void {
    this.worldbuildingElements.update(elements =>
      elements.map(el =>
        el.id === element.id ? { ...el, selected: !el.selected } : el
      )
    );
  }

  updateElementRole(
    element: WorldbuildingElement,
    role: WorldbuildingContextRole
  ): void {
    this.worldbuildingElements.update(elements =>
      elements.map(el => (el.id === element.id ? { ...el, role } : el))
    );
  }

  getSelectedElements(): WorldbuildingElement[] {
    return this.worldbuildingElements().filter(el => el.selected);
  }

  /**
   * Start generation - switches to generating stage and starts background job
   */
  generate(): void {
    const provider = this.selectedProvider();
    const prompt = this.prompt().trim();

    if (!prompt) {
      this.snackBar.open('Please enter a prompt', 'Close', { duration: 3000 });
      return;
    }

    if (!provider) {
      this.snackBar.open('Please select a provider', 'Close', {
        duration: 3000,
      });
      return;
    }

    const project = this.projectState.project();
    if (!project?.username || !project?.slug) {
      this.snackBar.open('No project context', 'Close', { duration: 3000 });
      return;
    }

    this.error.set(null);

    // Build request
    const worldbuildingContext: WorldbuildingContext[] =
      this.getSelectedElements().map(el => ({
        elementId: el.id,
        name: el.name,
        type: el.type,
        role: el.role,
        data: el.data || {},
      }));

    const request: ImageGenerateRequest = {
      prompt,
      provider,
      model: this.selectedModel() || undefined,
      n: this.imageCount(),
      size: this.selectedSize(),
      worldbuildingContext:
        worldbuildingContext.length > 0 ? worldbuildingContext : undefined,
    };

    if (provider === ImageProviderType.Openai) {
      request.quality = this.quality();
      request.style = this.style();
    }

    if (provider === ImageProviderType.StableDiffusion) {
      const negPrompt = this.negativePrompt().trim();
      if (negPrompt) {
        request.negativePrompt = negPrompt;
      }
    }

    // Switch to generating stage
    this.stage.set('generating');

    // Start background generation
    const projectKey = `${project.username}/${project.slug}`;
    const jobId = this.generationService.startGeneration(projectKey, request, {
      forCover: this.data.forCover,
    });
    this.currentJobId.set(jobId);

    // Start polling for job updates
    this.startPolling();
  }

  /**
   * Go back to form stage (only if not actively generating)
   */
  goBack(): void {
    const job = this.currentJob();
    if (job && (job.status === 'generating' || job.status === 'saving')) {
      // Can't go back during active generation
      return;
    }
    this.stage.set('form');
    this.currentJobId.set(null);
    this.selectedImageIndex.set(0);
    this.stopPolling();
  }

  /**
   * Check if back button should be disabled
   */
  isBackDisabled(): boolean {
    const job = this.currentJob();
    return !!job && (job.status === 'generating' || job.status === 'saving');
  }

  /**
   * Start polling for job updates
   */
  private startPolling(): void {
    this.stopPolling();
    // Poll every 500ms for updates
    this.pollInterval = setInterval(() => {
      const job = this.generationService.getJob(this.currentJobId() ?? '');
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        this.stopPolling();
      }
    }, 500);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  selectImage(index: number): void {
    this.selectedImageIndex.set(index);
  }

  getSelectedImage(): GeneratedImage | null {
    const job = this.currentJob();
    if (!job || job.images.length === 0) return null;
    const index = this.selectedImageIndex();
    return job.images[index] || null;
  }

  getImageUrl(image: GeneratedImage): string {
    if (image.url) {
      return image.url;
    }
    if (image.b64Json) {
      return `data:image/png;base64,${image.b64Json}`;
    }
    return '';
  }

  /**
   * Use selected image and close dialog
   */
  saveAndClose(): void {
    const job = this.currentJob();
    const selectedImage = this.getSelectedImage();
    if (!selectedImage || !job) {
      this.snackBar.open('No image selected', 'Close', { duration: 3000 });
      return;
    }

    const result: ImageGenerationDialogResult = {
      saved: true,
      imageData: this.getImageUrl(selectedImage),
      response: job.response,
    };

    this.dialogRef.close(result);
  }

  /**
   * Close dialog without selecting - generation continues in background
   */
  cancel(): void {
    const job = this.currentJob();
    if (job && (job.status === 'generating' || job.status === 'saving')) {
      this.snackBar.open(
        'Generation will continue in the background. Check Media tab for results.',
        'OK',
        {
          duration: 4000,
        }
      );
    }

    const result: ImageGenerationDialogResult = { saved: false };
    this.dialogRef.close(result);
  }

  getProviderIcon(provider: ImageProviderType | string): string {
    const providerStr = String(provider);
    switch (providerStr) {
      case 'openai':
        return 'auto_awesome';
      case 'openrouter':
        return 'hub';
      case 'falai':
        return 'bolt';
      case 'stable-diffusion':
        return 'brush';
      default:
        return 'image';
    }
  }

  getProviderLabel(provider: ImageProviderType | string): string {
    const providerStr = String(provider);
    switch (providerStr) {
      case 'openai':
        return 'OpenAI (DALL-E)';
      case 'openrouter':
        return 'OpenRouter';
      case 'falai':
        return 'Fal.ai';
      case 'stable-diffusion':
        return 'Stable Diffusion';
      default:
        return providerStr;
    }
  }

  getSizeLabel(size: string): string {
    const option = this.sizeOptions().find(s => String(s.value) === size);
    return option?.label ?? size;
  }

  getModelName(): string {
    const modelId = this.selectedModel();
    if (!modelId) return 'Default';
    const model = this.availableModels().find(m => m.id === modelId);
    return model?.name ?? modelId;
  }

  formatElementData(data: Record<string, unknown> | undefined): string {
    if (!data) return 'No data available';
    return JSON.stringify(data, null, 2);
  }

  /**
   * Truncate prompt for summary display
   */
  truncatePrompt(prompt: string, maxLength = 200): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }
}
