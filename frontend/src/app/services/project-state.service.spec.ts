import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProjectAPIService, ProjectDto, ProjectElementDto } from '@worm/index';
import { of, throwError } from 'rxjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectStateService } from './project-state.service';
import { XsrfService } from './xsrf.service';

jest.mock('./xsrf.service');

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let elementService: ProjectAPIService;
  let xsrfService: XsrfService;
  let getProjectSpy: jest.SpyInstance;
  let getElementsSpy: jest.SpyInstance;
  let saveElementsSpy: jest.SpyInstance;

  const mockElement: ProjectElementDto = {
    id: '1',
    type: 'FOLDER',
    position: 0,
    level: 0,
    name: 'Test Folder',
  };

  const mockProject: ProjectDto = {
    slug: 'test-project',
    title: 'Test Project',
    description: undefined,
  };

  const mockElements: ProjectElementDto[] = [mockElement];

  beforeEach(() => {
    elementService = {
      projectControllerGetProjectByUsernameAndSlug: jest.fn(),
      projectElementControllerGetProjectElements: jest.fn(),
      projectElementControllerDinsertElements: jest.fn(),
    } as unknown as ProjectAPIService;
    xsrfService = {
      getXsrfToken: jest.fn(),
    } as unknown as XsrfService;

    getProjectSpy = jest.spyOn(
      elementService,
      'projectControllerGetProjectByUsernameAndSlug'
    );

    getElementsSpy = jest.spyOn(
      elementService,
      'projectElementControllerGetProjectElements'
    );

    saveElementsSpy = jest.spyOn(
      elementService,
      'projectElementControllerDinsertElements'
    );
    jest.spyOn(xsrfService, 'getXsrfToken').mockReturnValue('test-token');

    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: ProjectAPIService, useValue: elementService },
        { provide: XsrfService, useValue: xsrfService },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ProjectStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should handle successful project load', async () => {
    getProjectSpy.mockReturnValue(of(mockProject));
    getElementsSpy.mockReturnValue(of(mockElements));

    await service.loadProject('user', 'project');
    expect(service.project()).toEqual(mockProject);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeUndefined();
    expect(getProjectSpy).toHaveBeenCalledWith('user', 'project');
  });

  it('should handle project load error', async () => {
    const error = new Error('API Error');
    getProjectSpy.mockReturnValue(throwError(() => error));

    await service.loadProject('user', 'project');

    expect(service.project()).toBeUndefined();
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBe('Failed to load project');
  });

  it('should handle successful element loading', async () => {
    getElementsSpy.mockReturnValue(of(mockElements));

    await service.loadProjectElements('user', 'project');

    expect(service.elements()).toEqual(mockElements);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeUndefined();
    expect(getElementsSpy).toHaveBeenCalledWith('user', 'project');
  });

  it('should handle element loading error', async () => {
    const error = new Error('API Error');
    getElementsSpy.mockReturnValue(throwError(() => error));

    await service.loadProjectElements('user', 'project');

    expect(service.elements()).toEqual([]);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBe('Failed to load project elements');
  });

  it('should handle empty element loading response', async () => {
    getElementsSpy.mockReturnValue(of([]));
    await service.loadProjectElements('user', 'project');

    expect(service.elements()).toEqual([]);
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle successful element saving', async () => {
    jest.spyOn(xsrfService, 'getXsrfToken').mockReturnValue('test-token');
    saveElementsSpy.mockImplementation(() => of(mockElements));

    await service.saveProjectElements('user', 'project', mockElements);

    expect(service.elements()).toEqual(mockElements);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBeUndefined();
    expect(saveElementsSpy).toHaveBeenCalledWith(
      'user',
      'project',
      'test-token',
      mockElements
    );
  });

  it('should handle element saving error', async () => {
    const error = new Error('API Error');
    saveElementsSpy.mockReturnValue(throwError(() => error));

    await service.saveProjectElements('user', 'project', mockElements);

    expect(service.error()).toBe('Failed to save project elements');
    expect(service.isSaving()).toBe(false);
  });

  it('should handle empty project elements array', async () => {
    saveElementsSpy.mockImplementation(() => of([]));
    await service.saveProjectElements('user', 'project', []);

    expect(service.elements()).toEqual([]);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBeUndefined();
  });

  it('should handle null project elements', async () => {
    await service.saveProjectElements(
      'user',
      'project',
      null as unknown as ProjectElementDto[]
    );

    expect(service.elements()).toEqual([]);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBe('Failed to save project elements');
  });

  it('should handle undefined project elements', async () => {
    await service.saveProjectElements(
      'user',
      'project',
      undefined as unknown as ProjectElementDto[]
    );

    expect(service.elements()).toEqual([]);
    expect(service.isSaving()).toBe(false);
    expect(service.error()).toBe('Failed to save project elements');
  });

  it('should update elements locally', () => {
    service.updateElements(mockElements);
    expect(service.elements()).toEqual(mockElements);
  });

  describe('File Operations', () => {
    it('should open file and set initial sync state', () => {
      service.openFile(mockElement);
      expect(service.openFiles()).toContainEqual(mockElement);
      expect(service.getSyncState()('1')).toBe('unavailable');
    });

    it('should not open invalid file', () => {
      service.openFile(null);
      expect(service.openFiles()).toEqual([]);
    });

    it('should close file and update sync state', () => {
      service.openFile(mockElement);
      service.closeFile(0);
      expect(service.openFiles()).toEqual([]);
      expect(service.getSyncState()('1')).toBe('unavailable');
    });

    it('should handle closing invalid index', () => {
      service.openFile(mockElement);
      service.closeFile(999);
      expect(service.openFiles()).toContainEqual(mockElement);
    });
  });

  describe('Sync State Management', () => {
    it('should update sync state for existing file', () => {
      service.openFile(mockElement);
      service.updateSyncState('1', DocumentSyncState.Synced);
      expect(service.getSyncState()('1')).toBe('synced');
    });

    it('should not update sync state for non-existent file', () => {
      service.updateSyncState('non-existent', DocumentSyncState.Synced);
      expect(service.getSyncState()('non-existent')).toBeUndefined();
    });

    it('should not update sync state for a null document id', () => {
      service.updateSyncState(
        null as unknown as string,
        DocumentSyncState.Synced
      );
      expect(service.getSyncState()('non-existent')).toBeUndefined();
    });

    it('should clear sync state when setting to undefined', () => {
      service.openFile(mockElement);
      service.updateSyncState('1', undefined);
      expect(service.getSyncState()('1')).toBeUndefined();
    });

    it('should handle multiple sync states', () => {
      const mockElement2 = { ...mockElement, id: '2' };
      service.openFile(mockElement);
      service.openFile(mockElement2);

      service.updateSyncState('1', DocumentSyncState.Synced);
      service.updateSyncState('2', DocumentSyncState.Syncing);

      expect(service.getSyncState()('1')).toBe('synced');
      expect(service.getSyncState()('2')).toBe('syncing');
    });
  });
});
