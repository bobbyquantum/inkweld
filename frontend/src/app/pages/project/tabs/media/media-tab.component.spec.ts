import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import {
  LocalStorageService,
  type MediaInfo,
} from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { MediaTagService } from '@services/media-tag/media-tag.service';
import { MediaProjectTagService } from '@services/project/media-project-tag.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { vi } from 'vitest';

import { DocumentSyncState } from '../../../../models/document-sync-state';
import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import { DocumentService } from '../../../../services/project/document.service';
import { type MediaItem, MediaTabComponent } from './media-tab.component';

describe('MediaTabComponent', () => {
  let component: MediaTabComponent;
  let fixture: ComponentFixture<MediaTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let localStorage: Partial<LocalStorageService>;
  let dialogGateway: Partial<DialogGatewayService>;
  let mediaSyncService: Partial<MediaSyncService>;
  let setupService: Partial<SetupService>;
  let mediaTagService: Partial<MediaTagService>;
  let mediaProjectTagService: Partial<MediaProjectTagService>;
  let tagService: Partial<TagService>;
  let documentService: Partial<DocumentService>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    id: '123',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    description: 'Test description',
  };

  const mockMediaList: MediaInfo[] = [
    {
      mediaId: 'cover',
      mimeType: 'image/jpeg',
      size: 102400,
      createdAt: '2025-01-15T10:00:00.000Z',
      filename: 'cover.jpg',
    },
    {
      mediaId: 'img-abc123',
      mimeType: 'image/png',
      size: 51200,
      createdAt: '2025-01-16T10:00:00.000Z',
      filename: 'character-sketch.png',
    },
    {
      mediaId: 'published-xyz789',
      mimeType: 'application/epub+zip',
      size: 1048576,
      createdAt: '2025-01-17T10:00:00.000Z',
      filename: 'my-novel.epub',
    },
  ];

  beforeEach(async () => {
    projectStateService = {
      project: signal(mockProject),
      getSyncState: signal(DocumentSyncState.Synced),
      elements: signal([]),
      coverMediaId: signal(undefined),
    };

    localStorage = {
      listMedia: vi.fn().mockResolvedValue(mockMediaList),
      getMediaUrl: vi.fn().mockResolvedValue('blob:http://localhost/mock-url'),
      getMedia: vi
        .fn()
        .mockResolvedValue(new Blob(['test'], { type: 'image/jpeg' })),
      deleteMedia: vi.fn().mockResolvedValue(undefined),
      saveMedia: vi.fn().mockResolvedValue(undefined),
      revokeProjectUrls: vi.fn(),
    };

    dialogGateway = {
      openImageViewerDialog: vi.fn(),
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
      openImageGenerationDialog: vi.fn().mockResolvedValue(undefined),
    };

    mediaSyncService = {
      downloadAllFromServer: vi.fn().mockResolvedValue(undefined),
      mediaSyncVersion: signal(0),
    };

    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    mediaTagService = {
      getElementsForMedia: vi.fn().mockReturnValue([]),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      removeAllForMedia: vi.fn(),
    };

    mediaProjectTagService = {
      getTagsForMedia: vi.fn().mockReturnValue([]),
      getMediaForTag: vi.fn().mockReturnValue([]),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      removeAllForMedia: vi.fn(),
    };

    tagService = {
      allTags: signal([]),
    };

    documentService = {
      getDocumentContent: vi.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        MatMenuModule,
        FileSizePipe,
        MediaTabComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: LocalStorageService, useValue: localStorage },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: MediaSyncService, useValue: mediaSyncService },
        { provide: SetupService, useValue: setupService },
        { provide: MediaTagService, useValue: mediaTagService },
        { provide: MediaProjectTagService, useValue: mediaProjectTagService },
        { provide: TagService, useValue: tagService },
        { provide: DocumentService, useValue: documentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaTabComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load media on init', async () => {
    await component.loadMedia();
    await fixture.whenStable();

    expect(localStorage.listMedia).toHaveBeenCalledWith(
      'testuser/test-project'
    );
    expect(component.mediaItems().length).toBe(3);
    expect(component.isLoading()).toBe(false);
  });

  it('should categorize media correctly', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    const items = component.mediaItems();
    expect(items.find(i => i.mediaId === 'cover')?.category).toBe('cover');
    expect(items.find(i => i.mediaId === 'img-abc123')?.category).toBe(
      'inline'
    );
    expect(items.find(i => i.mediaId === 'published-xyz789')?.category).toBe(
      'published'
    );
  });

  it('should filter items by category', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    component.setCategory('inline');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0].mediaId).toBe('img-abc123');

    component.setCategory('all');
    expect(component.filteredItems().length).toBe(3);
  });

  it('should calculate total size and count', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    expect(component.totalCount()).toBe(3);
    // 102400 + 51200 + 1048576 = 1202176
    expect(component.totalSize()).toBe(1202176);
  });

  it('should open image viewer for images', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    const coverItem = component.mediaItems().find(i => i.mediaId === 'cover');
    if (coverItem) {
      await component.viewImage(coverItem);
      expect(dialogGateway.openImageViewerDialog).toHaveBeenCalledWith({
        imageUrl: expect.any(String),
        fileName: 'cover.jpg',
        canEdit: true,
        mediaId: 'cover',
        metadata: {
          category: coverItem.categoryLabel,
          size: expect.any(String),
          date: expect.any(String),
          generationPrompt: undefined,
          generationModel: undefined,
          generationSize: undefined,
        },
      });
    }
  });

  it('should download media', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    // Mock URL methods
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

    const item = component.mediaItems()[0];
    await component.downloadMedia(item);

    expect(localStorage.getMedia).toHaveBeenCalledWith(
      'testuser/test-project',
      item.mediaId
    );
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('should delete media after confirmation', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    const item = component.mediaItems()[1]; // inline image
    await component.deleteMedia(item);

    expect(dialogGateway.openConfirmationDialog).toHaveBeenCalledWith({
      title: 'Delete Media',
      message: `Are you sure you want to delete "${item.filename}"?`,
      details: undefined,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    expect(localStorage.deleteMedia).toHaveBeenCalledWith(
      'testuser/test-project',
      item.mediaId
    );
  });

  it('should not delete media if confirmation cancelled', async () => {
    (
      dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await component.loadMedia();
    fixture.detectChanges();

    const item = component.mediaItems()[1];
    await component.deleteMedia(item);

    expect(localStorage.deleteMedia).not.toHaveBeenCalled();
  });

  it('should handle error when loading media', async () => {
    (localStorage.listMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    await component.loadMedia();
    await fixture.whenStable();

    expect(component.error()).toBe('Failed to load media');
    expect(component.isLoading()).toBe(false);
  });

  it('should show error when project is not available', async () => {
    (projectStateService.project as ReturnType<typeof signal>).set(null);

    await component.loadMedia();
    fixture.detectChanges();

    expect(component.error()).toBe('Project not available');
  });

  it('should return correct icon for different media types', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    const imageItem = { isImage: true, mimeType: 'image/jpeg' } as MediaItem;
    const epubItem = {
      isImage: false,
      mimeType: 'application/epub+zip',
    } as MediaItem;
    const pdfItem = {
      isImage: false,
      mimeType: 'application/pdf',
    } as MediaItem;
    const zipItem = {
      isImage: false,
      mimeType: 'application/zip',
    } as MediaItem;
    const htmlItem = {
      isImage: false,
      mimeType: 'text/html',
    } as MediaItem;
    const mdItem = {
      isImage: false,
      mimeType: 'text/markdown',
    } as MediaItem;
    const otherItem = {
      isImage: false,
      mimeType: 'text/plain',
    } as MediaItem;

    expect(component.getMediaIcon(imageItem)).toBe('image');
    expect(component.getMediaIcon(epubItem)).toBe('book');
    expect(component.getMediaIcon(pdfItem)).toBe('picture_as_pdf');
    expect(component.getMediaIcon(zipItem)).toBe('folder_zip');
    expect(component.getMediaIcon(htmlItem)).toBe('article');
    expect(component.getMediaIcon(mdItem)).toBe('article');
    expect(component.getMediaIcon(otherItem)).toBe('insert_drive_file');
  });

  it('should format dates correctly', () => {
    const dateStr = '2025-01-15T10:00:00.000Z';
    const formatted = component.formatDate(dateStr);
    // The exact format depends on locale, just check it's not empty
    expect(formatted).toBeTruthy();
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should revoke URLs on destroy', async () => {
    await component.loadMedia();
    fixture.detectChanges();

    component.ngOnDestroy();

    expect(localStorage.revokeProjectUrls).toHaveBeenCalledWith(
      'testuser/test-project'
    );
  });

  it('should save generated image from openImageGenerator', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    const mockResponse = { blob: () => Promise.resolve(mockBlob) } as Response;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse);

    (
      dialogGateway.openImageGenerationDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      saved: true,
      imageData: 'data:image/png;base64,abc123',
    });

    // openImageGenerator is now private — call via bracket notation
    await (component as unknown as Record<string, () => Promise<void>>)[
      'openImageGenerator'
    ]();

    expect(fetchSpy).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(localStorage.saveMedia).toHaveBeenCalledWith(
      'testuser/test-project',
      expect.stringMatching(/^generated-\d+$/),
      mockBlob,
      expect.stringMatching(/^ai-generated-\d+\.png$/)
    );

    fetchSpy.mockRestore();
  });

  describe('search and filters', () => {
    it('should filter by search query', async () => {
      await component.loadMedia();
      fixture.detectChanges();

      component.searchQuery.set('character');
      const filtered = component.filteredItems();
      expect(filtered.length).toBe(1);
      expect(filtered[0].mediaId).toBe('img-abc123');
    });

    it('should clear search', async () => {
      await component.loadMedia();
      component.searchQuery.set('test');
      component.clearSearch();
      expect(component.searchQuery()).toBe('');
    });

    it('should filter by date range', async () => {
      await component.loadMedia();
      fixture.detectChanges();

      component.onFilterChange({
        category: 'all',
        elementIds: [],
        tagIds: [],
        dateFrom: new Date('2025-01-16T00:00:00.000Z'),
        dateTo: null,
      });

      const filtered = component.filteredItems();
      expect(filtered.length).toBe(2); // only items from 1/16 and 1/17
    });

    it('should filter by dateTo', async () => {
      await component.loadMedia();
      fixture.detectChanges();

      component.onFilterChange({
        category: 'all',
        elementIds: [],
        tagIds: [],
        dateFrom: null,
        dateTo: new Date('2025-01-15T23:59:59.999Z'),
      });

      const filtered = component.filteredItems();
      expect(filtered.length).toBe(1);
      expect(filtered[0].mediaId).toBe('cover');
    });

    it('should clear all filters', async () => {
      await component.loadMedia();
      component.onFilterChange({
        category: 'cover',
        elementIds: ['e1'],
        tagIds: ['t1'],
        dateFrom: new Date(),
        dateTo: new Date(),
      });

      component.clearAllFilters();

      const filters = component.filterState();
      expect(filters.category).toBe('all');
      expect(filters.elementIds).toEqual([]);
      expect(filters.tagIds).toEqual([]);
      expect(filters.dateFrom).toBeNull();
      expect(filters.dateTo).toBeNull();
    });
  });

  describe('element tag management', () => {
    it('should get tagged elements for media', () => {
      (
        mediaTagService.getElementsForMedia as ReturnType<typeof vi.fn>
      ).mockReturnValue(['el-1', 'el-2']);
      const result = component.getTaggedElements('media-1');
      expect(result).toEqual(['el-1', 'el-2']);
    });

    it('should remove a media tag', () => {
      component.removeMediaTag('media-1', 'el-1');
      expect(mediaTagService.removeTag).toHaveBeenCalledWith('media-1', 'el-1');
    });

    it('should add a media project tag', () => {
      component.addMediaProjectTag('media-1', 'tag-1');
      expect(mediaProjectTagService.addTag).toHaveBeenCalledWith(
        'media-1',
        'tag-1'
      );
    });

    it('should remove a media project tag', () => {
      component.removeMediaProjectTag('media-1', 'tag-1');
      expect(mediaProjectTagService.removeTag).toHaveBeenCalledWith(
        'media-1',
        'tag-1'
      );
    });

    it('should get project tags for media', () => {
      const mockTags = [
        { id: 'tag-1', name: 'Hero', icon: 'star', color: '#f00' },
      ];
      (tagService.allTags as ReturnType<typeof signal>).set(mockTags);
      (
        mediaProjectTagService.getTagsForMedia as ReturnType<typeof vi.fn>
      ).mockReturnValue(['tag-1']);
      const result = component.getProjectTags('media-1');
      expect(result).toEqual(mockTags);
    });

    it('should get available project tags (excluding already assigned)', () => {
      const mockTags = [
        { id: 'tag-1', name: 'Hero', icon: 'star', color: '#f00' },
        { id: 'tag-2', name: 'Villain', icon: 'skull', color: '#000' },
      ];
      (tagService.allTags as ReturnType<typeof signal>).set(mockTags);
      (
        mediaProjectTagService.getTagsForMedia as ReturnType<typeof vi.fn>
      ).mockReturnValue(['tag-1']);
      const result = component.getAvailableProjectTags('media-1');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('tag-2');
    });
  });

  describe('element filter toggling', () => {
    it('should toggle element filter on', () => {
      component.toggleElementFilter('el-1');
      expect(component.filterState().elementIds).toContain('el-1');
    });

    it('should toggle element filter off', () => {
      component.onFilterChange({
        ...component.filterState(),
        elementIds: ['el-1', 'el-2'],
      });
      component.toggleElementFilter('el-1');
      expect(component.filterState().elementIds).toEqual(['el-2']);
    });

    it('should toggle tag filter on', () => {
      component.toggleTagFilter('tag-1');
      expect(component.filterState().tagIds).toContain('tag-1');
    });

    it('should toggle tag filter off', () => {
      component.onFilterChange({
        ...component.filterState(),
        tagIds: ['tag-1'],
      });
      component.toggleTagFilter('tag-1');
      expect(component.filterState().tagIds).toEqual([]);
    });
  });

  describe('misc helpers', () => {
    it('should truncate long prompts', () => {
      const long = 'a'.repeat(100);
      expect(component.truncatePrompt(long, 50)).toBe('a'.repeat(50) + '...');
    });

    it('should not truncate short prompts', () => {
      expect(component.truncatePrompt('short')).toBe('short');
    });

    it('should get element name from project state', () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'el-1', name: 'My Character', type: 0, sortIndex: 0 },
      ] as never[]);
      expect(component.getElementName('el-1')).toBe('My Character');
      expect(component.getElementName('unknown')).toBe('Unknown');
    });

    it('should get element icon', () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        {
          id: 'el-1',
          name: 'Char',
          type: 0,
          sortIndex: 0,
          schemaId: 'character-v1',
        },
      ] as never[]);
      expect(component.getElementIcon('el-1')).toBeTruthy();
    });
  });

  describe('viewImage result handling', () => {
    it('should handle delete result from image viewer', async () => {
      await component.loadMedia();
      fixture.detectChanges();

      const item = component.mediaItems()[0];
      (
        dialogGateway.openImageViewerDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue('delete');
      (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);

      await component.viewImage(item);

      expect(dialogGateway.openConfirmationDialog).toHaveBeenCalled();
      expect(localStorage.deleteMedia).toHaveBeenCalled();
    });
  });

  describe('findMediaUsages (via deleteMedia confirmation details)', () => {
    const TARGET_MEDIA_ID = 'img-abc123';
    const TARGET_MEDIA_URL = `media:${TARGET_MEDIA_ID}`;

    async function getUsagesFor(
      mediaId: string
    ): Promise<string[] | undefined> {
      await component.loadMedia();
      fixture.detectChanges();

      const item = component.mediaItems().find(m => m.mediaId === mediaId)!;
      await component.deleteMedia(item);

      const call = (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mock.calls.at(-1)?.[0] as { details?: string[] };
      return call?.details;
    }

    it('should detect cover image usage', async () => {
      (projectStateService.coverMediaId as ReturnType<typeof signal>).set(
        TARGET_MEDIA_ID
      );

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages).toContain('Used as the project cover image');
    });

    it('should detect canvas image usage', async () => {
      const canvasConfig = JSON.stringify({
        objects: [{ type: 'image', src: TARGET_MEDIA_URL }],
      });
      (projectStateService.elements as ReturnType<typeof signal>).set([
        {
          id: 'canvas-1',
          name: 'Scene Board',
          type: 'CANVAS',
          sortIndex: 0,
          metadata: { canvasConfig },
        },
      ] as never[]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages).toContain('Placed on canvas "Scene Board"');
    });

    it('should not report canvas usage when image src does not match', async () => {
      const canvasConfig = JSON.stringify({
        objects: [{ type: 'image', src: 'media:other-image' }],
      });
      (projectStateService.elements as ReturnType<typeof signal>).set([
        {
          id: 'canvas-1',
          name: 'Scene Board',
          type: 'CANVAS',
          sortIndex: 0,
          metadata: { canvasConfig },
        },
      ] as never[]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages ?? []).not.toContain('Placed on canvas "Scene Board"');
    });

    it('should silently skip canvas elements with malformed config', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        {
          id: 'canvas-1',
          name: 'Bad Canvas',
          type: 'CANVAS',
          sortIndex: 0,
          metadata: { canvasConfig: 'not-json' },
        },
      ] as never[]);

      // Should not throw; usages list should not include the canvas
      const usages = await getUsagesFor(TARGET_MEDIA_ID);
      expect(usages ?? []).not.toContain('Placed on canvas "Bad Canvas"');
    });

    it('should detect document embedded image usage', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'doc-1', name: 'Chapter 1', type: 'ITEM', sortIndex: 0 },
      ] as never[]);
      (
        documentService.getDocumentContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          type: 'image',
          attrs: { src: TARGET_MEDIA_URL },
        },
      ]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages).toContain('Embedded in document "Chapter 1"');
    });

    it('should detect document embedded image nested in content', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'doc-2', name: 'Chapter 2', type: 'ITEM', sortIndex: 0 },
      ] as never[]);
      (
        documentService.getDocumentContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: TARGET_MEDIA_URL } }],
        },
      ]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages).toContain('Embedded in document "Chapter 2"');
    });

    it('should not report document usage when image src does not match', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'doc-3', name: 'Chapter 3', type: 'ITEM', sortIndex: 0 },
      ] as never[]);
      (
        documentService.getDocumentContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { type: 'image', attrs: { src: 'media:different-image' } },
      ]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages ?? []).not.toContain('Embedded in document "Chapter 3"');
    });

    it('should silently skip documents that throw on read', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'doc-err', name: 'Broken Doc', type: 'ITEM', sortIndex: 0 },
      ] as never[]);
      (
        documentService.getDocumentContent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('read error'));

      // Should not throw; usage not reported
      const usages = await getUsagesFor(TARGET_MEDIA_ID);
      expect(usages ?? []).not.toContain('Embedded in document "Broken Doc"');
    });

    it('should detect element tag usage', async () => {
      (
        mediaTagService.getElementsForMedia as ReturnType<typeof vi.fn>
      ).mockReturnValue(['el-tagged']);
      (projectStateService.elements as ReturnType<typeof signal>).set([
        {
          id: 'el-tagged',
          name: 'My Character',
          type: 'WORLDBUILDING',
          sortIndex: 0,
        },
      ] as never[]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);

      expect(usages).toContain('Tagged on element "My Character"');
    });

    it('should not match an image node with no src attribute', async () => {
      (projectStateService.elements as ReturnType<typeof signal>).set([
        { id: 'doc-nosrc', name: 'No-src Doc', type: 'ITEM', sortIndex: 0 },
      ] as never[]);
      (
        documentService.getDocumentContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        // image node present but src is absent — covers the `src &&` false branch
        { type: 'image', attrs: {} },
      ]);

      const usages = await getUsagesFor(TARGET_MEDIA_ID);
      expect(usages ?? []).not.toContain('Embedded in document "No-src Doc"');
    });

    it('should return no usages when media is not referenced anywhere', async () => {
      const usages = await getUsagesFor(TARGET_MEDIA_ID);
      expect(usages).toBeUndefined(); // no usages → details is undefined
    });

    it('should return early with empty usages when project is missing', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(null);

      await component.loadMedia();
      // deleteMedia checks for project; call it with a synthetic item
      const item: MediaItem = {
        mediaId: TARGET_MEDIA_ID,
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        createdAt: '',
        isImage: true,
        url: '',
        category: 'inline',
        categoryLabel: 'Inline Image',
      };
      await component.deleteMedia(item);

      // With no project, confirmation is still shown but with no usages/details
      const call = (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mock.calls.at(-1)?.[0] as { details?: string[] };
      expect(call?.details).toBeUndefined();
    });
  });
});
