import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ProjectAPIService } from '../../../api-client/api/project-api.service';
import { ProjectStateService } from '../../services/project-state.service';
import { ImageElementEditorComponent } from './image-element-editor.component';

beforeAll(() => {
  Object.defineProperty(window, 'URL', {
    writable: true,
    value: { createObjectURL: jest.fn(() => 'test-blob-url') },
  });
});

describe('ImageElementEditorComponent', () => {
  let component: ImageElementEditorComponent;
  let fixture: ComponentFixture<ImageElementEditorComponent>;
  let mockProjectApiService: any;
  let mockProjectStateService: any;

  beforeEach(async () => {
    mockProjectApiService = {
      projectElementControllerDownloadImage: jest.fn(() => of(new Blob([]))),
    };
    mockProjectStateService = {
      project: () => ({ user: { username: 'testuser' }, slug: 'test-project' }),
    };

    await TestBed.configureTestingModule({
      imports: [ImageElementEditorComponent],
      providers: [
        { provide: ProjectAPIService, useValue: mockProjectApiService },
        { provide: ProjectStateService, useValue: mockProjectStateService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ImageElementEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set imageUrl when a value is provided', () => {
    const testUrl = 'http://example.com/test-image.png';
    component.imageUrl = testUrl;
    fixture.detectChanges();
    expect(component.imageUrl).toEqual(testUrl);
  });

  it('should have no imageUrl when none is provided', () => {
    component.imageUrl = '';
    fixture.detectChanges();
    expect(component.imageUrl).toBeFalsy();
  });

  it('should download image on init when elementId is provided', () => {
    component.elementId = '123';
    component.ngOnInit();
    fixture.detectChanges();
    expect(
      mockProjectApiService.projectElementControllerDownloadImage
    ).toHaveBeenCalled();
    expect(component.imageUrl).toBeTruthy();
  });

  it('should handle error when downloading image fails', () => {
    // Setup spy to console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Make the API call return an error using throwError
    mockProjectApiService.projectElementControllerDownloadImage.mockReturnValue(
      throwError(() => new Error('Download failed'))
    );

    component.elementId = '123';
    component.ngOnInit();
    fixture.detectChanges();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error downloading image',
      expect.any(Error)
    );

    // Clean up
    consoleErrorSpy.mockRestore();
  });

  it('should not download image when project is null', () => {
    mockProjectStateService.project = jest.fn(() => null);

    component.elementId = '123';
    component.ngOnInit();

    expect(
      mockProjectApiService.projectElementControllerDownloadImage
    ).not.toHaveBeenCalled();
  });

  it('should not download image when project.user is null', () => {
    mockProjectStateService.project = jest.fn(() => ({
      user: null,
      slug: 'test-project',
    }));

    component.elementId = '123';
    component.ngOnInit();

    expect(
      mockProjectApiService.projectElementControllerDownloadImage
    ).not.toHaveBeenCalled();
  });

  it('should not download image when project.slug is null', () => {
    mockProjectStateService.project = jest.fn(() => ({
      user: { username: 'testuser' },
      slug: null,
    }));

    component.elementId = '123';
    component.ngOnInit();

    expect(
      mockProjectApiService.projectElementControllerDownloadImage
    ).not.toHaveBeenCalled();
  });

  it('should have a ProjectAPIService injected', () => {
    const service = TestBed.inject(ProjectAPIService);
    expect(service).toBeTruthy();
  });

  it('should show placeholder when no image is available', () => {
    component.imageUrl = null;
    fixture.detectChanges();
    const placeholder = fixture.nativeElement.querySelector('.placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('No image available');
  });
});
