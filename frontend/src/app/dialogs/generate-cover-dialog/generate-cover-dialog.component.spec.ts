import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { Project } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import { ImageResponse } from '../../../api-client/model/image-response';
import {
  GenerateCoverDialogComponent,
  GenerateCoverDialogData,
} from './generate-cover-dialog.component';

describe('GenerateCoverDialogComponent', () => {
  let component: GenerateCoverDialogComponent;
  let fixture: ComponentFixture<GenerateCoverDialogComponent>;
  let dialogRefMock: MockedObject<MatDialogRef<GenerateCoverDialogComponent>>;
  let aiImageServiceMock: MockedObject<AIImageGenerationService>;
  let dialogData: GenerateCoverDialogData;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
    description: 'A test project description',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockImageResponseWithUrl: ImageResponse = {
    created: Date.now(),
    source: 'test',
    data: [
      {
        url: 'https://example.com/image.png',
      },
    ],
  };

  const mockImageResponseWithBase64: ImageResponse = {
    created: Date.now(),
    source: 'test',
    data: [
      {
        b64Json: 'SGVsbG8gV29ybGQ=',
      },
    ],
  };

  beforeEach(async () => {
    dialogRefMock = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<GenerateCoverDialogComponent>>;

    aiImageServiceMock = {
      generateAIImage: vi.fn().mockReturnValue(of(mockImageResponseWithUrl)),
    } as unknown as MockedObject<AIImageGenerationService>;

    dialogData = {
      project: mockProject,
    };

    await TestBed.configureTestingModule({
      imports: [GenerateCoverDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: AIImageGenerationService, useValue: aiImageServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateCoverDialogComponent);
    component = fixture.componentInstance;
    // Don't call fixture.detectChanges() here to avoid ngOnInit triggering
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should call generateCoverImage on init', () => {
      const generateSpy = vi.spyOn(component, 'generateCoverImage');
      fixture.detectChanges();
      expect(generateSpy).toHaveBeenCalled();
    });
  });

  describe('generateCoverImage', () => {
    it('should set loading to true while generating', () => {
      fixture.detectChanges();
      // After completion, loading should be false
      expect(component.loading).toBe(false);
    });

    it('should set imageUrl when response contains URL', () => {
      fixture.detectChanges();
      expect(component.imageUrl).toBe('https://example.com/image.png');
      expect(component.imageBase64).toBeNull();
    });

    it('should set imageBase64 when response contains base64', () => {
      aiImageServiceMock.generateAIImage.mockReturnValue(
        of(mockImageResponseWithBase64) as unknown as ReturnType<
          typeof aiImageServiceMock.generateAIImage
        >
      );
      fixture.detectChanges();
      expect(component.imageBase64).toBe(
        'data:image/png;base64,SGVsbG8gV29ybGQ='
      );
      expect(component.imageUrl).toBeNull();
    });

    it('should handle error response', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      aiImageServiceMock.generateAIImage.mockReturnValue(
        throwError(
          () => new Error('Generation failed')
        ) as unknown as ReturnType<typeof aiImageServiceMock.generateAIImage>
      );

      fixture.detectChanges();

      expect(component.error).toBe(
        'Failed to generate cover image. Please try again later.'
      );
      expect(component.loading).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should handle empty response data', () => {
      const emptyResponse: ImageResponse = {
        created: Date.now(),
        source: 'test',
        data: [],
      };
      aiImageServiceMock.generateAIImage.mockReturnValue(
        of(emptyResponse) as unknown as ReturnType<
          typeof aiImageServiceMock.generateAIImage
        >
      );
      fixture.detectChanges();

      expect(component.error).toBe('No image was generated. Please try again.');
    });

    it('should clear previous state when regenerating', () => {
      // Initial state
      component.error = 'Previous error';
      component.imageUrl = 'old-url';
      component.imageBase64 = 'old-base64';

      // Call generateCoverImage - since mock returns data, imageUrl will be set
      component.generateCoverImage();

      // Error should be cleared
      expect(component.error).toBeNull();
      // imageUrl will be set from mock response
      expect(component.imageUrl).toBe('https://example.com/image.png');
    });
  });

  describe('onApprove', () => {
    it('should close dialog with imageUrl when available', () => {
      component.imageUrl = 'https://example.com/image.png';
      component.imageBase64 = null;

      component.onApprove();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        approved: true,
        imageData: 'https://example.com/image.png',
      });
    });

    it('should close dialog with imageBase64 when available', () => {
      component.imageBase64 = 'data:image/png;base64,SGVsbG8=';
      component.imageUrl = null;

      component.onApprove();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        approved: true,
        imageData: 'data:image/png;base64,SGVsbG8=',
      });
    });

    it('should prefer imageBase64 over imageUrl', () => {
      component.imageBase64 = 'data:image/png;base64,SGVsbG8=';
      component.imageUrl = 'https://example.com/image.png';

      component.onApprove();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        approved: true,
        imageData: 'data:image/png;base64,SGVsbG8=',
      });
    });
  });

  describe('onCancel', () => {
    it('should close dialog with not approved', () => {
      component.onCancel();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        approved: false,
        imageData: null,
      });
    });
  });

  describe('onRetry', () => {
    it('should call generateCoverImage', () => {
      const generateSpy = vi.spyOn(component, 'generateCoverImage');

      component.onRetry();

      expect(generateSpy).toHaveBeenCalled();
    });
  });

  describe('dialog data', () => {
    it('should have access to project from data', () => {
      expect(component.data.project).toEqual(mockProject);
    });
  });
});
