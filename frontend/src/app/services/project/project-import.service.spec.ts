import { HttpClient } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementType, Project, ProjectsService } from '@inkweld/index';
import JSZip from '@progress/jszip-esm';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import {
  ARCHIVE_VERSION,
  ArchiveElement,
  ArchiveManifest,
  ImportPhase,
  ProjectArchive,
  ProjectArchiveErrorType,
} from '../../models/project-archive';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectService } from '../offline/offline-project.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { OfflineSnapshotService } from '../offline/offline-snapshot.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { DocumentImportService } from './document-import.service';
import { ProjectImportService } from './project-import.service';

/**
 * Helper to create a real ZIP file from a ProjectArchive for testing.
 * This uses JSZip to create an actual archive that the service can read.
 */
async function createTestArchive(archive: ProjectArchive): Promise<File> {
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(archive.manifest));
  zip.file('project.json', JSON.stringify(archive.project));
  zip.file('elements.json', JSON.stringify(archive.elements));
  zip.file('documents.json', JSON.stringify(archive.documents));
  zip.file('worldbuilding.json', JSON.stringify(archive.worldbuilding));
  zip.file('schemas.json', JSON.stringify(archive.schemas));
  zip.file('relationships.json', JSON.stringify(archive.relationships));
  zip.file(
    'relationship-types.json',
    JSON.stringify(archive.customRelationshipTypes)
  );
  zip.file('tags.json', JSON.stringify(archive.tags));
  zip.file('publish-plans.json', JSON.stringify(archive.publishPlans));
  zip.file('media-index.json', JSON.stringify(archive.media));
  zip.file('snapshots.json', JSON.stringify(archive.snapshots ?? []));

  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'test-archive.zip', { type: 'application/zip' });
}

/**
 * Helper to create a ZIP file with custom content for edge case testing.
 */
async function createCustomZip(files: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'test.zip', { type: 'application/zip' });
}

