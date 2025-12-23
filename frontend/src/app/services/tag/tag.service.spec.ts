import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import { ElementTag, TagDefinition } from '../../components/tags/tag.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { TagService } from './tag.service';

// Mock tag definitions for testing (simulates what templates would provide)
const MOCK_PROJECT_TAGS: TagDefinition[] = [
  {
    id: 'protagonist',
    name: 'Protagonist',
    icon: 'star',
    color: '#FFD700',
    description: 'Main character',
  },
  {
    id: 'antagonist',
    name: 'Antagonist',
    icon: 'whatshot',
    color: '#DC143C',
  },
  {
    id: 'complete',
    name: 'Complete',
    icon: 'check_circle',
    color: '#228B22',
  },
  {
    id: 'in-progress',
    name: 'In Progress',
    icon: 'pending',
    color: '#FF8C00',
  },
  {
    id: 'important',
    name: 'Important',
    icon: 'priority_high',
    color: '#FF4500',
  },
];

describe('TagService', () => {
  let service: TagService;
  let mockSyncProvider: IElementSyncProvider & {
    getElementTags: MockInstance;
    getCustomTags: MockInstance;
    updateElementTags: MockInstance;
    updateCustomTags: MockInstance;
  };
  let elementTagsSubject: BehaviorSubject<ElementTag[]>;
  let customTagsSubject: BehaviorSubject<TagDefinition[]>;

  const mockElementTags: ElementTag[] = [
    {
      id: 'et1',
      elementId: 'elem1',
      tagId: 'protagonist',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'et2',
      elementId: 'elem1',
      tagId: 'complete',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'et3',
      elementId: 'elem2',
      tagId: 'protagonist',
      createdAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockCustomTag: TagDefinition = {
    id: 'custom-tag-1',
    name: 'My Custom Tag',
    icon: 'star',
    color: '#FF5722',
    description: 'A custom tag',
  };

  beforeEach(() => {
    elementTagsSubject = new BehaviorSubject<ElementTag[]>([]);
    customTagsSubject = new BehaviorSubject<TagDefinition[]>([]);

    mockSyncProvider = {
      elements$: of([]),
      relationships$: of([]),
      relationshipSubjects$: of([]),
      elementTags$: elementTagsSubject.asObservable(),
      customTags$: customTagsSubject.asObservable(),
      getElements: vi.fn().mockReturnValue([]),
      getRelationships: vi.fn().mockReturnValue([]),
      getRelationshipSubjects: vi.fn().mockReturnValue([]),
      getElementTags: vi.fn().mockReturnValue([]),
      getCustomTags: vi.fn().mockReturnValue([]),
      updateElement: vi.fn(),
      updateElements: vi.fn(),
      updateRelationships: vi.fn(),
      updateRelationshipSubjects: vi.fn(),
      updateElementTags: vi.fn(),
      updateCustomTags: vi.fn(),
    } as unknown as IElementSyncProvider & {
      getElementTags: MockInstance;
      getCustomTags: MockInstance;
      updateElementTags: MockInstance;
      updateCustomTags: MockInstance;
    };

    const mockFactory = {
      getProvider: () => mockSyncProvider,
    };

    const mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        TagService,
        { provide: ElementSyncProviderFactory, useValue: mockFactory },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ProjectStateService, useValue: {} },
      ],
    });

    service = TestBed.inject(TagService);
  });

  describe('initialization', () => {
    it('should create the service', () => {
      expect(service).toBeTruthy();
    });

    it('should subscribe to elementTags$ from sync provider', () => {
      elementTagsSubject.next(mockElementTags);
      expect(service.elementTags()).toEqual(mockElementTags);
    });

    it('should subscribe to customTags$ from sync provider', () => {
      customTagsSubject.next([mockCustomTag]);
      expect(service.customTags()).toEqual([mockCustomTag]);
    });
  });

  describe('allTags computed', () => {
    it('should return tags from customTags', () => {
      customTagsSubject.next(MOCK_PROJECT_TAGS);
      const allTags = service.allTags();
      expect(allTags.length).toBe(MOCK_PROJECT_TAGS.length);
    });

    it('should return empty when no tags exist', () => {
      customTagsSubject.next([]);
      const allTags = service.allTags();
      expect(allTags.length).toBe(0);
    });

    it('should include additional custom tags', () => {
      customTagsSubject.next([...MOCK_PROJECT_TAGS, mockCustomTag]);
      const allTags = service.allTags();
      expect(allTags).toContainEqual(mockCustomTag);
      expect(allTags.length).toBe(MOCK_PROJECT_TAGS.length + 1);
    });
  });

  describe('tagIndex computed', () => {
    it('should compute tag counts', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      elementTagsSubject.next(mockElementTags);
      customTagsSubject.next(MOCK_PROJECT_TAGS);

      const index = service.tagIndex();
      const protagonistEntry = index.find(
        e => e.definition.id === 'protagonist'
      );
      expect(protagonistEntry?.count).toBe(2);
      expect(protagonistEntry?.elementIds).toContain('elem1');
      expect(protagonistEntry?.elementIds).toContain('elem2');
    });

    it('should include zero counts for unused tags', () => {
      elementTagsSubject.next([]);
      customTagsSubject.next(MOCK_PROJECT_TAGS);

      const index = service.tagIndex();
      expect(index.length).toBe(MOCK_PROJECT_TAGS.length);
      expect(index.every(e => e.count === 0)).toBe(true);
    });
  });

  describe('getAllElementTags', () => {
    it('should return all element tags from sync provider', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      expect(service.getAllElementTags()).toEqual(mockElementTags);
    });
  });

  describe('getTagsForElement', () => {
    it('should return tags for a specific element', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      const tags = service.getTagsForElement('elem1');
      expect(tags.length).toBe(2);
      expect(tags.every(t => t.elementId === 'elem1')).toBe(true);
    });

    it('should return empty array for element with no tags', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      const tags = service.getTagsForElement('nonexistent');
      expect(tags).toEqual([]);
    });
  });

  describe('getResolvedTagsForElement', () => {
    it('should return resolved tags with definitions', () => {
      // Push values to subjects so signals are updated
      elementTagsSubject.next(mockElementTags);
      customTagsSubject.next(MOCK_PROJECT_TAGS);

      const resolved = service.getResolvedTagsForElement('elem1');
      expect(resolved.length).toBe(2);
      expect(resolved[0].definition).toBeDefined();
      expect(resolved[0].assignment).toBeDefined();
    });

    it('should filter out tags without definitions', () => {
      // Push values to subjects so signals are updated
      elementTagsSubject.next(mockElementTags);
      customTagsSubject.next([]); // No tags defined

      const resolved = service.getResolvedTagsForElement('elem1');
      expect(resolved.length).toBe(0); // No definitions found
    });
  });

  describe('getElementTagView', () => {
    it('should return element tag view', () => {
      // Push values to subjects so signals are updated
      elementTagsSubject.next(mockElementTags);
      customTagsSubject.next(MOCK_PROJECT_TAGS);

      const view = service.getElementTagView('elem1');
      expect(view.elementId).toBe('elem1');
      expect(view.tags.length).toBe(2);
    });
  });

  describe('getElementsWithTag', () => {
    it('should return element IDs with a specific tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      const elements = service.getElementsWithTag('protagonist');
      expect(elements).toContain('elem1');
      expect(elements).toContain('elem2');
    });
  });

  describe('hasTag', () => {
    it('should return true if element has the tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      expect(service.hasTag('elem1', 'protagonist')).toBe(true);
    });

    it('should return false if element does not have the tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      expect(service.hasTag('elem1', 'nonexistent')).toBe(false);
    });
  });

  describe('addTag', () => {
    it('should add a tag to an element', () => {
      mockSyncProvider.getElementTags.mockReturnValue([]);
      const result = service.addTag('elem1', 'important');

      expect(result.elementId).toBe('elem1');
      expect(result.tagId).toBe('important');
      expect(result.id).toBeDefined();
      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
    });

    it('should not duplicate existing tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      const result = service.addTag('elem1', 'protagonist');

      // Should return existing tag, not create new one
      expect(result.id).toBe('et1');
      expect(mockSyncProvider.updateElementTags).not.toHaveBeenCalled();
    });
  });

  describe('removeTag', () => {
    it('should remove a tag from an element', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const result = service.removeTag('elem1', 'protagonist');

      expect(result).toBe(true);
      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
    });

    it('should return false for non-existent tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const result = service.removeTag('elem1', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('removeTagById', () => {
    it('should remove a tag by assignment ID', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const result = service.removeTagById('et1');

      expect(result).toBe(true);
      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
    });

    it('should return false for non-existent assignment ID', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const result = service.removeTagById('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('setElementTags', () => {
    it('should replace all tags for an element', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      service.setElementTags('elem1', ['important', 'featured']);

      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
      const call = mockSyncProvider.updateElementTags.mock.calls[0][0];
      const elem1Tags = call.filter((t: ElementTag) => t.elementId === 'elem1');
      expect(elem1Tags.length).toBe(2);
    });
  });

  describe('clearElementTags', () => {
    it('should remove all tags from an element', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      service.clearElementTags('elem1');

      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
      const call = mockSyncProvider.updateElementTags.mock.calls[0][0];
      expect(call.every((t: ElementTag) => t.elementId !== 'elem1')).toBe(true);
    });
  });

  describe('removeAllTagOccurrences', () => {
    it('should remove all occurrences of a tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const count = service.removeAllTagOccurrences('protagonist');

      expect(count).toBe(2);
      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
    });

    it('should return 0 for non-existent tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue([...mockElementTags]);
      const count = service.removeAllTagOccurrences('nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('getCustomTagDefinitions', () => {
    it('should return custom tag definitions', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([mockCustomTag]);
      expect(service.getCustomTagDefinitions()).toEqual([mockCustomTag]);
    });
  });

  describe('getTagDefinition', () => {
    it('should return custom tag by ID', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([mockCustomTag]);
      const tag = service.getTagDefinition(mockCustomTag.id);
      expect(tag).toEqual(mockCustomTag);
    });

    it('should return project tag by ID', () => {
      mockSyncProvider.getCustomTags.mockReturnValue(MOCK_PROJECT_TAGS);
      const tag = service.getTagDefinition('protagonist');
      expect(tag?.id).toBe('protagonist');
      expect(tag?.name).toBe('Protagonist');
    });

    it('should return undefined for non-existent tag', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([]);
      const tag = service.getTagDefinition('nonexistent');
      expect(tag).toBeUndefined();
    });
  });

  describe('createCustomTag', () => {
    it('should create a new custom tag', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([]);

      const result = service.createCustomTag({
        name: 'New Tag',
        icon: 'bookmark',
        color: '#9C27B0',
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('New Tag');
      expect(mockSyncProvider.updateCustomTags).toHaveBeenCalled();
    });
  });

  describe('updateCustomTag', () => {
    it('should update an existing tag', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([mockCustomTag]);

      const result = service.updateCustomTag(mockCustomTag.id, {
        name: 'Updated Name',
      });

      expect(result?.name).toBe('Updated Name');
      expect(mockSyncProvider.updateCustomTags).toHaveBeenCalled();
    });

    it('should return null for non-existent tag', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([]);
      const result = service.updateCustomTag('nonexistent', { name: 'Test' });
      expect(result).toBeNull();
    });

    it('should update icon and color', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([mockCustomTag]);

      const result = service.updateCustomTag(mockCustomTag.id, {
        icon: 'new_icon',
        color: '#123456',
      });

      expect(result?.icon).toBe('new_icon');
      expect(result?.color).toBe('#123456');
    });
  });

  describe('deleteCustomTag', () => {
    it('should delete a tag and its assignments', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([mockCustomTag]);
      mockSyncProvider.getElementTags.mockReturnValue([
        {
          id: 'et-custom',
          elementId: 'elem1',
          tagId: mockCustomTag.id,
          createdAt: '2024-01-01',
        },
      ]);

      const result = service.deleteCustomTag(mockCustomTag.id);

      expect(result).toBe(true);
      expect(mockSyncProvider.updateElementTags).toHaveBeenCalled();
      expect(mockSyncProvider.updateCustomTags).toHaveBeenCalled();
    });

    it('should return false for non-existent tag', () => {
      mockSyncProvider.getCustomTags.mockReturnValue([]);
      const result = service.deleteCustomTag('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getTagCount', () => {
    it('should return count of elements with a tag', () => {
      mockSyncProvider.getElementTags.mockReturnValue(mockElementTags);
      expect(service.getTagCount('protagonist')).toBe(2);
    });
  });

  describe('searchTags', () => {
    it('should search tags by name', () => {
      customTagsSubject.next(MOCK_PROJECT_TAGS);
      const results = service.searchTags('Prot');
      expect(results.some(t => t.id === 'protagonist')).toBe(true);
    });

    it('should be case-insensitive', () => {
      customTagsSubject.next(MOCK_PROJECT_TAGS);
      const results = service.searchTags('COMPLETE');
      expect(results.some(t => t.id === 'complete')).toBe(true);
    });
  });

  describe('getAvailableTagsForElement', () => {
    it('should return tags not yet assigned to element', () => {
      // Push values to subjects so signals are updated
      elementTagsSubject.next(mockElementTags);
      customTagsSubject.next(MOCK_PROJECT_TAGS);

      const available = service.getAvailableTagsForElement('elem1');
      // elem1 has 'protagonist' and 'complete', so those should not be in available
      expect(available.some(t => t.id === 'protagonist')).toBe(false);
      expect(available.some(t => t.id === 'complete')).toBe(false);
      // But other tags should be available
      expect(available.some(t => t.id === 'important')).toBe(true);
    });
  });
});
