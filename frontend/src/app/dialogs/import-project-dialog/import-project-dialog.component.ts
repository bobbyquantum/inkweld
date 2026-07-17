import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';

import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import {
  type ArchiveManifest,
  type ArchiveProject,
} from '../../models/project-archive';
import { ProjectImportService } from '../../services/project/project-import.service';

export interface ImportProjectDialogData {
  username?: string;
}

export interface ImportProjectDialogResult {
  success: boolean;
  slug?: string;
  error?: string;
}

type DialogStep = 'file-select' | 'configure' | 'importing' | 'complete';

interface ArchivePreview {
  manifest: ArchiveManifest;
  project: ArchiveProject;
  counts: {
    elements: number;
    documents: number;
    worldbuildingEntries: number;
    schemas: number;
    mediaFiles: number;
  };
}

interface ImportProjectFormValue {
  slug: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Component({
  selector: 'app-import-project-dialog',
  templateUrl: './import-project-dialog.component.html',
  styleUrl: './import-project-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
  ],
})
export class ImportProjectDialogComponent {
  protected readonly data = inject<ImportProjectDialogData | null>(
    MAT_DIALOG_DATA,
    { optional: true }
  );
  private readonly dialogRef = inject(
    MatDialogRef<ImportProjectDialogComponent, ImportProjectDialogResult>
  );
  private readonly importService = inject(ProjectImportService);

  readonly step = signal<DialogStep>('file-select');
  readonly isDragOver = signal(false);
  readonly isParsing = signal(false);
  readonly parseError = signal<string | null>(null);

  readonly archivePreview = signal<ArchivePreview | null>(null);
  readonly archiveFile = signal<File | null>(null);
  readonly manifest = computed(() => this.archivePreview()?.manifest ?? null);
  readonly projectData = computed(() => this.archivePreview()?.project ?? null);
  readonly counts = computed(() => this.archivePreview()?.counts ?? null);

  readonly isValidating = signal(false);
  readonly validationResult = signal<{
    available: boolean;
    error?: string;
  } | null>(null);

  readonly importProgress = signal(0);
  readonly importStatus = signal('');
  readonly importError = signal<string | null>(null);
  readonly importedSlug = signal<string | null>(null);

  readonly slugTaken = signal(false);

  readonly model = signal<ImportProjectFormValue>({ slug: '' });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.slug, { message: 'Slug is required' });
    minLength(schemaPath.slug, 3, {
      message: 'Slug must be at least 3 characters',
    });
    maxLength(schemaPath.slug, 50, {
      message: 'Slug cannot exceed 50 characters',
    });
    pattern(schemaPath.slug, SLUG_PATTERN, {
      message: 'Use lowercase letters, numbers, and hyphens only',
    });
    validate(schemaPath.slug, () =>
      this.slugTaken()
        ? { kind: 'slugTaken', message: 'This slug is already taken' }
        : null
    );
  });

  constructor() {
    effect(() => {
      const progress = this.importService.progress();
      this.importProgress.set(progress.progress);
      this.importStatus.set(progress.message);
    });

    effect(() => {
      const slug = this.form.slug().value();
      const staticallyValid =
        slug.length >= 3 && slug.length <= 50 && SLUG_PATTERN.test(slug);
      if (!staticallyValid) {
        this.validationResult.set(null);
        if (this.slugTaken()) {
          this.slugTaken.set(false);
        }
        return;
      }
      const timer = setTimeout(() => {
        this.validateSlugAvailability(slug);
      }, 300);
      return () => clearTimeout(timer);
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void this.processFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      void this.processFile(input.files[0]);
    }
  }

  private async processFile(file: File): Promise<void> {
    if (!file.name.endsWith('.zip')) {
      this.parseError.set('Please select a ZIP file');
      return;
    }
    this.isParsing.set(true);
    this.parseError.set(null);
    try {
      const preview = await this.importService.previewArchive(file);
      this.archivePreview.set(preview);
      this.archiveFile.set(file);
      const suggestedSlug = this.importService.suggestSlug(
        preview.manifest.originalSlug
      );
      this.model.set({ slug: suggestedSlug });
      this.slugTaken.set(false);
      this.step.set('configure');
      if (this.form.slug().valid()) {
        this.validateSlugAvailability(suggestedSlug);
      }
    } catch (error) {
      this.parseError.set(
        error instanceof Error ? error.message : 'Failed to parse archive'
      );
    } finally {
      this.isParsing.set(false);
    }
  }

  private validateSlugAvailability(slug: string): void {
    this.isValidating.set(true);
    const result = this.importService.validateSlug(slug, this.data?.username);
    this.validationResult.set({
      available: result.available,
      error: result.error,
    });
    if (!result.available) {
      this.slugTaken.set(true);
    } else if (this.slugTaken()) {
      this.slugTaken.set(false);
    }
    this.isValidating.set(false);
  }

  canImport(): boolean {
    return (
      this.form.slug().valid() &&
      !this.isValidating() &&
      (this.validationResult()?.available ?? false)
    );
  }

  async onStartImport(): Promise<void> {
    const file = this.archiveFile();
    if (!this.canImport() || !file) return;
    this.step.set('importing');
    this.importProgress.set(0);
    this.importStatus.set('Starting import...');
    this.importError.set(null);
    try {
      await this.importService.importProject(file, {
        slug: this.model().slug,
        username: this.data?.username,
      });
      this.importedSlug.set(this.model().slug);
      this.step.set('complete');
    } catch (error) {
      this.importError.set(
        error instanceof Error ? error.message : 'Import failed'
      );
      this.step.set('complete');
    }
  }

  onBack(): void {
    if (this.step() === 'configure') {
      this.step.set('file-select');
      this.archivePreview.set(null);
      this.archiveFile.set(null);
      this.parseError.set(null);
    } else if (this.step() === 'complete' && this.importError()) {
      this.step.set('configure');
      this.importError.set(null);
    }
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }

  onClose(): void {
    this.dialogRef.close({
      success: !this.importError(),
      slug: this.importedSlug() ?? undefined,
      error: this.importError() ?? undefined,
    });
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }
}
