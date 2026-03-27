import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type ProjectTemplateInfo,
  ProjectTemplateService,
} from './project-template.service';

describe('ProjectTemplateService', () => {
  let service: ProjectTemplateService;
  let httpMock: HttpTestingController;

  const mockTemplateIndex = {
    version: 1,
    templates: [
      {
        id: 'empty',
        name: 'Empty Project',
        description: 'A blank slate',
        icon: 'description',
        folder: 'empty',
      },
      {
        id: 'worldbuilding-empty',
        name: 'Worldbuilding (Empty)',
        description: 'Ready for worldbuilding',
        icon: 'public',
        folder: 'worldbuilding-empty',
      },
    ] as ProjectTemplateInfo[],
  };

  const mockEmptyTemplate = {
    manifest: {
      version: 1,
      exportedAt: '2024-12-21T00:00:00.000Z',
      appVersion: 'template',
      projectTitle: 'Empty Project',
      originalSlug: 'empty-template',
    },
    project: {
      title: 'Empty Project',
      description: 'A blank slate',
      slug: 'empty-template',
      hasCover: false,
    },
    elements: [{ id: 'readme-001', name: 'README', type: 'ITEM' }],
    documents: [{ elementId: 'readme-001', content: { type: 'doc' } }],
    worldbuilding: [],
    schemas: [],
    relationships: [],
    customRelationshipTypes: [],
    publishPlans: [],
    snapshots: [],
    media: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ProjectTemplateService],
    });

    service = TestBed.inject(ProjectTemplateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getTemplates', () => {
    it('should load and return templates from index.json', async () => {
      const promise = service.getTemplates();

      const req = httpMock.expectOne('/assets/project-templates/index.json');
      expect(req.request.method).toBe('GET');
      req.flush(mockTemplateIndex);

      const templates = await promise;
      expect(templates).toHaveLength(2);
      expect(templates[0].id).toBe('empty');
      expect(templates[1].id).toBe('worldbuilding-empty');
    });

    it('should cache templates after first load', async () => {
      // First call
      const promise1 = service.getTemplates();
      const req = httpMock.expectOne('/assets/project-templates/index.json');
      req.flush(mockTemplateIndex);
      await promise1;

      // Second call should use cache (no HTTP request)
      const promise2 = service.getTemplates();
      httpMock.expectNone('/assets/project-templates/index.json');
      const templates = await promise2;

      expect(templates).toHaveLength(2);
    });

    it('should throw error when loading fails', async () => {
      const promise = service.getTemplates();

      const req = httpMock.expectOne('/assets/project-templates/index.json');
      req.error(new ProgressEvent('error'));

      await expect(promise).rejects.toThrow();
    });
  });

  describe('loadTemplate', () => {
    it('should load all template files', async () => {
      // Start the load, but don't await yet
      const promise = service.loadTemplate('empty');

      // Index request - cache will be empty so this happens first
      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      // Wait a tick for the index to be processed
      await new Promise(resolve => setTimeout(resolve, 0));

      // Then all template files are loaded in parallel
      const _basePath = '/assets/project-templates/empty/';
      const pending = httpMock.match(() => true);

      // Flush all pending requests with appropriate responses
      for (const req of pending) {
        if (req.request.url.includes('manifest.json')) {
          req.flush(mockEmptyTemplate.manifest);
        } else if (req.request.url.includes('project.json')) {
          req.flush(mockEmptyTemplate.project);
        } else if (req.request.url.includes('elements.json')) {
          req.flush(mockEmptyTemplate.elements);
        } else if (req.request.url.includes('documents.json')) {
          req.flush(mockEmptyTemplate.documents);
        } else {
          req.flush([]);
        }
      }

      const archive = await promise;

      expect(archive.manifest.projectTitle).toBe('Empty Project');
      expect(archive.project.title).toBe('Empty Project');
      expect(archive.elements).toHaveLength(1);
    });

    it('should throw error when template not found', async () => {
      const promise = service.loadTemplate('nonexistent');

      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await expect(promise).rejects.toThrow('Template not found: nonexistent');
    });
  });

  describe('getTemplateInfo', () => {
    it('should return template info by ID', async () => {
      const promise = service.getTemplateInfo('empty');

      const req = httpMock.expectOne('/assets/project-templates/index.json');
      req.flush(mockTemplateIndex);

      const info = await promise;
      expect(info?.id).toBe('empty');
      expect(info?.name).toBe('Empty Project');
    });

    it('should return undefined for unknown template', async () => {
      const promise = service.getTemplateInfo('nonexistent');

      const req = httpMock.expectOne('/assets/project-templates/index.json');
      req.flush(mockTemplateIndex);

      const info = await promise;
      expect(info).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('should clear cached templates', async () => {
      // Load templates
      const promise1 = service.getTemplates();
      const req1 = httpMock.expectOne('/assets/project-templates/index.json');
      req1.flush(mockTemplateIndex);
      const templates1 = await promise1;

      // Clear cache
      service.clearCache();

      // Next call should make HTTP request again
      const promise2 = service.getTemplates();
      const req2 = httpMock.expectOne('/assets/project-templates/index.json');
      req2.flush(mockTemplateIndex);
      const templates2 = await promise2;

      expect(templates1).toEqual(templates2);
    });
  });

  describe('loadMediaBlobs', () => {
    const mockTemplateWithMedia = {
      ...mockEmptyTemplate,
      media: [
        {
          mediaId: 'img-hero',
          filename: 'hero.png',
          archivePath: 'media/hero.png',
          mimeType: 'image/png',
        },
        {
          mediaId: 'img-villain',
          filename: 'villain.jpg',
          archivePath: 'media/villain.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    };

    it('should load media blobs and attach them to entries', async () => {
      const worldbuildingTemplate = {
        ...mockTemplateIndex,
        templates: [
          ...mockTemplateIndex.templates,
          {
            id: 'with-media',
            name: 'With Media',
            description: 'Has media',
            icon: 'image',
            folder: 'with-media',
          } as ProjectTemplateInfo,
        ],
      };

      const promise = service.loadTemplate('with-media');

      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(worldbuildingTemplate);

      await new Promise(resolve => setTimeout(resolve, 0));

      const pending = httpMock.match(() => true);
      for (const req of pending) {
        if (req.request.url.includes('manifest.json')) {
          req.flush(mockTemplateWithMedia.manifest);
        } else if (req.request.url.includes('project.json')) {
          req.flush(mockTemplateWithMedia.project);
        } else if (req.request.url.includes('elements.json')) {
          req.flush(mockTemplateWithMedia.elements);
        } else if (req.request.url.includes('documents.json')) {
          req.flush(mockTemplateWithMedia.documents);
        } else if (req.request.url.includes('media.json')) {
          req.flush(mockTemplateWithMedia.media);
        } else {
          req.flush([]);
        }
      }

      // Wait for media.json to be resolved, then flush blob requests
      await new Promise(resolve => setTimeout(resolve, 0));

      const mediaRequests = httpMock.match(() => true);
      for (const req of mediaRequests) {
        if (req.request.url.includes('media/hero.png')) {
          req.flush(new Blob(['hero-data'], { type: 'image/png' }));
        } else if (req.request.url.includes('media/villain.jpg')) {
          req.flush(new Blob(['villain-data'], { type: 'image/jpeg' }));
        } else {
          req.flush(new Blob());
        }
      }

      const archive = await promise;
      expect(archive.media).toHaveLength(2);
      expect(archive.media[0].blob).toBeInstanceOf(Blob);
      expect(archive.media[1].blob).toBeInstanceOf(Blob);
    });

    it('should return empty media array when no media is present', async () => {
      const promise = service.loadTemplate('empty');

      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await new Promise(resolve => setTimeout(resolve, 0));

      const pending = httpMock.match(() => true);
      for (const req of pending) {
        if (req.request.url.includes('manifest.json')) {
          req.flush(mockEmptyTemplate.manifest);
        } else if (req.request.url.includes('project.json')) {
          req.flush(mockEmptyTemplate.project);
        } else if (req.request.url.includes('elements.json')) {
          req.flush(mockEmptyTemplate.elements);
        } else if (req.request.url.includes('documents.json')) {
          req.flush(mockEmptyTemplate.documents);
        } else {
          req.flush([]);
        }
      }

      const archive = await promise;
      expect(archive.media).toHaveLength(0);
    });

    it('should handle failed media blob fetch gracefully', async () => {
      const templateWithOneMedia = {
        ...mockEmptyTemplate,
        media: [
          {
            mediaId: 'img-broken',
            filename: 'broken.png',
            archivePath: 'media/broken.png',
            mimeType: 'image/png',
          },
        ],
      };

      const indexWithMedia = {
        ...mockTemplateIndex,
        templates: [
          ...mockTemplateIndex.templates,
          {
            id: 'broken-media',
            name: 'Broken Media',
            description: 'Has broken media',
            icon: 'image',
            folder: 'broken-media',
          } as ProjectTemplateInfo,
        ],
      };

      const promise = service.loadTemplate('broken-media');

      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(indexWithMedia);

      await new Promise(resolve => setTimeout(resolve, 0));

      const pending = httpMock.match(() => true);
      for (const req of pending) {
        if (req.request.url.includes('manifest.json')) {
          req.flush(templateWithOneMedia.manifest);
        } else if (req.request.url.includes('project.json')) {
          req.flush(templateWithOneMedia.project);
        } else if (req.request.url.includes('elements.json')) {
          req.flush(templateWithOneMedia.elements);
        } else if (req.request.url.includes('documents.json')) {
          req.flush(templateWithOneMedia.documents);
        } else if (req.request.url.includes('media.json')) {
          req.flush(templateWithOneMedia.media);
        } else {
          req.flush([]);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      // Fail the media blob request
      const mediaRequests = httpMock.match(() => true);
      for (const req of mediaRequests) {
        req.error(new ProgressEvent('error'));
      }

      const archive = await promise;
      // Media entry exists but blob is undefined because fetch failed
      expect(archive.media).toHaveLength(1);
      expect(archive.media[0].blob).toBeUndefined();
    });

    it('should deduplicate fetches for shared archivePaths', async () => {
      const templateWithDuplicateMedia = {
        ...mockEmptyTemplate,
        media: [
          {
            mediaId: 'img-a',
            filename: 'shared.png',
            archivePath: 'media/shared.png',
            mimeType: 'image/png',
          },
          {
            mediaId: 'img-b',
            filename: 'shared.png',
            archivePath: 'media/shared.png',
            mimeType: 'image/png',
          },
        ],
      };

      const indexWithDupes = {
        ...mockTemplateIndex,
        templates: [
          ...mockTemplateIndex.templates,
          {
            id: 'dupe-media',
            name: 'Dupe Media',
            description: 'Shared archive paths',
            icon: 'image',
            folder: 'dupe-media',
          } as ProjectTemplateInfo,
        ],
      };

      const promise = service.loadTemplate('dupe-media');

      const indexReq = httpMock.expectOne(
        '/assets/project-templates/index.json'
      );
      indexReq.flush(indexWithDupes);

      await new Promise(resolve => setTimeout(resolve, 0));

      const pending = httpMock.match(() => true);
      for (const req of pending) {
        if (req.request.url.includes('manifest.json')) {
          req.flush(templateWithDuplicateMedia.manifest);
        } else if (req.request.url.includes('project.json')) {
          req.flush(templateWithDuplicateMedia.project);
        } else if (req.request.url.includes('elements.json')) {
          req.flush(templateWithDuplicateMedia.elements);
        } else if (req.request.url.includes('documents.json')) {
          req.flush(templateWithDuplicateMedia.documents);
        } else if (req.request.url.includes('media.json')) {
          req.flush(templateWithDuplicateMedia.media);
        } else {
          req.flush([]);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      // Only one blob fetch should occur for the shared archivePath
      const mediaRequests = httpMock.match(() => true);
      expect(mediaRequests).toHaveLength(1);
      mediaRequests[0].flush(new Blob(['shared-data'], { type: 'image/png' }));

      const archive = await promise;
      expect(archive.media).toHaveLength(2);
      // Both entries share the same blob
      expect(archive.media[0].blob).toBeInstanceOf(Blob);
      expect(archive.media[1].blob).toBeInstanceOf(Blob);
    });
  });
});