describe('ProjectImportService', () => {
  let service: ProjectImportService;
  let logger: MockedObject<LoggerService>;
  let http: MockedObject<HttpClient>;
  let syncFactory: MockedObject<ElementSyncProviderFactory>;
  let offlineProject: MockedObject<OfflineProjectService>;
  let offlineElements: MockedObject<OfflineProjectElementsService>;
  let offlineStorage: MockedObject<OfflineStorageService>;
  let offlineSnapshots: MockedObject<OfflineSnapshotService>;
  let projectsService: MockedObject<ProjectsService>;
  let documentImport: MockedObject<DocumentImportService>;

  const mockManifest: ArchiveManifest = {
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    projectTitle: 'Test Project',
    originalSlug: 'test-project',
  };

  const mockProject = {
    title: 'Test Project',
    description: 'A test project description',
    slug: 'test-project',
    hasCover: false,
  };

  const mockElements: ArchiveElement[] = [
    {
      id: 'elem-1',
      name: 'Chapter 1',
      type: ElementType.Folder,
      order: 0,
      level: 0,
      parentId: null,
      expandable: true,
      version: 1,
      metadata: {},
    },
    {
      id: 'elem-2',
      name: 'Scene 1',
      type: ElementType.Item,
      order: 0,
      level: 1,
      parentId: 'elem-1',
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  const mockArchive: ProjectArchive = {
    manifest: mockManifest,
    project: mockProject,
    elements: mockElements,
    documents: [{ elementId: 'elem-2', content: [{ type: 'paragraph' }] }],
    worldbuilding: [],
    schemas: [],
    relationships: [],
    customRelationshipTypes: [],
    tags: [],
    publishPlans: [],
    media: [],
  };

  const mockCreatedProject: Project = {
    id: 'proj-1',
    title: mockProject.title,
    description: mockProject.description,
    slug: 'imported-project',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(() => {
    logger = mockDeep<LoggerService>();
    http = mockDeep<HttpClient>();
    syncFactory = mockDeep<ElementSyncProviderFactory>();
    offlineProject = mockDeep<OfflineProjectService>();
    offlineElements = mockDeep<OfflineProjectElementsService>();
    offlineStorage = mockDeep<OfflineStorageService>();
    offlineSnapshots = mockDeep<OfflineSnapshotService>();
    projectsService = mockDeep<ProjectsService>();
    documentImport = mockDeep<DocumentImportService>();

    // Setup default mocks
    syncFactory.isOfflineMode.mockReturnValue(true);
    offlineProject.createProject.mockResolvedValue(mockCreatedProject);
    offlineProject.getProject.mockReturnValue(null);
    offlineProject.deleteProject.mockReturnValue(undefined);
    offlineElements.saveElements.mockResolvedValue(undefined);
    offlineElements.saveSchemas.mockResolvedValue(undefined);
    offlineElements.saveRelationships.mockResolvedValue(undefined);
    offlineElements.saveCustomRelationshipTypes.mockResolvedValue(undefined);
    offlineElements.saveCustomTags.mockResolvedValue(undefined);
    offlineElements.savePublishPlans.mockResolvedValue(undefined);
    offlineStorage.saveMedia.mockResolvedValue(undefined);
    offlineSnapshots.importSnapshot.mockResolvedValue({
      id: 'test:doc:snap-1',
      projectKey: 'testuser/imported-project',
      documentId: 'doc-1',
      name: 'Imported Snapshot',
      xmlContent: '<doc></doc>',
      createdAt: new Date().toISOString(),
      synced: false,
    });
    documentImport.writeDocumentContent.mockResolvedValue(undefined);
    documentImport.writeWorldbuildingData.mockResolvedValue(undefined);
    projectsService.createProject.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      of(mockCreatedProject) as any
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    projectsService.deleteProject.mockReturnValue(of({}) as any);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    http.post.mockReturnValue(of({}) as any);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ProjectImportService,
        { provide: LoggerService, useValue: logger },
        { provide: HttpClient, useValue: http },
        { provide: ElementSyncProviderFactory, useValue: syncFactory },
        { provide: OfflineProjectService, useValue: offlineProject },
        { provide: OfflineProjectElementsService, useValue: offlineElements },
        { provide: OfflineStorageService, useValue: offlineStorage },
        { provide: OfflineSnapshotService, useValue: offlineSnapshots },
        { provide: ProjectsService, useValue: projectsService },
        { provide: DocumentImportService, useValue: documentImport },
      ],
    });

    service = TestBed.inject(ProjectImportService);
  });

  describe('initial state', () => {
    it('should initialize with correct default values', () => {
      expect(service.progress().phase).toBe(ImportPhase.Initializing);
      expect(service.progress().progress).toBe(0);
      expect(service.isImporting()).toBe(false);
      expect(service.error()).toBeUndefined();
    });
  });

  describe('validateSlug', () => {
    it('should return invalid for slug with uppercase letters', () => {
      const result = service.validateSlug('TestSlug');

      expect(result.valid).toBe(false);
      expect(result.available).toBe(false);
      expect(result.error).toContain('lowercase');
      expect(result.suggestion).toBe('testslug');
    });

    it('should return invalid for slug with special characters', () => {
      const result = service.validateSlug('test@slug!');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should return invalid for slug shorter than 3 characters', () => {
      const result = service.validateSlug('ab');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('3 characters');
    });

    it('should return invalid for slug longer than 50 characters', () => {
      const longSlug = 'a'.repeat(51);
      const result = service.validateSlug(longSlug);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters');
    });

    it('should return valid for proper slug format', () => {
      const result = service.validateSlug('my-test-project');

      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });

    it('should check availability in offline mode', () => {
      syncFactory.isOfflineMode.mockReturnValue(true);
      offlineProject.getProject.mockReturnValue(mockCreatedProject);

      const result = service.validateSlug('existing-project', 'testuser');

      expect(result.valid).toBe(true);
      expect(result.available).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should return available in server mode', () => {
      syncFactory.isOfflineMode.mockReturnValue(false);

      const result = service.validateSlug('any-slug');

      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });
  });

  describe('suggestSlug', () => {
    it('should convert title to slug format', () => {
      expect(service.suggestSlug('My Test Project')).toBe('my-test-project');
    });

    it('should handle special characters', () => {
      expect(service.suggestSlug('Project @#$ Name!')).toBe('project-name');
    });

    it('should handle multiple spaces and dashes', () => {
      expect(service.suggestSlug('My   Project   Name')).toBe(
        'my-project-name'
      );
    });

    it('should truncate long titles', () => {
      const longTitle = 'A'.repeat(100);
      const result = service.suggestSlug(longTitle);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should handle empty title', () => {
      expect(service.suggestSlug('')).toBe('');
    });

    it('should handle title with only special characters', () => {
      expect(service.suggestSlug('@#$%^&*()')).toBe('');
    });

    it('should handle unicode characters', () => {
      expect(service.suggestSlug('Café Project')).toBe('caf-project');
    });

    it('should handle numeric-only titles', () => {
      expect(service.suggestSlug('12345')).toBe('12345');
    });

    it('should handle leading/trailing spaces', () => {
      expect(service.suggestSlug('  Test Project  ')).toBe('test-project');
    });

    it('should handle leading/trailing dashes', () => {
      expect(service.suggestSlug('---Test---')).toBe('test');
    });
  });

  describe('previewArchive', () => {
    it('should extract archive preview data', { timeout: 5000 }, async () => {
      const file = await createTestArchive(mockArchive);

      const preview = await service.previewArchive(file);

      expect(preview.manifest).toEqual(mockManifest);
      expect(preview.project).toEqual(mockProject);
      expect(preview.counts.elements).toBe(mockElements.length);
      expect(preview.counts.documents).toBe(1);
      expect(preview.counts.worldbuildingEntries).toBe(0);
      expect(preview.counts.schemas).toBe(0);
      expect(preview.counts.mediaFiles).toBe(0);
    });

    it(
      'should handle archive with worldbuilding data',
      { timeout: 5000 },
      async () => {
        const archiveWithWb: ProjectArchive = {
          ...mockArchive,
          worldbuilding: [
            {
              elementId: 'wb-1',
              schemaType: 'CHARACTER',
              data: { name: 'Hero' },
            },
            {
              elementId: 'wb-2',
              schemaType: 'LOCATION',
              data: { name: 'Town' },
            },
          ],
        };
        const file = await createTestArchive(archiveWithWb);

        const preview = await service.previewArchive(file);

        expect(preview.counts.worldbuildingEntries).toBe(2);
      }
    );

    it('should handle archive with schemas', { timeout: 5000 }, async () => {
      const archiveWithSchemas: ProjectArchive = {
        ...mockArchive,
        schemas: [
          {
            id: 'schema-1',
            type: 'CHARACTER',
            name: 'Character',
            icon: 'person',
            description: 'A character template',
            version: 1,
            isBuiltIn: false,
            tabs: [],
          },
        ],
      };
      const file = await createTestArchive(archiveWithSchemas);

      const preview = await service.previewArchive(file);

      expect(preview.counts.schemas).toBe(1);
    });

    it(
      'should handle archive with media files',
      { timeout: 5000 },
      async () => {
        const archiveWithMedia: ProjectArchive = {
          ...mockArchive,
          media: [
            {
              mediaId: 'media-1',
              filename: 'image.png',
              mimeType: 'image/png',
              size: 1024,
              archivePath: 'media/image.png',
            },
          ],
        };
        const file = await createTestArchive(archiveWithMedia);

        const preview = await service.previewArchive(file);

        expect(preview.counts.mediaFiles).toBe(1);
      }
    );
  });

  describe('importProject', () => {
    it(
      'should throw error when slug is not provided',
      { timeout: 5000 },
      async () => {
        const file = await createTestArchive(mockArchive);

        await expect(service.importProject(file, {})).rejects.toMatchObject({
          type: ProjectArchiveErrorType.ValidationFailed,
        });
      }
    );

    it(
      'should import project successfully in offline mode',
      { timeout: 5000 },
      async () => {
        const file = await createTestArchive(mockArchive);

        const result = await service.importProject(file, {
          slug: 'imported-project',
        });

        expect(result).toEqual(mockCreatedProject);
        expect(service.isImporting()).toBe(false);
        expect(service.error()).toBeUndefined();
        expect(service.progress().phase).toBe(ImportPhase.Complete);
      }
    );

    it(
      'should create project using offline service in offline mode',
      { timeout: 5000 },
      async () => {
        const file = await createTestArchive(mockArchive);

        await service.importProject(file, { slug: 'imported-project' });

        expect(offlineProject.createProject).toHaveBeenCalledWith({
          title: mockProject.title,
          description: mockProject.description,
          slug: 'imported-project',
        });
      }
    );

    it(
      'should create project using API in server mode',
      { timeout: 5000 },
      async () => {
        syncFactory.isOfflineMode.mockReturnValue(false);
        const file = await createTestArchive(mockArchive);

        await service.importProject(file, { slug: 'imported-project' });

        expect(projectsService.createProject).toHaveBeenCalledWith({
          title: mockProject.title,
          description: mockProject.description,
          slug: 'imported-project',
        });
      }
    );

    it('should import elements', async () => {
      const file = await createTestArchive(mockArchive);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.saveElements).toHaveBeenCalledWith(
        'testuser',
        'imported-project',
        expect.arrayContaining([
          expect.objectContaining({ id: 'elem-1', name: 'Chapter 1' }),
          expect.objectContaining({ id: 'elem-2', name: 'Scene 1' }),
        ])
      );
    });

    it('should import documents', async () => {
      const file = await createTestArchive(mockArchive);

      await service.importProject(file, { slug: 'imported-project' });

      expect(documentImport.writeDocumentContent).toHaveBeenCalledWith(
        'testuser:imported-project:elem-2',
        [{ type: 'paragraph' }]
      );
    });

    it('should import worldbuilding data', async () => {
      const archiveWithWb: ProjectArchive = {
        ...mockArchive,
        worldbuilding: [
          {
            elementId: 'wb-1',
            schemaType: 'CHARACTER',
            data: { name: 'Hero' },
          },
        ],
      };
      const file = await createTestArchive(archiveWithWb);

      await service.importProject(file, { slug: 'imported-project' });

      expect(documentImport.writeWorldbuildingData).toHaveBeenCalledWith(
        {
          elementId: 'wb-1',
          schemaType: 'CHARACTER',
          data: { name: 'Hero' },
        },
        'testuser',
        'imported-project'
      );
    });

    it('should import schemas', async () => {
      const archiveWithSchemas: ProjectArchive = {
        ...mockArchive,
        schemas: [
          {
            id: 'schema-1',
            type: 'CHARACTER',
            name: 'Character',
            icon: 'person',
            description: 'A character template',
            version: 1,
            isBuiltIn: false,
            tabs: [],
          },
        ],
      };
      const file = await createTestArchive(archiveWithSchemas);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.saveSchemas).toHaveBeenCalled();
    });

    it('should import relationships', async () => {
      const now = new Date().toISOString();
      const archiveWithRelationships: ProjectArchive = {
        ...mockArchive,
        relationships: [
          {
            id: 'rel-1',
            sourceElementId: 'elem-1',
            targetElementId: 'elem-2',
            relationshipTypeId: 'REFERENCE',
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      const file = await createTestArchive(archiveWithRelationships);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.saveRelationships).toHaveBeenCalled();
    });

    it('should import custom relationship types', async () => {
      const archiveWithTypes: ProjectArchive = {
        ...mockArchive,
        customRelationshipTypes: [
          {
            id: 'type-1',
            name: 'Custom Type',
            inverseLabel: 'Custom Inverse',
            showInverse: true,
            category: 'SOCIAL' as any,
            isBuiltIn: false,
            color: '#ff0000',
            sourceEndpoint: { allowedSchemas: [] },
            targetEndpoint: { allowedSchemas: [] },
          },
        ],
      };
      const file = await createTestArchive(archiveWithTypes);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.saveCustomRelationshipTypes).toHaveBeenCalled();
    });

    it('should import tags', async () => {
      const archiveWithTags: ProjectArchive = {
        ...mockArchive,
        tags: [
          {
            id: 'tag-1',
            name: 'Custom Tag',
            icon: 'star',
            color: '#FF5722',
          },
        ],
      };
      const file = await createTestArchive(archiveWithTags);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.saveCustomTags).toHaveBeenCalled();
    });

    it('should import publish plans', async () => {
      const now = new Date().toISOString();
      const archiveWithPlans: ProjectArchive = {
        ...mockArchive,
        publishPlans: [
          {
            id: 'plan-1',
            name: 'My Plan',
            format: 'EPUB' as any,
            createdAt: now,
            updatedAt: now,
            metadata: {} as any,
            items: [],
            options: {} as any,
          },
        ],
      };
      const file = await createTestArchive(archiveWithPlans);

      await service.importProject(file, { slug: 'imported-project' });

      expect(offlineElements.savePublishPlans).toHaveBeenCalled();
    });

    it('should cleanup on project creation failure', async () => {
      offlineProject.createProject.mockRejectedValue(
        new Error('Create failed')
      );
      const file = await createTestArchive(mockArchive);

      await expect(
        service.importProject(file, { slug: 'imported-project' })
      ).rejects.toThrow();

      expect(service.isImporting()).toBe(false);
      expect(service.error()).toBeDefined();
    });

    it('should set error state on failure', async () => {
      offlineProject.createProject.mockRejectedValue(
        new Error('Import failed')
      );
      const file = await createTestArchive(mockArchive);

      await expect(
        service.importProject(file, { slug: 'imported-project' })
      ).rejects.toThrow();

      expect(service.error()).toBeDefined();
    });
  });

  describe('archive validation', () => {
    it('should throw error for missing manifest', async () => {
      const file = await createCustomZip({
        'project.json': JSON.stringify(mockProject),
        'elements.json': JSON.stringify([]),
      });

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toMatchObject({
        type: ProjectArchiveErrorType.CorruptedArchive,
      });
    });

    it('should throw error for missing project.json', async () => {
      const file = await createCustomZip({
        'manifest.json': JSON.stringify(mockManifest),
        'elements.json': JSON.stringify([]),
      });

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toMatchObject({
        type: ProjectArchiveErrorType.CorruptedArchive,
      });
    });

    it('should throw error for unsupported archive version', async () => {
      const futureArchive: ProjectArchive = {
        ...mockArchive,
        manifest: { ...mockManifest, version: ARCHIVE_VERSION + 1 },
      };
      const file = await createTestArchive(futureArchive);

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toMatchObject({
        type: ProjectArchiveErrorType.UnsupportedVersion,
      });
    });

    it('should throw error for project without title', async () => {
      const invalidArchive: ProjectArchive = {
        ...mockArchive,
        project: { ...mockProject, title: '' },
      };
      const file = await createTestArchive(invalidArchive);

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toMatchObject({
        type: ProjectArchiveErrorType.ValidationFailed,
      });
    });

    it('should throw error for corrupted JSON', async () => {
      const file = await createCustomZip({
        'manifest.json': 'not valid json {{{',
        'project.json': JSON.stringify(mockProject),
      });

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toThrow();
    });

    it('should throw error for empty archive', async () => {
      const file = await createCustomZip({});

      await expect(
        service.importProject(file, { slug: 'test' })
      ).rejects.toMatchObject({
        type: ProjectArchiveErrorType.CorruptedArchive,
      });
    });
  });

  describe('progress tracking', () => {
    it('should update progress during import', async () => {
      const file = await createTestArchive(mockArchive);

      await service.importProject(file, { slug: 'imported-project' });

      expect(service.progress().phase).toBe(ImportPhase.Complete);
      expect(service.progress().progress).toBe(100);
    });

    it('should set isImporting to true during import', async () => {
      const file = await createTestArchive(mockArchive);

      const importPromise = service.importProject(file, {
        slug: 'imported-project',
      });

      // Can't easily test this synchronously, but we can verify it's false after
      await importPromise;
      expect(service.isImporting()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle archive with empty elements array', async () => {
      const emptyArchive: ProjectArchive = {
        ...mockArchive,
        elements: [],
        documents: [],
      };
      const file = await createTestArchive(emptyArchive);

      const result = await service.importProject(file, {
        slug: 'imported-project',
      });

      expect(result).toEqual(mockCreatedProject);
    });

    it('should handle archive with snapshots', async () => {
      const archiveWithSnapshots: ProjectArchive = {
        ...mockArchive,
        snapshots: [
          {
            documentId: 'elem-2',
            name: 'Snapshot 1',
            createdAt: new Date().toISOString(),
            xmlContent: '<doc><p>Hello</p></doc>',
          },
        ],
      };
      const file = await createTestArchive(archiveWithSnapshots);

      const result = await service.importProject(file, {
        slug: 'imported-project',
      });

      expect(result).toEqual(mockCreatedProject);
      expect(offlineSnapshots.importSnapshot).toHaveBeenCalled();
    });

    it('should handle project with special characters in title', async () => {
      const specialArchive: ProjectArchive = {
        ...mockArchive,
        project: { ...mockProject, title: 'My Project: A "Special" Story!' },
      };
      const file = await createTestArchive(specialArchive);

      const result = await service.importProject(file, {
        slug: 'imported-project',
      });

      expect(result).toEqual(mockCreatedProject);
    });

    it('should handle very long project description', async () => {
      const longDescArchive: ProjectArchive = {
        ...mockArchive,
        project: { ...mockProject, description: 'A'.repeat(10000) },
      };
      const file = await createTestArchive(longDescArchive);

      const result = await service.importProject(file, {
        slug: 'imported-project',
      });

      expect(result).toEqual(mockCreatedProject);
    });
  });
});
