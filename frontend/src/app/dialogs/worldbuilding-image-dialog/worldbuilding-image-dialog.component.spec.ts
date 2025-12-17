import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { vi } from 'vitest';

import {
  WorldbuildingImageDialogComponent,
  WorldbuildingImageDialogData,
} from './worldbuilding-image-dialog.component';

describe('WorldbuildingImageDialogComponent', () => {
  let component: WorldbuildingImageDialogComponent;
  let fixture: ComponentFixture<WorldbuildingImageDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockDialogGateway: {
    openMediaSelectorDialog: ReturnType<typeof vi.fn>;
    openImageGenerationDialog: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  const defaultDialogData: WorldbuildingImageDialogData = {
    elementName: 'Test Character',
    username: 'testuser',
    slug: 'test-project',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockDialogGateway = {
      openMediaSelectorDialog: vi.fn(),
      openImageGenerationDialog: vi.fn(),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WorldbuildingImageDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: defaultDialogData },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingImageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with dialog data', () => {
    expect(component.elementName).toBe('Test Character');
    expect(component.username).toBe('testuser');
    expect(component.slug).toBe('test-project');
  });

  it('should show current image if provided', async () => {
    // Recreate with current image
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorldbuildingImageDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            ...defaultDialogData,
            currentImage: 'data:image/png;base64,test',
          },
        },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingImageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.hasCurrentImage).toBe(true);
    expect(component.currentImageUrl).toBeTruthy();
  });

  describe('file selection', () => {
    it('should open file selector when openFileSelector is called', () => {
      const mockFileInput = { click: vi.fn() } as unknown as HTMLInputElement;
      component.fileInput = { nativeElement: mockFileInput } as any;

      component.openFileSelector();

      expect(mockFileInput.click).toHaveBeenCalled();
    });

    it('should show cropper when valid image file is selected', () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
      const mockEvent = {
        target: {
          files: [mockFile],
        },
      } as unknown as Event;

      component.onFileSelected(mockEvent);

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('test.png');
    });

    it('should show error for invalid file type', () => {
      const mockFile = new File(['test'], 'test.gif', { type: 'image/gif' });
      const mockEvent = {
        target: {
          files: [mockFile],
        },
      } as unknown as Event;

      component.onFileSelected(mockEvent);

      expect(component.showCropper).toBe(false);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Invalid image file. Please select a JPEG or PNG file.',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('media library', () => {
    it('should open media library dialog', async () => {
      mockDialogGateway.openMediaSelectorDialog.mockResolvedValue(undefined);

      await component.openMediaLibrary();

      expect(mockDialogGateway.openMediaSelectorDialog).toHaveBeenCalledWith({
        username: 'testuser',
        slug: 'test-project',
        filterType: 'image',
        title: 'Select Image',
      });
    });

    it('should show cropper when media library returns image', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      mockDialogGateway.openMediaSelectorDialog.mockResolvedValue({
        blob: mockBlob,
        selected: { filename: 'selected.png' },
      });

      await component.openMediaLibrary();

      expect(component.showCropper).toBe(true);
      expect(component.pendingFileName).toBe('selected.png');
    });
  });

  describe('AI generation', () => {
    it('should open AI generation dialog with prompt from element name', async () => {
      mockDialogGateway.openImageGenerationDialog.mockResolvedValue(undefined);

      await component.openGenerateDialog();

      expect(mockDialogGateway.openImageGenerationDialog).toHaveBeenCalledWith({
        forCover: false,
        prompt: 'Test Character', // Built from elementName
      });
    });

    it('should build prompt from name, description, and fields', async () => {
      mockDialogGateway.openImageGenerationDialog.mockResolvedValue(undefined);

      // Set up component with description and fields
      component.description = 'A brave warrior';
      component.worldbuildingFields = {
        occupation: 'Knight',
        age: 35,
        skills: ['Swordsmanship', 'Leadership'],
        emptyField: '',
        nullField: null,
        lastModified: '2023-01-01', // Should be skipped
      };

      await component.openGenerateDialog();

      expect(mockDialogGateway.openImageGenerationDialog).toHaveBeenCalledWith({
        forCover: false,
        prompt:
          'Test Character. A brave warrior. occupation: Knight, age: 35, skills: Swordsmanship, Leadership',
      });
    });

    it('should close dialog with result when AI generates image', async () => {
      // Use valid base64 (a 1x1 transparent PNG)
      const validBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mockDialogGateway.openImageGenerationDialog.mockResolvedValue({
        saved: true,
        imageData: validBase64,
      });

      await component.openGenerateDialog();

      expect(mockDialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          imageData: validBase64,
        })
      );
    });
  });

  describe('cropper', () => {
    it('should reset cropper state on cancel', () => {
      component.showCropper = true;
      component.pendingFileName = 'test.png';
      component.croppedBlob = new Blob(['test']);
      const mockFileInput = { value: 'test' } as HTMLInputElement;
      component.fileInput = { nativeElement: mockFileInput } as any;

      component.cancelCropping();

      expect(component.showCropper).toBe(false);
      expect(component.pendingFileName).toBe('');
      expect(component.croppedBlob).toBeNull();
      expect(mockFileInput.value).toBe('');
    });

    it('should apply cropped image and close dialog', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      component.croppedBlob = mockBlob;
      component.croppedImage = 'object:url';

      component.applyCroppedImage();

      // Wait for async base64 conversion
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          imageBlob: mockBlob,
        })
      );
    });
  });

  describe('remove image', () => {
    it('should close dialog with removed flag', () => {
      component.removeImage();

      expect(mockDialogRef.close).toHaveBeenCalledWith({ removed: true });
    });
  });

  describe('cancel', () => {
    it('should close dialog without result', () => {
      component.cancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith();
    });
  });
});
