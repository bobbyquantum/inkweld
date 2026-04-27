import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { type ImageCroppedEvent, type LoadedImage } from 'ngx-image-cropper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogGatewayService } from '../services/core/dialog-gateway.service';
import { SystemConfigService } from '../services/core/system-config.service';
import { ProjectStateService } from '../services/project/project-state.service';
import { BaseImageDialogComponent } from './base-image-dialog';

@Component({
  standalone: true,
  template: `
    <input
      #fileInput
      type="file"
      (change)="onFileSelected($event)"
      style="display:none" />
  `,
})
class TestImageDialogHost extends BaseImageDialogComponent {
  readonly aspectRatio = 1;

  async openGenerateDialog(): Promise<void> {
    // noop for tests
  }

  applyCroppedImage(): void {
    // noop for tests
  }

  /** Public wrapper for protected method */
  override async extractImageBlob(imageData: string): Promise<Blob> {
    return super.extractImageBlob(imageData);
  }

  /** Public wrapper for protected method */
  override blobToBase64(blob: Blob): Promise<string> {
    return super.blobToBase64(blob);
  }

  /** Public wrapper for protected method */
  override showError(message: string): void {
    super.showError(message);
  }
}

describe('BaseImageDialogComponent', () => {
  let component: TestImageDialogHost;
  let fixture: ComponentFixture<TestImageDialogHost>;
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };
  let snackBarMock: { open: ReturnType<typeof vi.fn> };
  let dialogGatewayMock: {
    openMediaSelectorDialog: ReturnType<typeof vi.fn>;
  };
  let sanitizerMock: {
    bypassSecurityTrustUrl: ReturnType<typeof vi.fn>;
  };
  let systemConfigMock: {
    getAiImageGenerationStatus: ReturnType<typeof vi.fn>;
  };
  let projectStateMock: {
    getSyncState: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    dialogRefMock = { close: vi.fn() };
    snackBarMock = { open: vi.fn() };
    dialogGatewayMock = {
      openMediaSelectorDialog: vi.fn(),
    };
    sanitizerMock = {
      bypassSecurityTrustUrl: vi.fn(url => url as unknown as SafeUrl),
    };
    systemConfigMock = {
      getAiImageGenerationStatus: vi.fn().mockReturnValue({ available: true }),
    };
    projectStateMock = {
      getSyncState: vi.fn().mockReturnValue('synced'),
    };

    await TestBed.configureTestingModule({
      imports: [TestImageDialogHost, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: DomSanitizer, useValue: sanitizerMock },
        { provide: SystemConfigService, useValue: systemConfigMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestImageDialogHost);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('file selection', () => {
    it('should accept valid PNG file', () => {
      const file = new File(['test'], 'image.png', { type: 'image/png' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('image.png');
      expect(component.imageChangedEvent).toBe(event);
    });

    it('should accept valid JPEG file', () => {
      const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('photo.jpg');
    });

    it('should accept valid JPG file', () => {
      const file = new File(['test'], 'photo.jpg', { type: 'image/jpg' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(true);
    });

    it('should reject invalid file type', () => {
      const file = new File(['test'], 'document.txt', {
        type: 'text/plain',
      });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Invalid image file. Please select a JPEG or PNG file.',
        'Close',
        { duration: 5000 }
      );
    });

    it('should reject SVG file type', () => {
      const file = new File(['test'], 'icon.svg', { type: 'image/svg+xml' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
      expect(snackBarMock.open).toHaveBeenCalled();
    });

    it('should select a new file after a previous selection resets state', () => {
      component.imageChangedEvent = {} as Event;
      component.pendingFileName = 'old.png';
      component.showCropper = true;
      component.hasImageLoaded = true;

      const file = new File(['test'], 'new.png', { type: 'image/png' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.pendingFileName).toBe('new.png');
      expect(component.hasImageLoaded).toBe(false);
      expect(component.isCropperReady).toBe(false);
    });

    it('should handle empty files array', () => {
      const event = { target: { files: [] } } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
    });

    it('should handle null files', () => {
      const event = { target: {} } as unknown as Event;

      component.onFileSelected(event);

      expect(component.showCropper).toBe(false);
    });
  });

  describe('cropper state lifecycle', () => {
    it('should start with default cropper state', () => {
      expect(component.imageChangedEvent).toBeNull();
      expect(component.imageBase64).toBeUndefined();
      expect(component.croppedImage).toBeNull();
      expect(component.croppedBlob).toBeNull();
      expect(component.isCropperReady).toBe(false);
      expect(component.hasImageLoaded).toBe(false);
      expect(component.hasLoadFailed).toBe(false);
      expect(component.showCropper).toBe(false);
      expect(component.pendingFileName).toBe('');
    });

    it('onCropperReady should set isCropperReady to true', () => {
      expect(component.isCropperReady).toBe(false);
      component.onCropperReady();
      expect(component.isCropperReady).toBe(true);
    });

    it('onImageLoaded should set hasImageLoaded to true', () => {
      expect(component.hasImageLoaded).toBe(false);
      component.onImageLoaded({} as LoadedImage);
      expect(component.hasImageLoaded).toBe(true);
    });

    it('onLoadImageFailed should set hasLoadFailed, hide cropper, show error', () => {
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

    it('resetCropperState should reset all cropper state', () => {
      component.imageChangedEvent = {} as Event;
      component.imageBase64 = 'base64data';
      component.croppedImage = 'safe-url';
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

  describe('imageCropped', () => {
    it('should set cropped image and blob when event has objectUrl and blob', () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      const event = {
        objectUrl: 'blob:test-url',
        blob,
      } as unknown as ImageCroppedEvent;

      component.imageCropped(event);

      expect(component.croppedBlob).toBe(blob);
      expect(sanitizerMock.bypassSecurityTrustUrl).toHaveBeenCalledWith(
        'blob:test-url'
      );
    });

    it('should not set cropped image when event has no blob', () => {
      const event = {} as ImageCroppedEvent;

      component.imageCropped(event);

      expect(component.croppedBlob).toBeNull();
      expect(component.croppedImage).toBeNull();
    });
  });

  describe('extractImageBlob', () => {
    it('should handle data URLs via base64ToBlob', async () => {
      const dataUrl = `data:image/png;base64,${btoa('test-data')}`;
      const blob = await component.extractImageBlob(dataUrl);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('should handle raw base64 strings', async () => {
      const raw = btoa('raw-data');
      const blob = await component.extractImageBlob(raw);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('should fetch from HTTP URLs', async () => {
      const mockBlob = new Blob(['fake-image'], { type: 'image/jpeg' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      } as Response);

      const blob = await component.extractImageBlob(
        'http://example.com/image.jpg'
      );

      expect(fetchSpy).toHaveBeenCalledWith('http://example.com/image.jpg');
      expect(blob).toBe(mockBlob);

      fetchSpy.mockRestore();
    });

    it('should fetch from HTTPS URLs', async () => {
      const mockBlob = new Blob(['fake-image'], { type: 'image/png' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      } as Response);

      const blob = await component.extractImageBlob(
        'https://example.com/image.png'
      );

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/image.png');
      expect(blob).toBe(mockBlob);

      fetchSpy.mockRestore();
    });
  });

  describe('blobToBase64', () => {
    it('should convert a blob to base64 data URL', async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const result = await component.blobToBase64(blob);
      expect(result).toContain('data:text/plain;base64,');
    });

    it('should produce valid base64 that decodes to original content', async () => {
      const original = 'test content for blob';
      const blob = new Blob([original], { type: 'text/plain' });
      const dataUrl = await component.blobToBase64(blob);
      const base64Part = dataUrl.split(',')[1];
      expect(atob(base64Part)).toBe(original);
    });

    it('should handle empty blob', async () => {
      const blob = new Blob([], { type: 'application/octet-stream' });
      const result = await component.blobToBase64(blob);
      expect(result).toContain('base64,');
    });
  });

  describe('cancel', () => {
    it('should close the dialog with no result', () => {
      component.cancel();
      expect(dialogRefMock.close).toHaveBeenCalledWith();
    });
  });

  describe('cancelCropping', () => {
    it('should hide cropper and reset state', () => {
      component.showCropper = true;
      component.croppedBlob = new Blob(['test']);
      component.pendingFileName = 'test.png';
      component.hasImageLoaded = true;
      component.fileInput = {
        nativeElement: { value: 'selected-file' },
      } as unknown as any;

      component.cancelCropping();

      expect(component.showCropper).toBe(false);
      expect(component.croppedBlob).toBeNull();
      expect(component.pendingFileName).toBe('');
      expect(component.hasImageLoaded).toBe(false);
      expect(component.fileInput.nativeElement.value).toBe('');
    });
  });

  describe('openMediaLibrary', () => {
    it('should do nothing when dialog returns no result', async () => {
      dialogGatewayMock.openMediaSelectorDialog.mockResolvedValue(undefined);

      await component.openMediaLibrary();

      expect(component.showCropper).toBe(false);
    });

    it('should set image from media library result', async () => {
      const blob = new Blob(['image-data'], { type: 'image/png' });
      dialogGatewayMock.openMediaSelectorDialog.mockResolvedValue({
        blob,
        selected: { filename: 'library-image.png' },
      });

      await component.openMediaLibrary();

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('library-image.png');
      expect(component.imageBase64).toContain('base64,');
    });
  });

  describe('showError', () => {
    it('should open snackbar with error message', () => {
      component.showError('Test error message');
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Test error message',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('openFileSelector', () => {
    it('should trigger click on file input', () => {
      const clickSpy = vi.fn();
      component.fileInput = {
        nativeElement: { click: clickSpy },
      } as unknown as any;

      component.openFileSelector();

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('aiGenerationStatus', () => {
    it('should return AI generation status from system config', () => {
      systemConfigMock.getAiImageGenerationStatus.mockReturnValue({
        available: true,
        provider: 'openai',
      });

      const status = component.aiGenerationStatus();

      expect(status).toEqual({ available: true, provider: 'openai' });
    });
  });
});
