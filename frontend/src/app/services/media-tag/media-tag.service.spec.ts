import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { type MediaProjectTag } from '../../models/media-project-tag.model';
import { type MediaTag } from '../../models/media-tag.model';
import { LoggerService } from '../core/logger.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { MediaTagService } from './media-tag.service';

describe('MediaTagService', () => {
  let service: MediaTagService;
  let mockSyncProvider: IElementSyncProvider;
  let mediaTagsSubject: BehaviorSubject<MediaTag[]>;

  const tag1: MediaTag = {
    id: 'mt1',
    mediaId: 'media-1',
    elementId: 'elem-a',
    createdAt: '2025-01-01T00:00:00Z',
  };
  const tag2: MediaTag = {
    id: 'mt2',
    mediaId: 'media-1',
    elementId: 'elem-b',
    createdAt: '2025-01-01T00:00:00Z',
  };
  const tag3: MediaTag = {
    id: 'mt3',
    mediaId: 'media-2',
    elementId: 'elem-a',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mediaTagsSubject = new BehaviorSubject<MediaTag[]>([]);

    mockSyncProvider = {
      elements$: of([]),
      relationships$: of([]),
      relationshipSubjects$: of([]),
      elementTags$: of([]),
      customTags$: of([]),
      mediaTags$: mediaTagsSubject.asObservable(),
      mediaProjectTags$: of([] as MediaProjectTag[]),
      getElements: vi.fn().mockReturnValue([]),
      getRelationships: vi.fn().mockReturnValue([]),
      getRelationshipSubjects: vi.fn().mockReturnValue([]),
      getElementTags: vi.fn().mockReturnValue([]),
      getCustomTags: vi.fn().mockReturnValue([]),
      getMediaTags: vi.fn().mockReturnValue([]),
      getMediaProjectTags: vi.fn().mockReturnValue([]),
      updateElement: vi.fn(),
      updateElements: vi.fn(),
      updateRelationships: vi.fn(),
      updateRelationshipSubjects: vi.fn(),
      updateElementTags: vi.fn(),
      updateCustomTags: vi.fn(),
      updateMediaTags: vi.fn(),
      updateMediaProjectTags: vi.fn(),
    } as unknown as IElementSyncProvider;

    TestBed.configureTestingModule({
      providers: [
        MediaTagService,
        {
          provide: ElementSyncProviderFactory,
          useValue: { getProvider: () => mockSyncProvider },
        },
        {
          provide: LoggerService,
          useValue: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    });

    service = TestBed.inject(MediaTagService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('reactive signals', () => {
    it('should update mediaTags from sync provider', () => {
      mediaTagsSubject.next([tag1, tag2]);
      expect(service.mediaTags()).toEqual([tag1, tag2]);
    });

    it('should compute mediaToElements index', () => {
      mediaTagsSubject.next([tag1, tag2, tag3]);
      const index = service.mediaToElements();
      expect(index.get('media-1')).toEqual(['elem-a', 'elem-b']);
      expect(index.get('media-2')).toEqual(['elem-a']);
    });

    it('should compute elementToMedia index', () => {
      mediaTagsSubject.next([tag1, tag2, tag3]);
      const index = service.elementToMedia();
      expect(index.get('elem-a')).toEqual(['media-1', 'media-2']);
      expect(index.get('elem-b')).toEqual(['media-1']);
    });

    it('should handle empty tags', () => {
      mediaTagsSubject.next([]);
      expect(service.mediaToElements().size).toBe(0);
      expect(service.elementToMedia().size).toBe(0);
    });
  });

  describe('queries', () => {
    it('should return all tags via getAll()', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2]);
      expect(service.getAll()).toEqual([tag1, tag2]);
    });

    it('should return element IDs for a media item', () => {
      mediaTagsSubject.next([tag1, tag2, tag3]);
      expect(service.getElementsForMedia('media-1')).toEqual([
        'elem-a',
        'elem-b',
      ]);
      expect(service.getElementsForMedia('unknown')).toEqual([]);
    });

    it('should return media IDs for an element', () => {
      mediaTagsSubject.next([tag1, tag2, tag3]);
      expect(service.getMediaForElement('elem-a')).toEqual([
        'media-1',
        'media-2',
      ]);
      expect(service.getMediaForElement('unknown')).toEqual([]);
    });

    it('should check if a tag exists', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      expect(service.hasTag('media-1', 'elem-a')).toBe(true);
      expect(service.hasTag('media-1', 'elem-b')).toBe(false);
    });
  });

  describe('mutations', () => {
    it('should add a new tag', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([]);
      service.addTag('media-1', 'elem-a');
      expect(mockSyncProvider.updateMediaTags).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            mediaId: 'media-1',
            elementId: 'elem-a',
          }),
        ])
      );
    });

    it('should not add duplicate tag', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      service.addTag('media-1', 'elem-a');
      expect(mockSyncProvider.updateMediaTags).not.toHaveBeenCalled();
    });

    it('should remove a tag', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2]);
      service.removeTag('media-1', 'elem-a');
      expect(mockSyncProvider.updateMediaTags).toHaveBeenCalledWith([tag2]);
    });

    it('should not update if tag to remove does not exist', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      service.removeTag('media-1', 'nonexistent');
      expect(mockSyncProvider.updateMediaTags).not.toHaveBeenCalled();
    });

    it('should remove all tags for a media item', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2, tag3]);
      service.removeAllForMedia('media-1');
      expect(mockSyncProvider.updateMediaTags).toHaveBeenCalledWith([tag3]);
    });

    it('should not update if no tags exist for media', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag3]);
      service.removeAllForMedia('media-1');
      expect(mockSyncProvider.updateMediaTags).not.toHaveBeenCalled();
    });

    it('should remove all tags for an element', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2, tag3]);
      service.removeAllForElement('elem-a');
      expect(mockSyncProvider.updateMediaTags).toHaveBeenCalledWith([tag2]);
    });

    it('should not update if no tags exist for element', () => {
      (
        mockSyncProvider.getMediaTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag2]);
      service.removeAllForElement('elem-a');
      expect(mockSyncProvider.updateMediaTags).not.toHaveBeenCalled();
    });
  });
});
