import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileUploadComponent } from './file-upload.component';

describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FileUploadComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have no selected file initially', () => {
    expect(component.selectedFile).toBeNull();
  });

  describe('drag and drop', () => {
    it('should prevent default on dragover', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as DragEvent;

      component.onDragOver(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should select file on drop', () => {
      const mockFile = new File(['content'], 'test.txt', {
        type: 'text/plain',
      });
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [mockFile],
        },
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.selectedFile).toBe(mockFile);
    });

    it('should handle drop with no files', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [] as unknown as FileList,
        },
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(component.selectedFile).toBeNull();
    });

    it('should handle drop with null dataTransfer', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: null,
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(component.selectedFile).toBeNull();
    });
  });

  describe('file selection', () => {
    it('should select file from input', () => {
      const mockFile = new File(['content'], 'test.txt', {
        type: 'text/plain',
      });
      const event = {
        target: {
          files: [mockFile],
        },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.selectedFile).toBe(mockFile);
    });

    it('should handle empty file input', () => {
      const event = {
        target: {
          files: [] as unknown as FileList,
        },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.selectedFile).toBeNull();
    });

    it('should handle null files', () => {
      const event = {
        target: {
          files: null,
        },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.selectedFile).toBeNull();
    });
  });

  describe('upload', () => {
    it('should close dialog with file when uploading', () => {
      const mockFile = new File(['content'], 'test.txt', {
        type: 'text/plain',
      });
      component.selectedFile = mockFile;

      component.onUpload();

      expect(dialogRef.close).toHaveBeenCalledWith(mockFile);
    });

    it('should not close dialog when no file selected', () => {
      component.selectedFile = null;

      component.onUpload();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('template rendering', () => {
    it('should show upload prompt when no file selected', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.upload-prompt')).toBeTruthy();
      expect(compiled.querySelector('.file-info')).toBeFalsy();
    });

    it('should disable upload button when no file selected', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const uploadButton = compiled.querySelector(
        'button[color="primary"]'
      ) as HTMLButtonElement;
      expect(uploadButton.disabled).toBe(true);
    });
  });
});
