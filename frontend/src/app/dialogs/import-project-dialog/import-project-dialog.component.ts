import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';

import { ArchiveManifest, ArchiveProject } from '../../models/project-archive';
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

@Component({
  selector: 'app-import-project-dialog',
  templateUrl: './import-project-dialog.component.html',
  styleUrl: './import-project-dialog.component.scss',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
    ReactiveFormsModule,
  ],
})
export class ImportProjectDialogComponent implements OnInit, OnDestroy {
  protected readonly data = inject<ImportProjectDialogData | null>(
    MAT_DIALOG_DATA,
    { optional: true }
  );
  private readonly dialogRef = inject(
    MatDialogRef<ImportProjectDialogComponent, ImportProjectDialogResult>
  );
  private readonly importService = inject(ProjectImportService);
  private readonly destroy$ = new Subject<void>();

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

  slugControl!: FormControl<string>;

  constructor() {
    // Track import progress from the service
    effect(() => {
      const progress = this.importService.progress();
      this.importProgress.set(progress.progress);
      this.importStatus.set(progress.message);
    });
  }

  ngOnInit(): void {
    this.initSlugControl('');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initSlugControl(initialValue: string): void {
    const slugValidator: ValidatorFn = control => {
      const value = control.value as string;
      if (!value) return null;
      const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      return pattern.test(value) ? null : { pattern: true };
    };

    this.slugControl = new FormControl(initialValue, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50),
        slugValidator,
      ],
    });

    this.slugControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(slug => {
        if (this.slugControl.valid) {
          this.validateSlugAvailability(slug);
        } else {
          this.validationResult.set(null);
        }
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
      this.initSlugControl(suggestedSlug);
      this.step.set('configure');
      if (this.slugControl.valid) {
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
      this.slugControl.setErrors({ slugTaken: true });
    } else if (this.slugControl.errors?.['slugTaken']) {
      const errors = { ...this.slugControl.errors };
      delete errors['slugTaken'];
      this.slugControl.setErrors(
        Object.keys(errors).length > 0 ? errors : null
      );
    }
    this.isValidating.set(false);
  }

  canImport(): boolean {
    return (
      this.slugControl.valid &&
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
        slug: this.slugControl.value,
        username: this.data?.username,
      });
      this.importedSlug.set(this.slugControl.value);
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
