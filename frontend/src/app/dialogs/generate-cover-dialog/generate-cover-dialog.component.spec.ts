import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectDto } from '@inkweld/model/project-dto';
import { createComponentFactory, Spectator } from '@ngneat/spectator/jest';
import { of, throwError } from 'rxjs';

import { ImageService } from '../../../api-client/api/image.service';
import { ImageResponseDto } from '../../../api-client/model/image-response-dto';
import {
  GenerateCoverDialogComponent,
  GenerateCoverDialogData,
} from './generate-cover-dialog.component';

// Mock data
const mockProject: ProjectDto = {
  id: '1',
  title: 'Test Project',
  description: 'A test project for unit tests',
  slug: 'test-project',
  username: 'testuser',
} as ProjectDto;

const mockImageResponse: ImageResponseDto = {
  created: Date.now(),
  data: [
    {
      url: 'https://example.com/image.png',
      revised_prompt: 'A beautiful test project cover',
    },
  ],
  source: 'openai',
};

const mockImageResponseBase64: ImageResponseDto = {
  created: Date.now(),
  data: [
    {
      b64_json:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      revised_prompt: 'A beautiful test project cover',
    },
  ],
  source: 'openai',
};

describe('GenerateCoverDialogComponent', () => {
  let spectator: Spectator<GenerateCoverDialogComponent>;
  let component: GenerateCoverDialogComponent;
  let dialogRef: any;
  let imageService: any;

  const createComponent = createComponentFactory({
    component: GenerateCoverDialogComponent,
    imports: [
      CommonModule,
      MatDialogModule,
      MatButtonModule,
      MatProgressSpinnerModule,
      MatIconModule,
    ],
    providers: [
      {
        provide: MatDialogRef,
        useValue: {
          close: jest.fn(),
        },
      },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          project: mockProject,
        } as GenerateCoverDialogData,
      },
      {
        provide: ImageService,
        useValue: {
          imageControllerGenerateImage: jest
            .fn()
            .mockReturnValue(of(mockImageResponse)),
        },
      },
    ],
    detectChanges: false,
  });

  beforeEach(() => {
    spectator = createComponent();
    component = spectator.component;
    dialogRef = spectator.inject(MatDialogRef);
    imageService = spectator.inject(ImageService);

    // Reset spy mocks
    jest.clearAllMocks();

    // Setup default mock implementation
    imageService.imageControllerGenerateImage.mockReturnValue(
      of(mockImageResponse)
    );

    // Prevent ngOnInit from automatically generating an image
    jest.spyOn(component, 'ngOnInit').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create', () => {
    spectator.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should start loading an image on initialization', () => {
      // Create a mock implementation for generateCoverImage
      const generateCoverSpy = jest
        .spyOn(component, 'generateCoverImage')
        .mockImplementation(() => {
          component.loading = true;
        });

      // Reset ngOnInit mock to call the real implementation
      (component.ngOnInit as any).mockRestore();

      // Call ngOnInit
      component.ngOnInit();

      // Verify generate cover was called and loading was set
      expect(generateCoverSpy).toHaveBeenCalled();
      expect(component.loading).toBe(true);
    });
  });

  describe('image generation', () => {
    it('should handle successful image generation with URL response', () => {
      // Override the original implementation to test actual logic
      jest.spyOn(component, 'generateCoverImage').mockRestore();

      // Start generation
      component.generateCoverImage();
      spectator.detectChanges();

      // Check results
      expect(component.loading).toBe(false);
      expect(component.error).toBeNull();
      expect(component.imageUrl).toBe(mockImageResponse.data[0].url);
      expect(component.imageBase64).toBeNull();
    });

    it('should handle successful image generation with base64 response', () => {
      // Override the original implementation to test actual logic
      jest.spyOn(component, 'generateCoverImage').mockRestore();

      // Change the mock return value
      imageService.imageControllerGenerateImage.mockReturnValue(
        of(mockImageResponseBase64)
      );

      // Start generation
      component.generateCoverImage();
      spectator.detectChanges();

      // Check results
      expect(component.loading).toBe(false);
      expect(component.error).toBeNull();
      expect(component.imageUrl).toBeNull();
      expect(component.imageBase64).toBe(
        `data:image/png;base64,${mockImageResponseBase64.data[0].b64_json}`
      );
    });

    it('should handle error during image generation', () => {
      // Override the original implementation to test actual logic
      jest.spyOn(component, 'generateCoverImage').mockRestore();

      // Setup mock to throw an error
      const testError = new Error('API Error');
      imageService.imageControllerGenerateImage.mockReturnValue(
        throwError(() => testError)
      );

      // Spy on console.error
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Start generation
      component.generateCoverImage();
      spectator.detectChanges();

      // Check error handling
      expect(component.loading).toBe(false);
      expect(component.error).toBe(
        'Failed to generate cover image. Please try again later.'
      );
      expect(console.error).toHaveBeenCalledWith(
        'Error generating image:',
        testError
      );
    });

    it('should handle empty response', () => {
      // Override the original implementation to test actual logic
      jest.spyOn(component, 'generateCoverImage').mockRestore();

      // Setup mock to return empty response
      const emptyResponse: ImageResponseDto = {
        created: Date.now(),
        data: [],
        source: 'openai',
      };
      imageService.imageControllerGenerateImage.mockReturnValue(
        of(emptyResponse)
      );

      // Start generation
      component.generateCoverImage();
      spectator.detectChanges();

      // Check error handling for empty response
      expect(component.loading).toBe(false);
      expect(component.error).toBe('No image was generated. Please try again.');
    });

    it('should handle null response', () => {
      // Override the original implementation to test actual logic
      jest.spyOn(component, 'generateCoverImage').mockRestore();

      // Setup mock to return null
      imageService.imageControllerGenerateImage.mockReturnValue(of(null));

      // Start generation
      component.generateCoverImage();
      spectator.detectChanges();

      // Check error handling for null response
      expect(component.loading).toBe(false);
      expect(component.error).toBe('No image was generated. Please try again.');
    });
  });

  describe('dialog actions', () => {
    it('should close dialog with true when approving', () => {
      component.onApprove();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should close dialog with false when cancelling', () => {
      component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith(false);
    });

    it('should retry image generation', () => {
      // Create a new spy to track the method call
      const generateSpy = jest
        .spyOn(component, 'generateCoverImage')
        .mockImplementation(() => {
          // Set the property directly to simulate real behavior
          component.loading = true;
        });

      // Call onRetry
      component.onRetry();

      // Verify the method was called
      expect(generateSpy).toHaveBeenCalled();

      // And that it updated the loading state
      expect(component.loading).toBe(true);
    });
  });

  describe('UI rendering', () => {
    beforeEach(() => {
      // Make sure ngOnInit doesn't run
      jest.spyOn(component, 'ngOnInit').mockImplementation(() => {});

      // Don't actually call the API in the generateCoverImage method
      jest.spyOn(component, 'generateCoverImage').mockImplementation(() => {});
    });

    it('should show loading spinner when loading', () => {
      // Manually set the component state
      component.loading = true;

      // Detect changes to update the DOM
      spectator.detectChanges();

      // Verify the spinner exists
      const spinner = spectator.query('mat-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should show error message when error occurs', () => {
      // Manually set the error state
      component.error = 'Test error message';

      // Detect changes to update the DOM
      spectator.detectChanges();

      // Verify the error message is shown - use the correct class from the template
      const errorElement = spectator.query('.error-text');
      expect(errorElement).toBeTruthy();
      expect(errorElement?.textContent).toContain('Test error message');
    });

    it('should show image preview when URL is available', () => {
      // Manually set the URL state
      component.imageUrl = 'https://example.com/test.png';

      // Detect changes to update the DOM
      spectator.detectChanges();

      // Verify the image is shown with correct source
      const img = spectator.query('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/test.png');
    });

    it('should show image preview when base64 is available', () => {
      // Manually set the base64 state
      component.imageBase64 = 'data:image/png;base64,test123';

      // Detect changes to update the DOM
      spectator.detectChanges();

      // Verify the image is shown with correct source
      const img = spectator.query('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('data:image/png;base64,test123');
    });
  });
});
