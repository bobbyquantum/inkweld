import { TestBed } from '@angular/core/testing';
import { ProjectAPIService, ProjectElementDto } from '@worm/index';
import { of, throwError } from 'rxjs';

import { ProjectStateService } from './project-state.service';
import { XsrfService } from './xsrf.service';

jest.mock('./xsrf.service');

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let elementService: jest.Mocked<ProjectAPIService>;
  let xsrfService: jest.Mocked<XsrfService>;

  const mockElement: ProjectElementDto = {
    id: '1',
    name: 'Test Element',
    type: 'FOLDER',
    position: 0,
    level: 0,
  };

  beforeEach(() => {
    elementService = {
      projectElementControllerGetProjectElements: jest.fn(),
      projectElementControllerDinsertElements: jest.fn(),
    } as unknown as jest.Mocked<ProjectAPIService>;

    xsrfService = {
      getXsrfToken: jest.fn(),
    } as unknown as jest.Mocked<XsrfService>;

    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: ProjectAPIService, useValue: elementService },
        { provide: XsrfService, useValue: xsrfService },
      ],
    });

    service = TestBed.inject(ProjectStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should handle successful element loading', async () => {
    const mockElements = [mockElement];
    (
      elementService.projectElementControllerGetProjectElements as jest.Mock
    ).mockReturnValue(of(mockElements));

    await service.loadProjectElements('user', 'project');

    expect(
      elementService.projectElementControllerGetProjectElements
    ).toHaveBeenCalledWith('user', 'project');
    expect(service.elements()).toEqual(mockElements);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle loading error', async () => {
    (
      elementService.projectElementControllerGetProjectElements as jest.Mock
    ).mockReturnValue(throwError(() => new Error('API Error')));

    await service.loadProjectElements('user', 'project');

    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBe('Failed to load project elements');
  });

  it('should handle successful element saving', async () => {
    const mockElements = [mockElement];
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (
      elementService.projectElementControllerDinsertElements as jest.Mock
    ).mockReturnValue(of(mockElements));

    await service.saveProjectElements('user', 'project', mockElements);

    expect(
      elementService.projectElementControllerDinsertElements
    ).toHaveBeenCalledWith('user', 'project', 'test-token', mockElements);
    expect(service.elements()).toEqual(mockElements);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle saving error', async () => {
    const mockElements = [mockElement];
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (
      elementService.projectElementControllerDinsertElements as jest.Mock
    ).mockReturnValue(throwError(() => new Error('API Error')));

    await service.saveProjectElements('user', 'project', mockElements);

    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBe('Failed to save project elements');
  });

  it('should update elements locally', () => {
    const mockElements = [mockElement];

    service.updateElements(mockElements);

    expect(service.elements()).toEqual(mockElements);
  });
});
