import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

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
