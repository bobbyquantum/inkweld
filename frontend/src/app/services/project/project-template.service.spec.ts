import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ProjectTemplateInfo,
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
      await promise1;

      // Clear cache
      service.clearCache();

      // Next call should make HTTP request again
      const promise2 = service.getTemplates();
      const req2 = httpMock.expectOne('/assets/project-templates/index.json');
      req2.flush(mockTemplateIndex);
      await promise2;
    });
  });
});
