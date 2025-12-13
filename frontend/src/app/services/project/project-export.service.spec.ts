import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType, ImagesService } from '@inkweld/index';
import JSZip from '@progress/jszip-esm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import {
  ElementRelationship,
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  ARCHIVE_VERSION,
  ArchiveManifest,
  ArchiveProject,
  ExportPhase,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../../models/project-archive';
import {
  DEFAULT_PUBLISH_METADATA,
  DEFAULT_PUBLISH_OPTIONS,
  PublishFormat,
  PublishPlan,
} from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { OfflineSnapshotService } from '../offline/offline-snapshot.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { DocumentService } from './document.service';
import { ProjectExportService } from './project-export.service';
import { ProjectStateService } from './project-state.service';

/**
 * Tests for ProjectExportService.
 *
 * These tests use real JSZip to verify the export functionality.
 * We intercept the download mechanism to capture the generated ZIP and verify its contents.
 */
describe('ProjectExportService', () => {
  let service: ProjectExportService;
  let logger: DeepMockProxy<LoggerService>;
  let projectState: DeepMockProxy<ProjectStateService>;
  let documentService: DeepMockProxy<DocumentService>;
  let worldbuildingService: DeepMockProxy<WorldbuildingService>;
  let offlineElements: DeepMockProxy<OfflineProjectElementsService>;
  let offlineStorage: DeepMockProxy<OfflineStorageService>;
  let offlineSnapshots: DeepMockProxy<OfflineSnapshotService>;
  let syncFactory: DeepMockProxy<ElementSyncProviderFactory>;
  let imagesService: DeepMockProxy<ImagesService>;

  // Capture the generated ZIP blob for verification
  let capturedBlob: Blob | null = null;

  const mockProject = {
    id: 'proj-1',
    title: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockElements: Element[] = [
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
    {
      id: 'elem-3',
      name: 'Hero Character',
      type: ElementType.Character,
      order: 0,
      level: 0,
      parentId: null,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  /**
   * Helper to read the captured ZIP and parse a JSON file from it.
   */
  async function readJsonFromZip<T>(filename: string): Promise<T> {
    if (!capturedBlob) {
      throw new Error('No ZIP blob captured');
    }
    const zip = new JSZip();
    await zip.loadAsync(capturedBlob);
    const file = zip.file(filename);
    if (!file) {
      throw new Error(`File ${filename} not found in ZIP`);
    }
    const content = await file.async('string');
    return JSON.parse(content) as T;
  }

  /**
   * Helper to check if a file exists in the captured ZIP.
   */
  async function fileExistsInZip(filename: string): Promise<boolean> {
    if (!capturedBlob) {
      return false;
    }
    const zip = new JSZip();
    await zip.loadAsync(capturedBlob);
    return zip.file(filename) !== null;
  }

  /**
   * Helper to get a blob from the captured ZIP.
   */
  async function getBlobFromZip(filename: string): Promise<Blob | null> {
    if (!capturedBlob) {
      return null;
    }
    const zip = new JSZip();
    await zip.loadAsync(capturedBlob);
    const file = zip.file(filename);
    if (!file) {
      return null;
    }
    return await file.async('blob');
  }

  beforeEach(() => {
    capturedBlob = null;

    logger = mockDeep<LoggerService>();
    projectState = mockDeep<ProjectStateService>();
    documentService = mockDeep<DocumentService>();
    worldbuildingService = mockDeep<WorldbuildingService>();
    offlineElements = mockDeep<OfflineProjectElementsService>();
    offlineStorage = mockDeep<OfflineStorageService>();
    offlineSnapshots = mockDeep<OfflineSnapshotService>();
    syncFactory = mockDeep<ElementSyncProviderFactory>();
    imagesService = mockDeep<ImagesService>();

    // Setup default mocks
    projectState.project.mockReturnValue(mockProject);
    projectState.elements.mockReturnValue(mockElements);
    syncFactory.isOfflineMode.mockReturnValue(true);
    offlineElements.elements.mockReturnValue(mockElements);
    offlineElements.schemas.mockReturnValue([]);
    offlineElements.relationships.mockReturnValue([]);
    offlineElements.customRelationshipTypes.mockReturnValue([]);
    offlineElements.publishPlans.mockReturnValue([]);
    offlineElements.loadElements.mockResolvedValue(undefined);
    offlineStorage.listMedia.mockResolvedValue([]);
    offlineSnapshots.getSnapshotsForExport.mockResolvedValue([]);
    documentService.getDocumentContent.mockResolvedValue(null);
    worldbuildingService.getWorldbuildingData.mockResolvedValue(null);

    // Mock DOM methods to capture the generated blob
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (obj: Blob | MediaSource) => {
        if (obj instanceof Blob) {
          capturedBlob = obj;
        }
        return 'blob:test';
      }
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock the anchor element for download
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      mockAnchor as unknown as HTMLElement
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => null as unknown as Node
    );
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      () => null as unknown as Node
    );

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectExportService,
        { provide: LoggerService, useValue: logger },
        { provide: ProjectStateService, useValue: projectState },
        { provide: DocumentService, useValue: documentService },
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: OfflineProjectElementsService, useValue: offlineElements },
        { provide: OfflineStorageService, useValue: offlineStorage },
        { provide: OfflineSnapshotService, useValue: offlineSnapshots },
        { provide: ElementSyncProviderFactory, useValue: syncFactory },
        { provide: ImagesService, useValue: imagesService },
      ],
    });

    service = TestBed.inject(ProjectExportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with correct default values', () => {
      expect(service.progress().phase).toBe(ExportPhase.Initializing);
      expect(service.progress().progress).toBe(0);
      expect(service.isExporting()).toBe(false);
      expect(service.error()).toBeUndefined();
    });
  });

  describe('exportProject', () => {
    it('should throw error when no project is loaded', async () => {
      projectState.project.mockReturnValue(undefined);

      await expect(service.exportProject()).rejects.toThrow(
        ProjectArchiveError
      );
      await expect(service.exportProject()).rejects.toMatchObject({
        type: ProjectArchiveErrorType.ValidationFailed,
      });
    });

    it('should throw error when project has no username', async () => {
      projectState.project.mockReturnValue({ ...mockProject, username: '' });

      await expect(service.exportProject()).rejects.toThrow(
        ProjectArchiveError
      );
    });

    it('should throw error when project has no slug', async () => {
      projectState.project.mockReturnValue({ ...mockProject, slug: '' });

      await expect(service.exportProject()).rejects.toThrow(
        ProjectArchiveError
      );
    });

    it('should export project successfully in offline mode', async () => {
      await service.exportProject();

      expect(service.isExporting()).toBe(false);
      expect(service.error()).toBeUndefined();
      expect(service.progress().phase).toBe(ExportPhase.Complete);
      expect(service.progress().progress).toBe(100);
    });

    it('should set isExporting during export', async () => {
      let wasExporting = false;

      // Check isExporting is set during export
      offlineStorage.listMedia.mockImplementation(() => {
        wasExporting = service.isExporting();
        return Promise.resolve([]);
      });

      await service.exportProject();

      expect(wasExporting).toBe(true);
      expect(service.isExporting()).toBe(false);
    });

    it('should create ZIP with all required JSON files', async () => {
      await service.exportProject();

      expect(capturedBlob).not.toBeNull();

      // Verify all required files exist in the ZIP
      expect(await fileExistsInZip('manifest.json')).toBe(true);
      expect(await fileExistsInZip('project.json')).toBe(true);
      expect(await fileExistsInZip('elements.json')).toBe(true);
      expect(await fileExistsInZip('documents.json')).toBe(true);
      expect(await fileExistsInZip('worldbuilding.json')).toBe(true);
      expect(await fileExistsInZip('schemas.json')).toBe(true);
      expect(await fileExistsInZip('relationships.json')).toBe(true);
      expect(await fileExistsInZip('relationship-types.json')).toBe(true);
      expect(await fileExistsInZip('publish-plans.json')).toBe(true);
      expect(await fileExistsInZip('media-index.json')).toBe(true);
    });

    it('should include correct manifest data', async () => {
      await service.exportProject();

      const manifest = await readJsonFromZip<ArchiveManifest>('manifest.json');
      expect(manifest.version).toBe(ARCHIVE_VERSION);
      expect(manifest.projectTitle).toBe(mockProject.title);
      expect(manifest.originalSlug).toBe(mockProject.slug);
      expect(manifest.exportedAt).toBeDefined();
    });

    it('should include correct project data', async () => {
      await service.exportProject();

      const project = await readJsonFromZip<ArchiveProject>('project.json');
      expect(project.title).toBe(mockProject.title);
      expect(project.description).toBe(mockProject.description);
      expect(project.slug).toBe(mockProject.slug);
    });

    it('should include all elements in archive', async () => {
      await service.exportProject();

      const elements =
        await readJsonFromZip<Array<{ id: string; name: string }>>(
          'elements.json'
        );
      expect(elements).toHaveLength(mockElements.length);
      expect(elements[0].id).toBe('elem-1');
      expect(elements[0].name).toBe('Chapter 1');
    });

    it('should export document content for ITEM elements', async () => {
      const docContent = [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ];
      documentService.getDocumentContent.mockResolvedValue(docContent);

      await service.exportProject();

      expect(documentService.getDocumentContent).toHaveBeenCalledWith(
        'testuser:test-project:elem-2'
      );

      const documents =
        await readJsonFromZip<Array<{ elementId: string; content: unknown }>>(
          'documents.json'
        );
      expect(documents).toHaveLength(1);
      expect(documents[0].elementId).toBe('elem-2');
      expect(documents[0].content).toEqual(docContent);
    });

    it('should export worldbuilding data for CHARACTER elements', async () => {
      const wbData = { name: 'Hero', traits: ['brave'] };
      worldbuildingService.getWorldbuildingData.mockResolvedValue(wbData);

      await service.exportProject();

      expect(worldbuildingService.getWorldbuildingData).toHaveBeenCalledWith(
        'elem-3',
        'testuser',
        'test-project'
      );

      const worldbuilding =
        await readJsonFromZip<Array<{ elementId: string }>>(
          'worldbuilding.json'
        );
      expect(worldbuilding).toHaveLength(1);
      expect(worldbuilding[0].elementId).toBe('elem-3');
    });

    it('should handle document content retrieval errors gracefully', async () => {
      documentService.getDocumentContent.mockRejectedValue(new Error('Failed'));

      await service.exportProject();

      expect(logger.warn).toHaveBeenCalled();
      expect(service.error()).toBeUndefined();
    });

    it('should handle worldbuilding data retrieval errors gracefully', async () => {
      worldbuildingService.getWorldbuildingData.mockRejectedValue(
        new Error('Failed')
      );

      await service.exportProject();

      expect(logger.warn).toHaveBeenCalled();
      expect(service.error()).toBeUndefined();
    });

    it('should include media files in archive', async () => {
      const mediaInfo = {
        mediaId: 'cover',
        mimeType: 'image/jpeg',
        size: 1024,
        filename: 'cover.jpg',
        createdAt: new Date().toISOString(),
      };
      offlineStorage.listMedia.mockResolvedValue([mediaInfo]);
      offlineStorage.getMedia.mockResolvedValue(
        new Blob(['test-image-data'], { type: 'image/jpeg' })
      );

      await service.exportProject();

      expect(offlineStorage.getMedia).toHaveBeenCalledWith(
        'testuser/test-project',
        'cover'
      );

      // Verify the media file exists in the ZIP
      expect(await fileExistsInZip('media/cover.jpg')).toBe(true);
      const mediaBlob = await getBlobFromZip('media/cover.jpg');
      expect(mediaBlob).not.toBeNull();
    });

    it('should set error on failure', async () => {
      offlineElements.loadElements.mockRejectedValue(
        new Error('Storage error')
      );

      await expect(service.exportProject()).rejects.toThrow();

      expect(service.error()).toBe('Storage error');
    });

    it('should wrap non-ProjectArchiveError in ProjectArchiveError', async () => {
      offlineStorage.listMedia.mockRejectedValue(new Error('Generic error'));

      await expect(service.exportProject()).rejects.toMatchObject({
        type: ProjectArchiveErrorType.StorageError,
      });
    });

    it('should pass through ProjectArchiveError unchanged', async () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.SyncRequired,
        'Sync required'
      );
      offlineStorage.listMedia.mockRejectedValue(error);

      await expect(service.exportProject()).rejects.toMatchObject({
        type: ProjectArchiveErrorType.SyncRequired,
      });
    });
  });

  describe('server mode export', () => {
    beforeEach(() => {
      syncFactory.isOfflineMode.mockReturnValue(false);
    });

    it('should check for unsynced documents in server mode', async () => {
      documentService.hasUnsyncedChanges.mockReturnValue(false);

      await service.exportProject();

      expect(documentService.hasUnsyncedChanges).toHaveBeenCalled();
    });

    it('should throw error if documents have unsynced changes', async () => {
      documentService.hasUnsyncedChanges.mockReturnValue(true);

      await expect(service.exportProject()).rejects.toMatchObject({
        type: ProjectArchiveErrorType.SyncRequired,
      });
    });
  });

  describe('progress tracking', () => {
    it('should update progress through all phases', async () => {
      await service.exportProject();

      expect(service.progress().phase).toBe(ExportPhase.Complete);
    });
  });

  describe('getExtensionFromMimeType', () => {
    it('should return correct extensions for known mime types', async () => {
      const mediaList = [
        {
          mediaId: 'img1',
          mimeType: 'image/jpeg',
          size: 100,
          filename: 'test.jpg',
          createdAt: new Date().toISOString(),
        },
        {
          mediaId: 'img2',
          mimeType: 'image/png',
          size: 100,
          filename: 'test.png',
          createdAt: new Date().toISOString(),
        },
        {
          mediaId: 'img3',
          mimeType: 'image/gif',
          size: 100,
          filename: 'test.gif',
          createdAt: new Date().toISOString(),
        },
        {
          mediaId: 'img4',
          mimeType: 'image/webp',
          size: 100,
          filename: 'test.webp',
          createdAt: new Date().toISOString(),
        },
      ];
      offlineStorage.listMedia.mockResolvedValue(mediaList);
      offlineStorage.getMedia.mockResolvedValue(
        new Blob(['test-image'], { type: 'image/jpeg' })
      );

      await service.exportProject();

      // Verify all media files have correct extensions in the ZIP
      expect(await fileExistsInZip('media/img1.jpg')).toBe(true);
      expect(await fileExistsInZip('media/img2.png')).toBe(true);
      expect(await fileExistsInZip('media/img3.gif')).toBe(true);
      expect(await fileExistsInZip('media/img4.webp')).toBe(true);
    });
  });

  describe('snapshots export', () => {
    it('should include snapshots in archive when present', async () => {
      const mockSnapshots = [
        {
          id: 'testuser/test-project:elem-2:snap-uuid',
          projectKey: 'testuser/test-project',
          documentId: 'elem-2',
          name: 'Draft 1',
          xmlContent: '<doc><p>Hello World</p></doc>',
          createdAt: new Date().toISOString(),
          synced: false,
        },
      ];
      offlineSnapshots.getSnapshotsForExport.mockResolvedValue(mockSnapshots);

      await service.exportProject();

      expect(await fileExistsInZip('snapshots.json')).toBe(true);
      const snapshots =
        await readJsonFromZip<Array<{ documentId: string }>>('snapshots.json');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].documentId).toBe('elem-2');
    });

    it('should not include snapshots.json when no snapshots exist', async () => {
      offlineSnapshots.getSnapshotsForExport.mockResolvedValue([]);

      await service.exportProject();

      expect(await fileExistsInZip('snapshots.json')).toBe(false);
    });
  });

  describe('schemas and relationships export', () => {
    it('should include schemas in archive', async () => {
      const mockSchemas = [
        {
          id: 'schema-1',
          type: 'CHARACTER',
          name: 'Character Template',
          icon: 'person',
          description: 'A character',
          version: 1,
          isBuiltIn: false,
          tabs: [],
        },
      ] as ElementTypeSchema[];
      offlineElements.schemas.mockReturnValue(mockSchemas);

      await service.exportProject();

      const schemas =
        await readJsonFromZip<Array<{ id: string }>>('schemas.json');
      expect(schemas).toHaveLength(1);
      expect(schemas[0].id).toBe('schema-1');
    });

    it('should include relationships in archive', async () => {
      const now = new Date().toISOString();
      const mockRelationships = [
        {
          id: 'rel-1',
          sourceElementId: 'elem-1',
          targetElementId: 'elem-2',
          relationshipTypeId: 'REFERENCE',
          createdAt: now,
          updatedAt: now,
        },
      ] as ElementRelationship[];
      offlineElements.relationships.mockReturnValue(mockRelationships);

      await service.exportProject();

      const relationships =
        await readJsonFromZip<Array<{ id: string }>>('relationships.json');
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe('rel-1');
    });

    it('should include custom relationship types in archive', async () => {
      const mockTypes = [
        {
          id: 'type-1',
          name: 'Custom Type',
          inverseLabel: 'Custom Inverse',
          showInverse: true,
          category: RelationshipCategory.Social,
          isBuiltIn: false,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        },
      ] as RelationshipTypeDefinition[];
      offlineElements.customRelationshipTypes.mockReturnValue(mockTypes);

      await service.exportProject();

      const types = await readJsonFromZip<Array<{ id: string }>>(
        'relationship-types.json'
      );
      expect(types).toHaveLength(1);
      expect(types[0].id).toBe('type-1');
    });

    it('should include publish plans in archive', async () => {
      const now = new Date().toISOString();
      const mockPlans: PublishPlan[] = [
        {
          id: 'plan-1',
          name: 'Blog Post',
          format: PublishFormat.EPUB,
          createdAt: now,
          updatedAt: now,
          metadata: { ...DEFAULT_PUBLISH_METADATA, title: 'Test' },
          items: [],
          options: DEFAULT_PUBLISH_OPTIONS,
        },
      ];
      offlineElements.publishPlans.mockReturnValue(mockPlans);

      await service.exportProject();

      const plans =
        await readJsonFromZip<Array<{ id: string }>>('publish-plans.json');
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('plan-1');
    });
  });
});
