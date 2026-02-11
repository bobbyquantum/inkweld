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
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import { ImageProfilesService } from '../../../api-client/api/image-profiles.service';
import {
  CustomImageSize,
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateRequestQuality,
  ImageGenerateRequestStyle,
  ImageGenerateResponse,
  ImageGenerationStatus,
  ImageProviderType,
  ImageSize,
  PublicImageModelProfile,
  PublicImageModelProfileProvider,
  WorldbuildingContext,
  WorldbuildingContextRole,
} from '../../../api-client/model/models';
import {
  SelectionChangeEvent,
  WorldbuildingElementSelection,
  WorldbuildingElementSelectorComponent,
} from '../../components/worldbuilding-element-selector/worldbuilding-element-selector.component';
import { ImageGenerationService } from '../../services/ai/image-generation.service';
import { LoggerService } from '../../services/core/logger.service';
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

type DialogStage = 'select-elements' | 'edit-prompt' | 'generating';

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
    MatStepperModule,
    MatTooltipModule,
    MatSnackBarModule,
    WorldbuildingElementSelectorComponent,
  ],
})
export class ImageGenerationDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<ImageGenerationDialogComponent>
  );
  protected readonly data = inject<ImageGenerationDialogData>(MAT_DIALOG_DATA);
  private readonly aiImageService = inject(AIImageGenerationService);
  private readonly imageProfilesService = inject(ImageProfilesService);
  private readonly generationService = inject(ImageGenerationService);
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly logger = inject(LoggerService);

  // Stepper reference for programmatic control
  readonly stepper = viewChild<MatStepper>('stepper');

  // Provider type constants for template
  readonly ImageProviderType = ImageProviderType;

  // Dialog stage: 'select-elements' | 'edit-prompt' | 'generating'
  readonly stage = signal<DialogStage>('select-elements');

  // Stepper index computed from stage
  readonly stepperIndex = computed(() => {
    switch (this.stage()) {
      case 'select-elements':
        return 0;
      case 'edit-prompt':
        return 1;
      case 'generating':
        return 2;
      default:
        return 0;
    }
  });

  // Status & loading states
  readonly isLoadingStatus = signal(true);
  readonly isLoadingProfiles = signal(false);
  readonly error = signal<string | null>(null);

  // Image model profiles for simplified selection
  readonly profiles = signal<PublicImageModelProfile[]>([]);
  readonly selectedProfile = signal<PublicImageModelProfile | null>(null);

  // Current generation job (when in generating stage)
  readonly currentJobId = signal<string | null>(null);
  readonly currentJob = computed(() => {
    const jobId = this.currentJobId();
    if (!jobId) return null;
    return this.generationService.getJob(jobId) ?? null;
  });

  // Provider status (used to check if image generation is available)
  readonly status = signal<ImageGenerationStatus | null>(null);

  // Form state (provider and model are set from profile)
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

  // Selected worldbuilding elements (from selector component)
  readonly selectedWorldbuildingElements = signal<
    WorldbuildingElementSelection[]
  >([]);

  // Auto-generated prompt based on selections
  readonly autoPrompt = computed(() => this.buildAutoPrompt());

  // Stepper state - whether each step can be navigated to
  readonly canNavigateToPrompt = computed(() => !!this.selectedProfile());
  readonly canNavigateToGenerate = computed(
    () => this.stage() === 'generating'
  );
  readonly isGenerationActive = computed(() => {
    const job = this.currentJob();
    return job?.status === 'pending' || job?.status === 'generating';
  });

  // Generation results (for selection in generating stage)
  readonly selectedImageIndex = signal<number>(0);

  // Poll interval for job updates
  private pollInterval: ReturnType<typeof setInterval> | null = null;

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
   * Parse an aspect ratio size string and return label info.
   * Supports formats:
   * - "16:9@4K" -> ratio with resolution qualifier
   * - "16:9" -> plain ratio (used by OpenRouter)
   */
  private parseAspectRatioSize(size: string): {
    ratio: string;
    resolution?: string;
    label: string;
  } | null {
    // Try format with resolution: "16:9@4K"
    const withResMatch = size.match(/^(\d+:\d+)@(\d+K)$/);
    if (withResMatch) {
      return {
        ratio: withResMatch[1],
        resolution: withResMatch[2],
        label: `${withResMatch[1]} @ ${withResMatch[2]}`,
      };
    }

    // Try plain aspect ratio: "16:9", "1:1", etc.
    const plainMatch = size.match(/^(\d+:\d+)$/);
    if (plainMatch) {
      return {
        ratio: plainMatch[1],
        label: plainMatch[1],
      };
    }

    return null;
  }

  /**
   * Get aspect ratio dimensions for SVG preview from a size value.
   * Returns width and height normalized to fit within a 20x20 viewbox.
   */
  getAspectRatioPreview(sizeValue: string): { width: number; height: number } {
    // Common aspect ratios mapped to their dimensions
    const ratioMap: Record<string, [number, number]> = {
      '1:1': [1, 1],
      '2:3': [2, 3],
      '3:2': [3, 2],
      '3:4': [3, 4],
      '4:3': [4, 3],
      '4:5': [4, 5],
      '5:4': [5, 4],
      '9:16': [9, 16],
      '16:9': [16, 9],
      '21:9': [21, 9],
    };

    // Try to parse the size value
    // First check if it's a plain ratio like "16:9"
    const plainMatch = sizeValue.match(/^(\d+):(\d+)$/);
    if (plainMatch) {
      const w = parseInt(plainMatch[1], 10);
      const h = parseInt(plainMatch[2], 10);
      return this.normalizeToViewbox(w, h, 16);
    }

    // Check if it's a ratio with resolution like "16:9@4K"
    const withResMatch = sizeValue.match(/^(\d+):(\d+)@/);
    if (withResMatch) {
      const w = parseInt(withResMatch[1], 10);
      const h = parseInt(withResMatch[2], 10);
      return this.normalizeToViewbox(w, h, 16);
    }

    // Check if it's a dimension format like "1920x1080"
    const dimMatch = sizeValue.match(/^(\d+)x(\d+)$/);
    if (dimMatch) {
      const w = parseInt(dimMatch[1], 10);
      const h = parseInt(dimMatch[2], 10);
      return this.normalizeToViewbox(w, h, 16);
    }

    // Check preset ratio map
    if (ratioMap[sizeValue]) {
      const [w, h] = ratioMap[sizeValue];
      return this.normalizeToViewbox(w, h, 16);
    }

    // Default to square
    return { width: 16, height: 16 };
  }

  /**
   * Normalize dimensions to fit within a max size while preserving aspect ratio.
   */
  private normalizeToViewbox(
    w: number,
    h: number,
    maxSize: number
  ): { width: number; height: number } {
    const ratio = w / h;
    if (ratio >= 1) {
      // Wider than tall
      return { width: maxSize, height: Math.round(maxSize / ratio) };
    } else {
      // Taller than wide
      return { width: Math.round(maxSize * ratio), height: maxSize };
    }
  }

  /**
   * Get the label for the currently selected size.
   */
  getSelectedSizeLabel(): string {
    const size = this.selectedSize() as string;
    const options = this.sizeOptions();
    const match = options.find(o => String(o.value) === size);
    return match?.label ?? size;
  }

  /**
   * Build size options based on:
   * 1. Selected profile's supported sizes (if configured)
   * 2. Custom sizes from admin configuration
   * 3. Default size options as fallback
   *
   * Handles both dimension format (1920x1080) and aspect ratio format (16:9@4K)
   */
  readonly sizeOptions = computed(() => {
    const profile = this.selectedProfile();
    const custom = this.customSizes();

    // Get supported sizes from the profile, or empty array
    const supportedSizes = profile?.supportedSizes ?? [];

    // Build options list
    const options: {
      value: ImageSize | string;
      label: string;
      megapixels: string;
      isCustom?: boolean;
    }[] = [];

    // First, add sizes from the profile's supported sizes
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

    // If no profile sizes configured, use defaults
    if (options.length === 0) {
      options.push(...this.defaultSizeOptions);
    }

    // Add custom sizes (only for dimension-based profiles)
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
    // When profile changes, update size options if needed
    effect(() => {
      const profile = this.selectedProfile();
      if (profile) {
        const options = this.sizeOptions();
        if (options.length > 0) {
          const currentSize = this.selectedSize();
          // Check if current size is still valid for this profile
          const isValid = options.some(
            o => o.value === (currentSize as string)
          );
          if (!isValid) {
            // Reset to profile's default size or first option
            const defaultSize = profile.defaultSize;
            if (defaultSize && options.some(o => o.value === defaultSize)) {
              this.selectedSize.set(defaultSize as ImageSize);
            } else {
              this.selectedSize.set(options[0].value as ImageSize);
            }
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
    // Load status first, then profiles (profiles depend on status for filtering)
    void this.loadStatus().then(() => void this.loadProfiles());
    void this.loadCustomSizes();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** Load enabled image model profiles */
  private async loadProfiles(): Promise<void> {
    this.logger.debug('ImageGenDialog', 'loadProfiles() called');
    this.isLoadingProfiles.set(true);

    try {
      this.logger.debug(
        'ImageGenDialog',
        'Fetching profiles from imageProfilesService.listImageProfiles()'
      );
      const allProfiles =
        (await firstValueFrom(this.imageProfilesService.listImageProfiles())) ??
        [];

      this.logger.info(
        'ImageGenDialog',
        `Received ${allProfiles.length} profiles from API`,
        { profiles: allProfiles }
      );

      // Filter out profiles from disabled providers
      const status = this.status();
      const enabledProviders = new Set(
        status?.providers
          .filter(p => p.enabled && p.available)
          .map(p => p.type as string) ?? []
      );

      const profiles = allProfiles.filter(p =>
        enabledProviders.has(p.provider as string)
      );

      if (profiles.length < allProfiles.length) {
        this.logger.info(
          'ImageGenDialog',
          `Filtered out ${allProfiles.length - profiles.length} profiles from disabled providers`
        );
      }

      // Note: supportsImageInput means the model CAN accept image input (for image-to-image),
      // not that it requires one. All profiles can be used for text-to-image generation.
      this.profiles.set(profiles);
      this.logger.debug(
        'ImageGenDialog',
        `Set profiles signal with ${profiles.length} profiles`
      );

      // If profiles exist, select the first one by default
      if (profiles.length > 0) {
        this.logger.info(
          'ImageGenDialog',
          `Selecting first profile: ${profiles[0].name}`,
          { profile: profiles[0] }
        );
        this.selectedProfile.set(profiles[0]);
        this.applyProfileSettings(profiles[0]);
      } else {
        this.logger.warn(
          'ImageGenDialog',
          'No profiles available after loading'
        );
      }
    } catch (err) {
      this.logger.error('ImageGenDialog', 'Failed to load image profiles', err);
      this.profiles.set([]);
    } finally {
      this.isLoadingProfiles.set(false);
      this.logger.debug('ImageGenDialog', 'loadProfiles() completed');
    }
  }

  /** Apply settings from a selected profile */
  applyProfileSettings(profile: PublicImageModelProfile): void {
    // Set provider and model from profile
    // Cast through unknown since the enums have same values but different types
    this.selectedProvider.set(profile.provider as unknown as ImageProviderType);
    this.selectedModel.set(profile.modelId);

    // Set default size if specified, unless we're in forCover mode
    // (forCover mode has its own portrait size preference)
    if (profile.defaultSize && !this.data.forCover) {
      this.selectedSize.set(profile.defaultSize as ImageSize);
    }
  }

  /** Handle profile selection change */
  onProfileChange(profile: PublicImageModelProfile): void {
    this.selectedProfile.set(profile);
    this.applyProfileSettings(profile);
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
    } catch (err) {
      console.error('Failed to load image generation status:', err);
      this.error.set('Failed to load image generation configuration');
    } finally {
      this.isLoadingStatus.set(false);
    }
  }

  /**
   * Handle worldbuilding element selection changes from the selector component
   */
  onWorldbuildingSelectionChange(event: SelectionChangeEvent): void {
    this.selectedWorldbuildingElements.set(event.elements);
  }

  /**
   * Navigate to the prompt editing stage
   */
  goToPromptStage(): void {
    const profile = this.selectedProfile();
    if (!profile) {
      this.snackBar.open('Please select a model profile', 'Close', {
        duration: 3000,
      });
      return;
    }

    // Build the prompt based on current state
    const currentPrompt = this.prompt().trim();
    const autoPrompt = this.buildAutoPrompt();

    if (!currentPrompt) {
      // No existing prompt - use auto-generated one
      this.prompt.set(autoPrompt);
    } else if (this.data.forCover && autoPrompt) {
      // For cover generation, append worldbuilding context to the cover prompt
      // if user has selected worldbuilding elements
      const elements = this.selectedWorldbuildingElements();
      if (elements.length > 0) {
        // Check if the prompt already contains worldbuilding info (avoid duplicating)
        const hasWorldbuildingInfo = elements.some(el =>
          currentPrompt.includes(el.name)
        );
        if (!hasWorldbuildingInfo) {
          this.prompt.set(`${currentPrompt}\n\n${autoPrompt}`);
        }
      }
    }

    this.stage.set('edit-prompt');
  }

  /**
   * Navigate back to element selection stage
   */
  goToSelectStage(): void {
    this.stage.set('select-elements');
  }

  /**
   * Handle stepper step change (when user clicks on step header)
   */
  onStepChange(event: { selectedIndex: number }): void {
    const targetIndex = event.selectedIndex;
    const currentIndex = this.stepperIndex();

    // Don't allow navigation during active generation
    if (this.isGenerationActive()) {
      this.resetStepperTo(currentIndex);
      this.snackBar.open('Please wait for generation to complete', 'Close', {
        duration: 3000,
      });
      return;
    }

    if (targetIndex === 0) {
      // Always allow going back to step 1
      this.stage.set('select-elements');
    } else if (targetIndex === 1) {
      // Only allow going to prompt stage if we have a profile selected
      if (!this.canNavigateToPrompt()) {
        this.resetStepperTo(currentIndex);
        this.snackBar.open('Please select a model profile first', 'Close', {
          duration: 3000,
        });
        return;
      }
      this.stage.set('edit-prompt');
    } else if (targetIndex === 2) {
      // Can only go to generate step if already generating (via Generate button)
      if (!this.canNavigateToGenerate()) {
        this.resetStepperTo(currentIndex);
        this.snackBar.open(
          'Click the Generate button to start generation',
          'Close',
          {
            duration: 3000,
          }
        );
        return;
      }
      // Already in generating stage, just stay there
    }
  }

  /**
   * Reset stepper to a specific index
   */
  private resetStepperTo(index: number): void {
    const stepper = this.stepper();
    if (stepper) {
      // Use setTimeout to reset after Angular's change detection
      setTimeout(() => {
        stepper.selectedIndex = index;
      }, 0);
    }
  }

  /**
   * Build an automatic prompt based on selected elements and their toggles
   */
  private buildAutoPrompt(): string {
    const elements = this.selectedWorldbuildingElements();
    if (elements.length === 0) {
      return this.data.prompt || '';
    }

    const parts: string[] = [];

    // Add intro for multiple elements
    if (elements.length > 1) {
      parts.push('Create a scene combining the following elements');
    }

    for (const el of elements) {
      const elementParts: string[] = [];

      // Add element name
      elementParts.push(el.name);

      // Add description if enabled
      if (el.includeDescription && el.description) {
        elementParts.push(el.description);
      }

      // Add data fields if enabled
      if (el.includeData && el.data) {
        const dataFields = this.formatWorldbuildingData(el.data);
        if (dataFields) {
          elementParts.push(dataFields);
        }
      }

      if (elementParts.length > 0) {
        parts.push(elementParts.join('. '));
      }
    }

    return parts.join('. ');
  }

  /**
   * Format worldbuilding data into a prompt-friendly string
   */
  private formatWorldbuildingData(data: Record<string, unknown>): string {
    const fieldParts: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      // Skip empty values, internal fields, and timestamps
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        key === 'lastModified' ||
        key.startsWith('_')
      ) {
        continue;
      }

      let formattedValue: string;
      if (Array.isArray(value)) {
        formattedValue = value.filter(v => v).join(', ');
        if (!formattedValue) continue;
      } else if (typeof value === 'object') {
        continue; // Skip nested objects
      } else if (typeof value === 'string') {
        formattedValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        formattedValue = String(value);
      } else {
        continue;
      }

      fieldParts.push(`${key}: ${formattedValue}`);
    }

    return fieldParts.join(', ');
  }

  /**
   * Build WorldbuildingContext array from selected elements
   */
  private buildWorldbuildingContext(
    elements: WorldbuildingElementSelection[]
  ): WorldbuildingContext[] {
    return elements.map(el => {
      // Build the context with proper typing
      const context: WorldbuildingContext = {
        elementId: el.id,
        name: el.name,
        type: el.type,
        // Map toggles to a role - if includeReference is on, use Reference role
        role: el.includeReference
          ? WorldbuildingContextRole.Reference
          : WorldbuildingContextRole.Subject,
        data: {},
      };

      // Copy data fields if includeData is enabled
      if (el.includeData && el.data) {
        for (const [key, value] of Object.entries(el.data)) {
          context.data[key] = value as null;
        }
      }

      return context;
    });
  }

  /**
   * Start generation - switches to generating stage and starts background job
   */
  generate(): void {
    const profile = this.selectedProfile();
    const provider = this.selectedProvider();
    const prompt = this.prompt().trim();

    if (!prompt) {
      this.snackBar.open('Please enter a prompt', 'Close', { duration: 3000 });
      return;
    }

    if (!profile || !provider) {
      this.snackBar.open('Please select a model profile', 'Close', {
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

    // Build worldbuilding context from selected elements
    const elements = this.selectedWorldbuildingElements();
    const worldbuildingContext = this.buildWorldbuildingContext(elements);

    // Build the projectKey for server-side reference image loading
    const projectKey = `${project.username}/${project.slug}`;

    const request: ImageGenerateRequest = {
      prompt,
      profileId: profile.id,
      projectKey, // Send projectKey so server can load reference images
      n: this.imageCount(),
      size: this.selectedSize(),
      worldbuildingContext:
        worldbuildingContext.length > 0 ? worldbuildingContext : undefined,
    };

    // Provider-specific options that can override profile defaults
    if (profile.provider === PublicImageModelProfileProvider.Openai) {
      request.quality = this.quality();
      request.style = this.style();
    }

    if (profile.provider === PublicImageModelProfileProvider.StableDiffusion) {
      const negPrompt = this.negativePrompt().trim();
      if (negPrompt) {
        request.negativePrompt = negPrompt;
      }
    }

    // Switch to generating stage
    this.stage.set('generating');

    // Start background generation — pass provider type for streaming detection
    const jobId = this.generationService.startGeneration(projectKey, request, {
      forCover: this.data.forCover,
      providerType: profile.provider,
    });
    this.currentJobId.set(jobId);

    // Start polling for job updates
    this.startPolling();
  }

  /**
   * Go back to prompt stage (only if not actively generating)
   */
  goBack(): void {
    const job = this.currentJob();
    if (job && (job.status === 'generating' || job.status === 'saving')) {
      // Can't go back during active generation
      return;
    }
    this.stage.set('edit-prompt');
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
        return 'OpenAI';
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
    const profile = this.selectedProfile();
    if (profile) {
      return profile.name;
    }
    const modelId = this.selectedModel();
    return modelId ?? 'Default';
  }

  formatElementData(data: Record<string, unknown> | undefined): string {
    if (!data) return 'No data available';
    return JSON.stringify(data, null, 2);
  }

  /**
   * Get the appropriate icon for a worldbuilding element type
   */
  getElementIcon(type: string): string {
    const iconMap: Record<string, string> = {
      character: 'person',
      location: 'place',
      item: 'inventory_2',
      event: 'event',
      organization: 'groups',
      concept: 'lightbulb',
      creature: 'pets',
      faction: 'flag',
    };

    // Type may be like "worldbuilding/character" or just "character"
    const normalizedType = type.replace('worldbuilding/', '').toLowerCase();
    return iconMap[normalizedType] || 'category';
  }

  /**
   * Truncate prompt for summary display
   */
  truncatePrompt(prompt: string, maxLength = 200): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }
}
