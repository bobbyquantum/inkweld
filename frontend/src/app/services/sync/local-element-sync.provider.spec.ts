import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import { BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';

import {
  type ElementRelationship,
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  type ElementTag,
  type TagDefinition,
} from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { type MediaProjectTag } from '../../models/media-project-tag.model';
import { type MediaTag } from '../../models/media-tag.model';
import {
  ChapterNumbering,
  PublishFormat,
  type PublishPlan,
} from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { type TimeSystem } from '../../models/time-system';
import { LoggerService } from '../core/logger.service';
import { LocalProjectElementsService } from '../local/local-project-elements.service';
import { type ProjectMeta } from './element-sync-provider.interface';
import { LocalElementSyncProvider } from './local-element-sync.provider';

describe('LocalElementSyncProvider', () => {
  let provider: LocalElementSyncProvider;
  let mockOfflineElementsService: {
    loadElements: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof vi.fn>;
    publishPlans: ReturnType<typeof vi.fn>;
    relationships: ReturnType<typeof vi.fn>;
    customRelationshipTypes: ReturnType<typeof vi.fn>;
    schemas: ReturnType<typeof vi.fn>;
    timeSystems: ReturnType<typeof vi.fn>;
    elementTags: ReturnType<typeof vi.fn>;
    customTags: ReturnType<typeof vi.fn>;
    mediaTags: ReturnType<typeof vi.fn>;
    mediaProjectTags: ReturnType<typeof vi.fn>;
    projectMeta: ReturnType<typeof vi.fn>;
    saveElements: ReturnType<typeof vi.fn>;
    savePublishPlans: ReturnType<typeof vi.fn>;
    saveRelationships: ReturnType<typeof vi.fn>;
    saveCustomRelationshipTypes: ReturnType<typeof vi.fn>;
    saveSchemas: ReturnType<typeof vi.fn>;
    saveTimeSystems: ReturnType<typeof vi.fn>;
    saveElementTags: ReturnType<typeof vi.fn>;
    saveCustomTags: ReturnType<typeof vi.fn>;
    saveMediaTags: ReturnType<typeof vi.fn>;
    saveMediaProjectTags: ReturnType<typeof vi.fn>;
    saveProjectMeta: ReturnType<typeof vi.fn>;
    closeConnection: ReturnType<typeof vi.fn>;
    _elementsSubject: BehaviorSubject<Element[]>;
    _publishPlansSubject: BehaviorSubject<PublishPlan[]>;
    _relationshipsSubject: BehaviorSubject<ElementRelationship[]>;
    _customTypesSubject: BehaviorSubject<RelationshipTypeDefinition[]>;
    _schemasSubject: BehaviorSubject<ElementTypeSchema[]>;
    _timeSystemsSubject: BehaviorSubject<TimeSystem[]>;
    _elementTagsSubject: BehaviorSubject<ElementTag[]>;
    _customTagsSubject: BehaviorSubject<TagDefinition[]>;
    _mediaTagsSubject: BehaviorSubject<MediaTag[]>;
    _mediaProjectTagsSubject: BehaviorSubject<MediaProjectTag[]>;
    _projectMetaSubject: BehaviorSubject<ProjectMeta | undefined>;
    _errorsSubject: Subject<string>;
  };
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    group: ReturnType<typeof vi.fn>;
  };

  const mockElement: Element = {
    id: 'elem-1',
    name: 'Test Element',
    type: ElementType.Folder,
    parentId: null,
    level: 0,
    order: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };
  const mockPublishPlan: PublishPlan = {
    id: 'plan-1',
    name: 'Default Export',
    format: PublishFormat.HTML,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    metadata: {
      title: 'Default Export',
      author: 'Test Author',
      language: 'en',
    },
    items: [],
    options: {
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
      includeToc: true,
      includeCover: false,
      fontFamily: 'Georgia',
      fontSize: 12,
      lineHeight: 1.5,
    },
  };
  const mockRelationship: ElementRelationship = {
    id: 'relationship-1',
    sourceElementId: 'elem-1',
    targetElementId: 'elem-2',
    relationshipTypeId: 'ally',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const mockRelationshipType: RelationshipTypeDefinition = {
    id: 'ally',
    name: 'Ally',
    inverseLabel: 'Allied with',
    showInverse: true,
    category: RelationshipCategory.Social,
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
  };
  const mockSchema: ElementTypeSchema = {
    id: 'schema-1',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
    tabs: [],
  };
  const mockElementTag: ElementTag = {
    id: 'element-tag-1',
    elementId: 'elem-1',
    tagId: 'tag-1',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const mockCustomTag: TagDefinition = {
    id: 'tag-1',
    name: 'Important',
    icon: 'label',
    color: '#ff0000',
  };
  const mockProjectMeta: ProjectMeta = {
    name: 'Project Title',
    description: 'Project Description',
    coverMediaId: 'cover-1',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    const elementsSubject = new BehaviorSubject<Element[]>([]);
    const publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
    const relationshipsSubject = new BehaviorSubject<ElementRelationship[]>([]);
    const customTypesSubject = new BehaviorSubject<
      RelationshipTypeDefinition[]
    >([]);
    const schemasSubject = new BehaviorSubject<ElementTypeSchema[]>([]);
    const timeSystemsSubject = new BehaviorSubject<TimeSystem[]>([]);
    const elementTagsSubject = new BehaviorSubject<ElementTag[]>([]);
    const customTagsSubject = new BehaviorSubject<TagDefinition[]>([]);
    const mediaTagsSubject = new BehaviorSubject<MediaTag[]>([]);
    const mediaProjectTagsSubject = new BehaviorSubject<MediaProjectTag[]>([]);
    const projectMetaSubject = new BehaviorSubject<ProjectMeta | undefined>(
      undefined
    );
    const errorsSubject = new Subject<string>();

    mockOfflineElementsService = {
      loadElements: vi.fn().mockResolvedValue(undefined),
      elements: vi.fn(() => elementsSubject.getValue()),
      publishPlans: vi.fn(() => publishPlansSubject.getValue()),
      relationships: vi.fn(() => relationshipsSubject.getValue()),
      customRelationshipTypes: vi.fn(() => customTypesSubject.getValue()),
      schemas: vi.fn(() => schemasSubject.getValue()),
      timeSystems: vi.fn(() => timeSystemsSubject.getValue()),
      elementTags: vi.fn(() => elementTagsSubject.getValue()),
      customTags: vi.fn(() => customTagsSubject.getValue()),
      mediaTags: vi.fn(() => mediaTagsSubject.getValue()),
      mediaProjectTags: vi.fn(() => mediaProjectTagsSubject.getValue()),
      projectMeta: vi.fn(() => projectMetaSubject.getValue()),
      saveElements: vi.fn().mockResolvedValue(undefined),
      savePublishPlans: vi.fn().mockResolvedValue(undefined),
      saveRelationships: vi.fn().mockResolvedValue(undefined),
      saveCustomRelationshipTypes: vi.fn().mockResolvedValue(undefined),
      saveSchemas: vi.fn().mockResolvedValue(undefined),
      saveTimeSystems: vi.fn().mockResolvedValue(undefined),
      saveElementTags: vi.fn().mockResolvedValue(undefined),
      saveCustomTags: vi.fn().mockResolvedValue(undefined),
      saveMediaTags: vi.fn().mockResolvedValue(undefined),
      saveMediaProjectTags: vi.fn().mockResolvedValue(undefined),
      saveProjectMeta: vi.fn().mockResolvedValue(undefined),
      closeConnection: vi.fn().mockResolvedValue(undefined),
      _elementsSubject: elementsSubject,
      _publishPlansSubject: publishPlansSubject,
      _relationshipsSubject: relationshipsSubject,
      _customTypesSubject: customTypesSubject,
      _schemasSubject: schemasSubject,
      _timeSystemsSubject: timeSystemsSubject,
      _elementTagsSubject: elementTagsSubject,
      _customTagsSubject: customTagsSubject,
      _mediaTagsSubject: mediaTagsSubject,
      _mediaProjectTagsSubject: mediaProjectTagsSubject,
      _projectMetaSubject: projectMetaSubject,
      _errorsSubject: errorsSubject,
    };

    mockLoggerService = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      group: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        LocalElementSyncProvider,
        {
          provide: LocalProjectElementsService,
          useValue: mockOfflineElementsService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    });

    provider = TestBed.inject(LocalElementSyncProvider);
  });

  describe('Initial State', () => {
    it('should start with Unavailable sync state', () => {
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should start with empty elements', () => {
      expect(provider.getElements()).toEqual([]);
    });

    it('should start disconnected', () => {
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('connect()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should connect successfully', async () => {
      const result = await provider.connect(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should load elements from offline storage', async () => {
      await provider.connect(config);

      expect(mockOfflineElementsService.loadElements).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should update sync state to Offline', async () => {
      await provider.connect(config);

      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
    });

    it('should mark as connected', async () => {
      await provider.connect(config);

      expect(provider.isConnected()).toBe(true);
    });

    it('should emit loaded elements', async () => {
      mockOfflineElementsService._elementsSubject.next([mockElement]);
      mockOfflineElementsService.elements.mockReturnValue([mockElement]);

      await provider.connect(config);

      expect(provider.getElements()).toEqual([mockElement]);
    });

    it('should handle connection errors gracefully', async () => {
      mockOfflineElementsService.loadElements.mockRejectedValue(
        new Error('Storage error')
      );

      const result = await provider.connect(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('disconnect()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should disconnect and reset state', async () => {
      await provider.connect(config);

      provider.disconnect();

      expect(provider.isConnected()).toBe(false);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should clear elements on disconnect', async () => {
      mockOfflineElementsService._elementsSubject.next([mockElement]);
      mockOfflineElementsService.elements.mockReturnValue([mockElement]);
      await provider.connect(config);

      provider.disconnect();

      expect(provider.getElements()).toEqual([]);
    });

    it('should close the active offline connection when disconnecting', async () => {
      await provider.connect(config);

      provider.disconnect();

      expect(mockOfflineElementsService.closeConnection).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });
  });

  describe('updateElements()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should save elements to offline storage', async () => {
      await provider.connect(config);

      const elements = [mockElement];
      provider.updateElements(elements);

      expect(mockOfflineElementsService.saveElements).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        elements
      );
    });

    it('should update local state immediately (optimistic update)', async () => {
      await provider.connect(config);

      const elements = [mockElement];
      provider.updateElements(elements);

      // State should be updated synchronously (optimistic update)
      expect(provider.getElements()).toEqual(elements);
    });

    it('should warn if not connected', () => {
      provider.updateElements([mockElement]);

      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should surface save errors when persisting elements fails', async () => {
      const errors: string[] = [];
      const subscription = provider.errors$.subscribe(error => {
        errors.push(error);
      });
      mockOfflineElementsService.saveElements.mockRejectedValue(
        new Error('elements failed')
      );

      await provider.connect(config);
      provider.updateElements([mockElement]);
      await Promise.resolve();
      await Promise.resolve();

      subscription.unsubscribe();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save elements',
        expect.any(Error)
      );
      expect(errors).toContain('Failed to save elements offline');
    });
  });

  describe('Observables', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should emit sync state changes', async () => {
      const states: DocumentSyncState[] = [];
      const sub = provider.syncState$.subscribe(state => states.push(state));

      await provider.connect(config);
      provider.disconnect();

      sub.unsubscribe();

      expect(states).toContain(DocumentSyncState.Unavailable);
      expect(states).toContain(DocumentSyncState.Local);
    });

    it('should emit element changes immediately', async () => {
      await provider.connect(config);

      provider.updateElements([mockElement]);

      // Elements should be updated synchronously
      const elements = provider.getElements();
      expect(elements).toEqual([mockElement]);
    });
  });

  describe('other update methods', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    beforeEach(async () => {
      await provider.connect(config);
    });

    it('should save publish plans and update local state immediately', async () => {
      provider.updatePublishPlans([mockPublishPlan]);
      await Promise.resolve();

      expect(provider.getPublishPlans()).toEqual([mockPublishPlan]);
      expect(mockOfflineElementsService.savePublishPlans).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        [mockPublishPlan]
      );
    });

    it('should save relationships and custom relationship types', async () => {
      provider.updateRelationships([mockRelationship]);
      provider.updateCustomRelationshipTypes([mockRelationshipType]);
      await Promise.resolve();

      expect(provider.getRelationships()).toEqual([mockRelationship]);
      expect(provider.getCustomRelationshipTypes()).toEqual([
        mockRelationshipType,
      ]);
      expect(mockOfflineElementsService.saveRelationships).toHaveBeenCalled();
      expect(
        mockOfflineElementsService.saveCustomRelationshipTypes
      ).toHaveBeenCalled();
    });

    it('should save schemas, element tags, and custom tags', async () => {
      provider.updateSchemas([mockSchema]);
      provider.updateElementTags([mockElementTag]);
      provider.updateCustomTags([mockCustomTag]);
      await Promise.resolve();

      expect(provider.getSchemas()).toEqual([mockSchema]);
      expect(provider.getElementTags()).toEqual([mockElementTag]);
      expect(provider.getCustomTags()).toEqual([mockCustomTag]);
      expect(mockOfflineElementsService.saveSchemas).toHaveBeenCalled();
      expect(mockOfflineElementsService.saveElementTags).toHaveBeenCalled();
      expect(mockOfflineElementsService.saveCustomTags).toHaveBeenCalled();
    });

    it('should merge and save project metadata updates', async () => {
      mockOfflineElementsService._projectMetaSubject.next(mockProjectMeta);
      mockOfflineElementsService.projectMeta.mockReturnValue(mockProjectMeta);

      await provider.connect(config);
      provider.updateProjectMeta({ description: 'Updated Description' });
      await Promise.resolve();

      expect(provider.getProjectMeta()).toMatchObject({
        name: 'Project Title',
        description: 'Updated Description',
        coverMediaId: 'cover-1',
      });
      expect(mockOfflineElementsService.saveProjectMeta).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.objectContaining({
          name: 'Project Title',
          description: 'Updated Description',
          coverMediaId: 'cover-1',
        })
      );
    });
  });

  describe('error handling for update methods', () => {
    it('should warn for each update path when disconnected', () => {
      provider.updatePublishPlans([mockPublishPlan]);
      provider.updateRelationships([mockRelationship]);
      provider.updateCustomRelationshipTypes([mockRelationshipType]);
      provider.updateSchemas([mockSchema]);
      provider.updateElementTags([mockElementTag]);
      provider.updateCustomTags([mockCustomTag]);
      provider.updateProjectMeta({ name: 'Ignored' });

      expect(mockLoggerService.warn).toHaveBeenCalledTimes(7);
    });

    it('should surface save errors for the remaining update methods', async () => {
      const errors: string[] = [];
      const subscription = provider.errors$.subscribe(error => {
        errors.push(error);
      });
      mockOfflineElementsService.savePublishPlans.mockRejectedValue(
        new Error('plans failed')
      );
      mockOfflineElementsService.saveRelationships.mockRejectedValue(
        new Error('relationships failed')
      );
      mockOfflineElementsService.saveCustomRelationshipTypes.mockRejectedValue(
        new Error('custom types failed')
      );
      mockOfflineElementsService.saveSchemas.mockRejectedValue(
        new Error('schemas failed')
      );
      mockOfflineElementsService.saveElementTags.mockRejectedValue(
        new Error('element tags failed')
      );
      mockOfflineElementsService.saveCustomTags.mockRejectedValue(
        new Error('custom tags failed')
      );
      mockOfflineElementsService.saveProjectMeta.mockRejectedValue(
        new Error('project meta failed')
      );

      await provider.connect({ username: 'testuser', slug: 'test-project' });

      provider.updatePublishPlans([mockPublishPlan]);
      provider.updateRelationships([mockRelationship]);
      provider.updateCustomRelationshipTypes([mockRelationshipType]);
      provider.updateSchemas([mockSchema]);
      provider.updateElementTags([mockElementTag]);
      provider.updateCustomTags([mockCustomTag]);
      provider.updateProjectMeta({ name: 'Broken Save' });

      await Promise.resolve();
      await Promise.resolve();

      subscription.unsubscribe();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save publish plans',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save relationships',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save custom relationship types',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save schemas',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save element tags',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save custom tags',
        expect.any(Error)
      );
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'OfflineSync',
        'Failed to save project metadata',
        expect.any(Error)
      );
      expect(errors).toEqual(
        expect.arrayContaining([
          'Failed to save publish plans offline',
          'Failed to save relationships offline',
          'Failed to save custom relationship types offline',
          'Failed to save schemas offline',
          'Failed to save element tags offline',
          'Failed to save custom tags offline',
          'Failed to save project metadata offline',
        ])
      );
    });
  });

  describe('Media Tags', () => {
    const config = { username: 'testuser', slug: 'test-project' };
    const sampleMediaTags: MediaTag[] = [
      {
        id: 'mt-1',
        mediaId: 'media-1',
        elementId: 'elem-1',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];
    const sampleMediaProjectTags: MediaProjectTag[] = [
      {
        id: 'mpt-1',
        mediaId: 'media-1',
        tagId: 'tag-1',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];

    it('should return empty media tags initially', () => {
      expect(provider.getMediaTags()).toEqual([]);
    });

    it('should return empty media project tags initially', () => {
      expect(provider.getMediaProjectTags()).toEqual([]);
    });

    it('should update media tags and save to offline storage', async () => {
      await provider.connect(config);

      provider.updateMediaTags(sampleMediaTags);

      expect(provider.getMediaTags()).toEqual(sampleMediaTags);
      // Wait for the async save
      await vi.waitFor(() => {
        expect(mockOfflineElementsService.saveMediaTags).toHaveBeenCalledWith(
          'testuser',
          'test-project',
          sampleMediaTags
        );
      });
    });

    it('should update media project tags and save to offline storage', async () => {
      await provider.connect(config);

      provider.updateMediaProjectTags(sampleMediaProjectTags);

      expect(provider.getMediaProjectTags()).toEqual(sampleMediaProjectTags);
      await vi.waitFor(() => {
        expect(
          mockOfflineElementsService.saveMediaProjectTags
        ).toHaveBeenCalledWith(
          'testuser',
          'test-project',
          sampleMediaProjectTags
        );
      });
    });

    it('should warn when updating media tags while not connected', () => {
      provider.updateMediaTags(sampleMediaTags);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'OfflineSync',
        'Cannot update media tags - not connected'
      );
      expect(mockOfflineElementsService.saveMediaTags).not.toHaveBeenCalled();
    });

    it('should warn when updating media project tags while not connected', () => {
      provider.updateMediaProjectTags(sampleMediaProjectTags);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'OfflineSync',
        'Cannot update media project tags - not connected'
      );
      expect(
        mockOfflineElementsService.saveMediaProjectTags
      ).not.toHaveBeenCalled();
    });

    it('should emit media tags via observable', async () => {
      await provider.connect(config);

      const emitted: MediaTag[][] = [];
      provider.mediaTags$.subscribe(tags => emitted.push(tags));

      provider.updateMediaTags(sampleMediaTags);

      expect(emitted).toContainEqual(sampleMediaTags);
    });

    it('should emit media project tags via observable', async () => {
      await provider.connect(config);

      const emitted: MediaProjectTag[][] = [];
      provider.mediaProjectTags$.subscribe(tags => emitted.push(tags));

      provider.updateMediaProjectTags(sampleMediaProjectTags);

      expect(emitted).toContainEqual(sampleMediaProjectTags);
    });

    it('should handle save error for media tags', async () => {
      await provider.connect(config);

      mockOfflineElementsService.saveMediaTags.mockRejectedValueOnce(
        new Error('Save failed')
      );

      provider.updateMediaTags(sampleMediaTags);

      await vi.waitFor(() => {
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'OfflineSync',
          'Failed to save media tags',
          expect.any(Error)
        );
      });
    });

    it('should handle save error for media project tags', async () => {
      await provider.connect(config);

      mockOfflineElementsService.saveMediaProjectTags.mockRejectedValueOnce(
        new Error('Save failed')
      );

      provider.updateMediaProjectTags(sampleMediaProjectTags);

      await vi.waitFor(() => {
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'OfflineSync',
          'Failed to save media project tags',
          expect.any(Error)
        );
      });
    });
  });

  describe('pinnedElementIds in projectMeta', () => {
    const localConfig = { username: 'testuser', slug: 'test-project' };

    it('should merge pinnedElementIds when updating project meta', async () => {
      const metaWithPins: ProjectMeta = {
        ...mockProjectMeta,
        pinnedElementIds: ['elem-1'],
      };
      mockOfflineElementsService._projectMetaSubject.next(metaWithPins);
      mockOfflineElementsService.projectMeta.mockReturnValue(metaWithPins);

      await provider.connect(localConfig);
      provider.updateProjectMeta({ pinnedElementIds: ['elem-1', 'elem-2'] });
      await Promise.resolve();

      expect(provider.getProjectMeta()?.pinnedElementIds).toEqual([
        'elem-1',
        'elem-2',
      ]);
      expect(mockOfflineElementsService.saveProjectMeta).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.objectContaining({ pinnedElementIds: ['elem-1', 'elem-2'] })
      );
    });

    it('should preserve existing pinnedElementIds when meta update omits the field', async () => {
      const metaWithPins: ProjectMeta = {
        ...mockProjectMeta,
        pinnedElementIds: ['elem-1'],
      };
      mockOfflineElementsService._projectMetaSubject.next(metaWithPins);
      mockOfflineElementsService.projectMeta.mockReturnValue(metaWithPins);

      await provider.connect(localConfig);
      provider.updateProjectMeta({ description: 'New Description' });
      await Promise.resolve();

      expect(provider.getProjectMeta()?.pinnedElementIds).toEqual(['elem-1']);
    });
  });
});
