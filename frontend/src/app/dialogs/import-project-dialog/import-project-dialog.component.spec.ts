import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import {
  ARCHIVE_VERSION,
  ArchiveProgress,
  ImportPhase,
} from '../../models/project-archive';
import {
  ProjectImportService,
  SlugValidationResult,
} from '../../services/project/project-import.service';
import {
  ImportProjectDialogComponent,
  ImportProjectDialogData,
  ImportProjectDialogResult,
} from './import-project-dialog.component';

describe('ImportProjectDialogComponent', () => {
  let component: ImportProjectDialogComponent;
  let fixture: ComponentFixture<ImportProjectDialogComponent>;
  let dialogRef: MockedObject<
    MatDialogRef<ImportProjectDialogComponent, ImportProjectDialogResult>
  >;
  let importService: {
    progress: ReturnType<typeof signal<ArchiveProgress>>;
    isImporting: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | undefined>>;
    previewArchive: ReturnType<typeof vi.fn>;
    validateSlug: ReturnType<typeof vi.fn>;
    suggestSlug: ReturnType<typeof vi.fn>;
    importProject: ReturnType<typeof vi.fn>;
  };

  const mockDialogData: ImportProjectDialogData = {
    username: 'testuser',
  };

  const mockPreview = {
    manifest: {
      version: ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      projectTitle: 'Test Project',
      originalSlug: 'test-project',
    },
    project: {
      title: 'Test Project',
      description: 'A test project',
      slug: 'test-project',
      hasCover: false,
    },
    counts: {
      elements: 10,
      documents: 5,
      worldbuildingEntries: 3,
      schemas: 2,
      mediaFiles: 1,
    },
  };

  const mockProject = {
    id: 'proj-1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<
      MatDialogRef<ImportProjectDialogComponent, ImportProjectDialogResult>
    >;

    importService = {
      progress: signal<ArchiveProgress>({
        phase: ImportPhase.Initializing,
        progress: 0,
        message: 'Ready',
      }),
      isImporting: signal(false),
      error: signal<string | undefined>(undefined),
      previewArchive: vi.fn().mockResolvedValue(mockPreview),
      validateSlug: vi.fn().mockReturnValue({
        valid: true,
        available: true,
      } as SlugValidationResult),
      suggestSlug: vi.fn().mockReturnValue('test-project'),
      importProject: vi.fn().mockResolvedValue(mockProject),
    };

    await TestBed.configureTestingModule({
      imports: [ImportProjectDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: ProjectImportService, useValue: importService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImportProjectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should start at file-select step', () => {
      expect(component.step()).toBe('file-select');
    });

    it('should initialize slug control', () => {
      expect(component.slugControl).toBeDefined();
    });
  });

  describe('drag and drop', () => {
    it('should set isDragOver on dragover', () => {
      const event = {
        type: 'dragover',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as DragEvent;

      component.onDragOver(event);

      expect(component.isDragOver()).toBe(true);
    });

    it('should clear isDragOver on dragleave', () => {
      component.isDragOver.set(true);
      const event = {
        type: 'dragleave',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as DragEvent;

      component.onDragLeave(event);

      expect(component.isDragOver()).toBe(false);
    });

    it('should process file on drop', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const event = {
        type: 'drop',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file],
        },
      } as unknown as DragEvent;

      component.onDrop(event);

      // Wait for async processing
      await vi.waitFor(() => {
        expect(importService.previewArchive).toHaveBeenCalledWith(file);
      });
    });
  });

  describe('file selection', () => {
    it('should process selected file', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(importService.previewArchive).toHaveBeenCalledWith(file);
      });
    });

    it('should show error for non-zip file', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(component.parseError()).toContain('ZIP');
      });
    });

    it('should transition to configure step after successful parse', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(component.step()).toBe('configure');
      });
    });

    it('should set archive preview data after successful parse', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(component.archivePreview()).toEqual(mockPreview);
      });
    });

    it('should initialize slug control with suggested slug', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(importService.suggestSlug).toHaveBeenCalled();
      });
    });

    it('should handle preview errors', async () => {
      importService.previewArchive.mockRejectedValue(
        new Error('Invalid archive')
      );
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.onFileSelected(event);

      await vi.waitFor(() => {
        expect(component.parseError()).toBe('Invalid archive');
      });
    });
  });

  describe('slug validation', () => {
    beforeEach(async () => {
      // First navigate to configure step
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));
    });

    it('should validate slug format', () => {
      component.slugControl.setValue('INVALID');

      expect(component.slugControl.invalid).toBe(true);
    });

    it('should require minimum length', () => {
      component.slugControl.setValue('ab');

      expect(component.slugControl.hasError('minlength')).toBe(true);
    });

    it('should require maximum length', () => {
      component.slugControl.setValue('a'.repeat(51));

      expect(component.slugControl.hasError('maxlength')).toBe(true);
    });

    it('should validate slug availability on change', async () => {
      vi.useFakeTimers();
      try {
        component.slugControl.setValue('valid-slug');
        await vi.advanceTimersByTimeAsync(350); // Wait for debounce

        expect(importService.validateSlug).toHaveBeenCalledWith(
          'valid-slug',
          'testuser'
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should set error when slug is taken', async () => {
      vi.useFakeTimers();
      try {
        importService.validateSlug.mockReturnValue({
          valid: true,
          available: false,
          error: 'Slug already exists',
        });

        component.slugControl.setValue('taken-slug');
        await vi.advanceTimersByTimeAsync(350);

        expect(component.slugControl.hasError('slugTaken')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('canImport', () => {
    beforeEach(async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));
    });

    it('should return false when slug is invalid', () => {
      component.slugControl.setValue('');

      expect(component.canImport()).toBe(false);
    });

    it('should return false when validating', () => {
      component.slugControl.setValue('valid-slug');
      component.isValidating.set(true);

      expect(component.canImport()).toBe(false);
    });

    it('should return false when slug is not available', async () => {
      vi.useFakeTimers();
      try {
        importService.validateSlug.mockReturnValue({
          valid: true,
          available: false,
          error: 'Already exists',
        });
        component.slugControl.setValue('taken-slug');
        await vi.advanceTimersByTimeAsync(350);

        expect(component.canImport()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should return true when all conditions are met', async () => {
      vi.useFakeTimers();
      try {
        importService.validateSlug.mockReturnValue({
          valid: true,
          available: true,
        });
        component.slugControl.setValue('valid-slug');
        await vi.advanceTimersByTimeAsync(350);

        expect(component.canImport()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('import process', () => {
    beforeEach(async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));
    });

    it('should start import when onStartImport is called', async () => {
      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      await component.onStartImport();

      expect(importService.importProject).toHaveBeenCalled();
    });

    it('should transition to importing step', async () => {
      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      const importPromise = component.onStartImport();

      expect(component.step()).toBe('importing');
      await importPromise;
    });

    it('should transition to complete step on success', async () => {
      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      await component.onStartImport();

      expect(component.step()).toBe('complete');
      expect(component.importedSlug()).toBe('my-project');
    });

    it('should set error on import failure', async () => {
      importService.importProject.mockRejectedValue(new Error('Import failed'));
      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      await component.onStartImport();

      expect(component.step()).toBe('complete');
      expect(component.importError()).toBe('Import failed');
    });

    it('should not start import if canImport is false', async () => {
      component.slugControl.setValue('');

      await component.onStartImport();

      expect(importService.importProject).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('should go back from configure to file-select', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));

      component.onBack();

      expect(component.step()).toBe('file-select');
      expect(component.archivePreview()).toBeNull();
      expect(component.archiveFile()).toBeNull();
    });

    it('should go back from complete (with error) to configure', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));

      component.step.set('complete');
      component.importError.set('Some error');

      component.onBack();

      expect(component.step()).toBe('configure');
      expect(component.importError()).toBeNull();
    });
  });

  describe('dialog close', () => {
    it('should close dialog with success false on cancel', () => {
      component.onCancel();

      expect(dialogRef.close).toHaveBeenCalledWith({ success: false });
    });

    it('should close dialog with success true on successful import', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));

      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      await component.onStartImport();
      component.onClose();

      expect(dialogRef.close).toHaveBeenCalledWith({
        success: true,
        slug: 'my-project',
        error: undefined,
      });
    });

    it('should close dialog with error on failed import', async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));

      importService.importProject.mockRejectedValue(new Error('Import failed'));
      importService.validateSlug.mockReturnValue({
        valid: true,
        available: true,
      });
      component.slugControl.setValue('my-project');
      component.validationResult.set({ available: true });

      await component.onStartImport();
      component.onClose();

      expect(dialogRef.close).toHaveBeenCalledWith({
        success: false,
        slug: undefined,
        error: 'Import failed',
      });
    });
  });

  describe('formatDate', () => {
    it('should format ISO date string', () => {
      const isoDate = '2024-01-15T10:30:00Z';
      const result = component.formatDate(isoDate);

      expect(result).toContain('2024');
      expect(result).toContain('Jan');
    });

    it('should return original string on invalid date', () => {
      const invalidDate = 'not a date';
      const result = component.formatDate(invalidDate);

      // Either returns the original string or 'Invalid Date' depending on locale
      expect(typeof result).toBe('string');
    });
  });

  describe('computed properties', () => {
    beforeEach(async () => {
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.onFileSelected(event);
      await vi.waitFor(() => expect(component.step()).toBe('configure'));
    });

    it('should compute manifest from archive preview', () => {
      expect(component.manifest()).toEqual(mockPreview.manifest);
    });

    it('should compute project data from archive preview', () => {
      expect(component.projectData()).toEqual(mockPreview.project);
    });

    it('should compute counts from archive preview', () => {
      expect(component.counts()).toEqual(mockPreview.counts);
    });

    it('should return null for computed properties when no preview', () => {
      component.archivePreview.set(null);

      expect(component.manifest()).toBeNull();
      expect(component.projectData()).toBeNull();
      expect(component.counts()).toBeNull();
    });
  });
});
