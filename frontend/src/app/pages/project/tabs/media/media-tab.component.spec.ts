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
});
