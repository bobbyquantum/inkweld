import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { type MediaProjectTag } from '../../models/media-project-tag.model';
import { type MediaTag } from '../../models/media-tag.model';
import { LoggerService } from '../core/logger.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { MediaProjectTagService } from './media-project-tag.service';

describe('MediaProjectTagService', () => {
  let service: MediaProjectTagService;
  let mockSyncProvider: IElementSyncProvider;
  let mediaProjectTagsSubject: BehaviorSubject<MediaProjectTag[]>;

  const tag1: MediaProjectTag = {
    id: 'mpt1',
    mediaId: 'media-1',
    tagId: 'tag-a',
    createdAt: '2025-01-01T00:00:00Z',
  };
  const tag2: MediaProjectTag = {
    id: 'mpt2',
    mediaId: 'media-1',
    tagId: 'tag-b',
    createdAt: '2025-01-01T00:00:00Z',
  };
  const tag3: MediaProjectTag = {
    id: 'mpt3',
    mediaId: 'media-2',
    tagId: 'tag-a',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mediaProjectTagsSubject = new BehaviorSubject<MediaProjectTag[]>([]);

    mockSyncProvider = {
      elements$: of([]),
      relationships$: of([]),
      relationshipSubjects$: of([]),
      elementTags$: of([]),
      customTags$: of([]),
      mediaTags$: of([] as MediaTag[]),
      mediaProjectTags$: mediaProjectTagsSubject.asObservable(),
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
        MediaProjectTagService,
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

    service = TestBed.inject(MediaProjectTagService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('reactive signals', () => {
    it('should update mediaProjectTags from sync provider', () => {
      mediaProjectTagsSubject.next([tag1, tag2]);
      expect(service.mediaProjectTags()).toEqual([tag1, tag2]);
    });

    it('should compute mediaToTags index', () => {
      mediaProjectTagsSubject.next([tag1, tag2, tag3]);
      const index = service.mediaToTags();
      expect(index.get('media-1')).toEqual(['tag-a', 'tag-b']);
      expect(index.get('media-2')).toEqual(['tag-a']);
    });

    it('should compute tagToMedia index', () => {
      mediaProjectTagsSubject.next([tag1, tag2, tag3]);
      const index = service.tagToMedia();
      expect(index.get('tag-a')).toEqual(['media-1', 'media-2']);
      expect(index.get('tag-b')).toEqual(['media-1']);
    });

    it('should handle empty tags', () => {
      mediaProjectTagsSubject.next([]);
      expect(service.mediaToTags().size).toBe(0);
      expect(service.tagToMedia().size).toBe(0);
    });
  });

  describe('queries', () => {
    it('should return all tags via getAll()', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2]);
      expect(service.getAll()).toEqual([tag1, tag2]);
    });

    it('should return tag IDs for a media item', () => {
      mediaProjectTagsSubject.next([tag1, tag2, tag3]);
      expect(service.getTagsForMedia('media-1')).toEqual(['tag-a', 'tag-b']);
      expect(service.getTagsForMedia('media-2')).toEqual(['tag-a']);
      expect(service.getTagsForMedia('unknown')).toEqual([]);
    });

    it('should return media IDs for a tag', () => {
      mediaProjectTagsSubject.next([tag1, tag2, tag3]);
      expect(service.getMediaForTag('tag-a')).toEqual(['media-1', 'media-2']);
      expect(service.getMediaForTag('tag-b')).toEqual(['media-1']);
      expect(service.getMediaForTag('unknown')).toEqual([]);
    });

    it('should check if a tag exists', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      expect(service.hasTag('media-1', 'tag-a')).toBe(true);
      expect(service.hasTag('media-1', 'tag-b')).toBe(false);
    });
  });

  describe('mutations', () => {
    it('should add a new tag', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([]);
      service.addTag('media-1', 'tag-a');
      expect(mockSyncProvider.updateMediaProjectTags).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ mediaId: 'media-1', tagId: 'tag-a' }),
        ])
      );
    });

    it('should not add duplicate tag', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      service.addTag('media-1', 'tag-a');
      expect(mockSyncProvider.updateMediaProjectTags).not.toHaveBeenCalled();
    });

    it('should remove a tag', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2]);
      service.removeTag('media-1', 'tag-a');
      expect(mockSyncProvider.updateMediaProjectTags).toHaveBeenCalledWith([
        tag2,
      ]);
    });

    it('should not update if tag to remove does not exist', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      service.removeTag('media-1', 'nonexistent');
      expect(mockSyncProvider.updateMediaProjectTags).not.toHaveBeenCalled();
    });

    it('should remove all tags for a media item', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2, tag3]);
      service.removeAllForMedia('media-1');
      expect(mockSyncProvider.updateMediaProjectTags).toHaveBeenCalledWith([
        tag3,
      ]);
    });

    it('should not update if no tags exist for media item', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag3]);
      service.removeAllForMedia('media-1');
      expect(mockSyncProvider.updateMediaProjectTags).not.toHaveBeenCalled();
    });

    it('should remove all media for a tag', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1, tag2, tag3]);
      service.removeAllForTag('tag-a');
      expect(mockSyncProvider.updateMediaProjectTags).toHaveBeenCalledWith([
        tag2,
      ]);
    });

    it('should not update if no media exist for tag', () => {
      (
        mockSyncProvider.getMediaProjectTags as ReturnType<typeof vi.fn>
      ).mockReturnValue([tag1]);
      service.removeAllForTag('nonexistent');
      expect(mockSyncProvider.updateMediaProjectTags).not.toHaveBeenCalled();
    });
  });
});
