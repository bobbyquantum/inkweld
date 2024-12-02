import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ProjectElementDto, ProjectElementsAPIService } from 'worm-api-client';

import { ProjectStateService } from './project-state.service';
import { XsrfService } from './xsrf.service';

jest.mock('worm-api-client');
jest.mock('./xsrf.service');

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let elementService: jest.Mocked<ProjectElementsAPIService>;
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
      getProjectElements: jest.fn(),
      dinsertElements: jest.fn(),
    } as unknown as jest.Mocked<ProjectElementsAPIService>;

    xsrfService = {
      getXsrfToken: jest.fn(),
    } as unknown as jest.Mocked<XsrfService>;

    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: ProjectElementsAPIService, useValue: elementService },
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
    (elementService.getProjectElements as jest.Mock).mockReturnValue(
      of(mockElements)
    );

    await service.loadProjectElements('user', 'project');

    expect(elementService.getProjectElements).toHaveBeenCalledWith(
      'user',
      'project'
    );
    expect(service.elements()).toEqual(mockElements);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle loading error', async () => {
    (elementService.getProjectElements as jest.Mock).mockReturnValue(
      throwError(() => new Error('API Error'))
    );

    await service.loadProjectElements('user', 'project');

    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBe('Failed to load project elements');
  });

  it('should handle successful element saving', async () => {
    const mockElements = [mockElement];
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (elementService.dinsertElements as jest.Mock).mockReturnValue(
      of(mockElements)
    );

    await service.saveProjectElements('user', 'project', mockElements);

    expect(elementService.dinsertElements).toHaveBeenCalledWith(
      mockElements,
      'user',
      'project',
      'test-token'
    );
    expect(service.elements()).toEqual(mockElements);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle saving error', async () => {
    const mockElements = [mockElement];
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (elementService.dinsertElements as jest.Mock).mockReturnValue(
      throwError(() => new Error('API Error'))
    );

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
