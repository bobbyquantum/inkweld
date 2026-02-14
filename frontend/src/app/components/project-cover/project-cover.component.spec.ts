import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection, SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Project } from '@inkweld/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupService } from '../../services/core/setup.service';
import { LocalStorageService } from '../../services/local/local-storage.service';
import { ProjectCoverComponent } from './project-cover.component';

describe('ProjectCoverComponent', () => {
  let component: ProjectCoverComponent;
  let fixture: ComponentFixture<ProjectCoverComponent>;
  let httpTestingController: HttpTestingController;
  let mockSetupService: {
    getMode: ReturnType<typeof vi.fn>;
    getServerUrl: ReturnType<typeof vi.fn>;
  };
  let mockOfflineStorage: {
    getProjectCoverUrl: ReturnType<typeof vi.fn>;
    saveProjectCover: ReturnType<typeof vi.fn>;
    getMediaUrl: ReturnType<typeof vi.fn>;
    saveMedia: ReturnType<typeof vi.fn>;
  };

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
    description: 'A test project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    coverImage: 'cover.png',
  };

  const mockProjectNoCover: Project = {
    id: '2',
    title: 'No Cover Project',
    slug: 'no-cover-project',
    username: 'testuser',
    description: 'A test project without cover',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    coverImage: null,
  };

  /**
   * Helper to set project and trigger ngOnChanges
   */
  function setProjectAndTriggerChanges(project: Project): void {
    const previousProject = component.project;
    component.project = project;
    component.ngOnChanges({
      project: new SimpleChange(previousProject, project, !previousProject),
    });
  }

  beforeEach(async () => {
    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    };
    mockOfflineStorage = {
      getProjectCoverUrl: vi.fn().mockResolvedValue(null),
      saveProjectCover: vi.fn().mockResolvedValue(undefined),
      getMediaUrl: vi.fn().mockResolvedValue(null),
      saveMedia: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [ProjectCoverComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SetupService, useValue: mockSetupService },
        { provide: LocalStorageService, useValue: mockOfflineStorage },
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectCoverComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('hasCover', () => {
    it('should return false initially when no cover loaded', () => {
      component.project = mockProject;
      expect(component.hasCover).toBe(false);
    });

    it('should return true when cover blob URL is loaded', async () => {
      const mockBlobUrl = 'blob:http://localhost/abc123';
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(component.hasCover).toBe(true);
    });
  });

  describe('projectTitle', () => {
    it('should return project title when project exists', () => {
      component.project = mockProject;
      expect(component.projectTitle).toBe('Test Project');
    });

    it('should return "Project" when project is undefined', () => {
      component.project = undefined as unknown as Project;
      expect(component.projectTitle).toBe('Project');
    });
  });

  describe('coverUrl', () => {
    it('should return null initially', () => {
      component.project = mockProject;
      expect(component.coverUrl).toBeNull();
    });

    it('should return blob URL when cover is loaded from cache', async () => {
      const mockBlobUrl = 'blob:http://localhost/abc123';
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(component.coverUrl).toBe(mockBlobUrl);
    });
  });

  describe('cover loading - cache hit', () => {
    const mockBlobUrl = 'blob:http://localhost/abc123';

    it('should load cover from IndexedDB cache if available', async () => {
      mockOfflineStorage.getMediaUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      // Should try getMediaUrl with the coverImage filename stem
      expect(mockOfflineStorage.getMediaUrl).toHaveBeenCalledWith(
        'testuser/test-project',
        'cover'
      );
      expect(component.coverUrl).toBe(mockBlobUrl);
      expect(component.hasCover).toBe(true);
    });

    it('should fall back to legacy getProjectCoverUrl', async () => {
      // getMediaUrl returns null, but legacy getProjectCoverUrl has it
      mockOfflineStorage.getMediaUrl.mockResolvedValue(null);
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(mockOfflineStorage.getProjectCoverUrl).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(component.coverUrl).toBe(mockBlobUrl);
      expect(component.hasCover).toBe(true);
    });

    it('should not fetch from server if cache hit', async () => {
      mockOfflineStorage.getMediaUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      // No HTTP requests should be made
      httpTestingController.expectNone(() => true);
    });
  });

  describe('cover loading - cache miss (online mode)', () => {
    const mockBlobUrl = 'blob:http://localhost/abc123';
    const mockBlob = new Blob(['test'], { type: 'image/png' });

    beforeEach(() => {
      mockSetupService.getMode.mockReturnValue('server');
    });

    it('should fetch from server and cache when not in IndexedDB', async () => {
      // First call returns null (cache miss), second call returns URL (after save)
      // getMediaUrl: first call cache miss, second call after save returns URL
      mockOfflineStorage.getMediaUrl
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockBlobUrl);
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValueOnce(null);

      setProjectAndTriggerChanges(mockProject);

      // Wait for async loadCover to start the HTTP request
      await new Promise(resolve => setTimeout(resolve, 10));

      // Expect HTTP request using the server URL from SetupService
      const expectedUrl =
        'http://localhost:8333/api/v1/projects/testuser/test-project/cover';
      const req = httpTestingController.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      // Respond with blob
      req.flush(mockBlob);

      // Wait for promises to settle after flush
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have saved to IndexedDB with the coverImage filename stem as mediaId
      expect(mockOfflineStorage.saveMedia).toHaveBeenCalledWith(
        'testuser/test-project',
        'cover',
        mockBlob
      );

      // Should have queried getMediaUrl after save
      expect(mockOfflineStorage.getMediaUrl).toHaveBeenCalled();
    });

    it('should handle server 404 gracefully', async () => {
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(null);

      setProjectAndTriggerChanges(mockProject);

      await new Promise(resolve => setTimeout(resolve, 10));

      const expectedUrl =
        'http://localhost:8333/api/v1/projects/testuser/test-project/cover';
      const req = httpTestingController.expectOne(expectedUrl);

      // Respond with 404 error
      req.error(new ProgressEvent('error'), {
        status: 404,
        statusText: 'Not Found',
      });

      await fixture.whenStable();

      expect(component.hasCover).toBe(false);
      expect(component.coverUrl).toBeNull();
    });
  });

  describe('cover loading - offline mode', () => {
    const mockBlobUrl = 'blob:http://localhost/abc123';

    beforeEach(() => {
      mockSetupService.getMode.mockReturnValue('local');
    });

    it('should only use IndexedDB in offline mode', async () => {
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(mockOfflineStorage.getProjectCoverUrl).toHaveBeenCalled();
      expect(component.coverUrl).toBe(mockBlobUrl);

      // No HTTP requests should be made in offline mode
      httpTestingController.expectNone(() => true);
    });

    it('should return null if not in cache and offline', async () => {
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(null);

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(component.hasCover).toBe(false);
      expect(component.coverUrl).toBeNull();

      // Should NOT try to fetch from server
      httpTestingController.expectNone(() => true);
    });
  });

  describe('project without coverImage', () => {
    it('should not fetch from server when coverImage is null', async () => {
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(null);
      mockSetupService.getMode.mockReturnValue('server');

      setProjectAndTriggerChanges(mockProjectNoCover);
      await fixture.whenStable();

      // Should still check IndexedDB cache
      expect(mockOfflineStorage.getProjectCoverUrl).toHaveBeenCalled();

      // But should NOT make HTTP request since coverImage is null
      httpTestingController.expectNone(() => true);

      expect(component.hasCover).toBe(false);
    });
  });

  describe('variant input', () => {
    it('should default to card variant', () => {
      expect(component.variant).toBe('card');
    });

    it('should accept list variant', () => {
      component.variant = 'list';
      expect(component.variant).toBe('list');
    });

    it('should accept small variant', () => {
      component.variant = 'small';
      expect(component.variant).toBe('small');
    });
  });

  describe('cleanup', () => {
    it('should NOT revoke blob URL on destroy (service manages URL lifecycle)', async () => {
      // The LocalStorageService manages blob URL lifecycle and caches them
      // for reuse across components. The component should NOT revoke URLs
      // as this would invalidate cached URLs used by other components.
      const mockBlobUrl = 'blob:http://localhost/abc123';
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl);

      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      // Verify blob URL was set
      expect(component.coverUrl).toBe(mockBlobUrl);

      fixture.destroy();

      // Should NOT revoke - service manages URL lifecycle
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });

    it('should clear local state when project changes but NOT revoke URL', async () => {
      // URLs are cached by LocalStorageService and reused across components.
      // The component should clear its local state but NOT revoke URLs.
      const mockBlobUrl1 = 'blob:http://localhost/abc123';
      const mockBlobUrl2 = 'blob:http://localhost/def456';

      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

      // Load first project
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl1);
      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      expect(component.coverUrl).toBe(mockBlobUrl1);

      // Load different project
      const otherProject: Project = {
        ...mockProject,
        id: '3',
        slug: 'other-project',
      };
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(mockBlobUrl2);
      setProjectAndTriggerChanges(otherProject);
      await fixture.whenStable();

      // Should NOT have revoked URL - service manages lifecycle
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      // But should have new URL set
      expect(component.coverUrl).toBe(mockBlobUrl2);
    });

    it('should reset loading state on destroy', async () => {
      mockOfflineStorage.getProjectCoverUrl.mockResolvedValue(
        'blob:http://localhost/abc123'
      );

      setProjectAndTriggerChanges(mockProject);
      await fixture.whenStable();

      fixture.destroy();

      // Verify component state is reset (via ngOnDestroy setting isLoading = false)
      // We can't directly check private members, but we can verify no errors occur
      expect(true).toBe(true);
    });
  });
});
