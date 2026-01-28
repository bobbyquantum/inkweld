import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { SystemConfigService } from '../../services/core/system-config.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import {
  InsertImageDialogComponent,
  InsertImageDialogData,
} from './insert-image-dialog.component';

describe('InsertImageDialogComponent', () => {
  let component: InsertImageDialogComponent;
  let fixture: ComponentFixture<InsertImageDialogComponent>;
  let dialogRefMock: { close: Mock };
  let snackBarMock: { open: Mock };
  let dialogGatewayMock: {
    openMediaSelectorDialog: Mock;
    openImageGenerationDialog: Mock;
  };
  let systemConfigMock: { getAiImageGenerationStatus: Mock };
  let projectStateMock: { getSyncState: Mock };

  const mockDialogData: InsertImageDialogData = {
    username: 'testuser',
    slug: 'test-project',
    description: 'Test description',
  };

  beforeEach(async () => {
    dialogRefMock = { close: vi.fn() };
    snackBarMock = { open: vi.fn() };
    dialogGatewayMock = {
      openMediaSelectorDialog: vi.fn(),
      openImageGenerationDialog: vi.fn(),
    };
    systemConfigMock = {
      getAiImageGenerationStatus: vi.fn().mockReturnValue({ available: true }),
    };
    projectStateMock = {
      getSyncState: vi.fn().mockReturnValue('synced'),
    };

    await TestBed.configureTestingModule({
      imports: [InsertImageDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: SystemConfigService, useValue: systemConfigMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InsertImageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with dialog data', () => {
      expect(component.username).toBe('testuser');
      expect(component.slug).toBe('test-project');
      expect(component.description).toBe('Test description');
    });

    it('should initialize with empty description if not provided', async () => {
      const dataWithoutDescription: InsertImageDialogData = {
        username: 'testuser',
        slug: 'test-project',
      };

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [InsertImageDialogComponent, NoopAnimationsModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRefMock },
          { provide: MAT_DIALOG_DATA, useValue: dataWithoutDescription },
          { provide: MatSnackBar, useValue: snackBarMock },
          { provide: DialogGatewayService, useValue: dialogGatewayMock },
          { provide: SystemConfigService, useValue: systemConfigMock },
          { provide: ProjectStateService, useValue: projectStateMock },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(InsertImageDialogComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.description).toBe('');
    });
  });

  describe('cancel', () => {
    it('should close dialog without result', () => {
      component.cancel();
      expect(dialogRefMock.close).toHaveBeenCalledWith();
    });
  });

  describe('cancelCropping', () => {
    it('should hide cropper and reset state', () => {
      component.showCropper = true;
      component.croppedBlob = new Blob(['test']);
      component.pendingFileName = 'test.png';

      component.cancelCropping();

      expect(component.showCropper).toBe(false);
      expect(component.croppedBlob).toBeNull();
      expect(component.pendingFileName).toBe('');
    });
  });

  describe('resetCropperState', () => {
    it('should reset all cropper state', () => {
      component.imageChangedEvent = {} as Event;
      component.imageBase64 = 'base64data';
      component.croppedImage = 'cropped';
      component.croppedBlob = new Blob(['test']);
      component.hasImageLoaded = true;
      component.isCropperReady = true;
      component.hasLoadFailed = true;
      component.pendingFileName = 'test.png';

      component.resetCropperState();

      expect(component.imageChangedEvent).toBeNull();
      expect(component.imageBase64).toBeUndefined();
      expect(component.croppedImage).toBeNull();
      expect(component.croppedBlob).toBeNull();
      expect(component.hasImageLoaded).toBe(false);
      expect(component.isCropperReady).toBe(false);
      expect(component.hasLoadFailed).toBe(false);
      expect(component.pendingFileName).toBe('');
    });
  });

  describe('onCropperReady', () => {
    it('should set isCropperReady to true', () => {
      expect(component.isCropperReady).toBe(false);
      component.onCropperReady();
      expect(component.isCropperReady).toBe(true);
    });
  });

  describe('onImageLoaded', () => {
    it('should set hasImageLoaded to true', () => {
      expect(component.hasImageLoaded).toBe(false);
      component.onImageLoaded({} as unknown as LoadedImage);
      expect(component.hasImageLoaded).toBe(true);
    });
  });

  describe('onLoadImageFailed', () => {
    it('should set hasLoadFailed and show error', () => {
      component.showCropper = true;
      component.onLoadImageFailed();
      expect(component.hasLoadFailed).toBe(true);
      expect(component.showCropper).toBe(false);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Failed to load image. Please try another file.',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('applyCroppedImage', () => {
    it('should close dialog with result when croppedBlob exists', () => {
      const testBlob = new Blob(['test'], { type: 'image/png' });
      component.croppedBlob = testBlob;

      component.applyCroppedImage();

      expect(dialogRefMock.close).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaId: expect.stringMatching(/^img-/),
          imageBlob: testBlob,
        })
      );
    });

    it('should not close dialog when croppedBlob is null', () => {
      component.croppedBlob = null;
      component.applyCroppedImage();
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });
  });

  describe('aiGenerationStatus', () => {
    it('should return AI generation status from system config', () => {
      systemConfigMock.getAiImageGenerationStatus.mockReturnValue({
        available: true,
      });
      expect(component.aiGenerationStatus()).toEqual({ available: true });
    });
  });

  describe('onFileSelected', () => {
    it('should handle valid image file', () => {
      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const event = {
        target: { files: [file] },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('test.png');
      expect(component.imageChangedEvent).toBe(event);
    });

    it('should reject invalid file type', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const event = {
        target: { files: [file] },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Invalid image file. Please select a JPEG or PNG file.',
        'Close',
        { duration: 5000 }
      );
    });

    it('should handle empty files array', () => {
      const event = {
        target: { files: [] },
      } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
    });
  });

  describe('openMediaLibrary', () => {
    it('should do nothing when dialog returns no result', async () => {
      dialogGatewayMock.openMediaSelectorDialog.mockResolvedValue(undefined);

      await component.openMediaLibrary();

      expect(component.showCropper).toBe(false);
    });
  });

  describe('openGenerateDialog', () => {
    it('should do nothing when dialog is cancelled', async () => {
      dialogGatewayMock.openImageGenerationDialog.mockResolvedValue(undefined);

      await component.openGenerateDialog();

      expect(component.showCropper).toBe(false);
    });

    it('should do nothing when result is not saved', async () => {
      dialogGatewayMock.openImageGenerationDialog.mockResolvedValue({
        saved: false,
      });

      await component.openGenerateDialog();

      expect(component.showCropper).toBe(false);
    });
  });

  describe('imageCropped', () => {
    it('should set cropped image when event has blob', () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      const event = {
        objectUrl: 'blob:test',
        blob,
      } as unknown as ImageCroppedEvent;

      component.imageCropped(event);

      expect(component.croppedBlob).toBe(blob);
      expect(component.croppedImage).toBeTruthy();
    });

    it('should not set cropped image when event has no blob', () => {
      const event = {} as unknown as ImageCroppedEvent;

      component.imageCropped(event);

      expect(component.croppedBlob).toBeNull();
    });
  });
});
