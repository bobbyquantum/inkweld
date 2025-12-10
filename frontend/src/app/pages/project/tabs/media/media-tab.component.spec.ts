import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  MediaInfo,
  OfflineStorageService,
} from '@services/offline/offline-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { vi } from 'vitest';

import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import { MediaItem, MediaTabComponent } from './media-tab.component';

describe('MediaTabComponent', () => {
  let component: MediaTabComponent;
  let fixture: ComponentFixture<MediaTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let offlineStorage: Partial<OfflineStorageService>;
  let dialogGateway: Partial<DialogGatewayService>;

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
    };

    offlineStorage = {
      listMedia: vi.fn().mockResolvedValue(mockMediaList),
      getMediaUrl: vi.fn().mockResolvedValue('blob:http://localhost/mock-url'),
      getMedia: vi
        .fn()
        .mockResolvedValue(new Blob(['test'], { type: 'image/jpeg' })),
      deleteMedia: vi.fn().mockResolvedValue(undefined),
      revokeProjectUrls: vi.fn(),
    };

    dialogGateway = {
      openImageViewerDialog: vi.fn(),
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
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
        { provide: OfflineStorageService, useValue: offlineStorage },
        { provide: DialogGatewayService, useValue: dialogGateway },
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

    expect(offlineStorage.listMedia).toHaveBeenCalledWith(
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
      component.viewImage(coverItem);
      expect(dialogGateway.openImageViewerDialog).toHaveBeenCalledWith({
        imageUrl: expect.any(String),
        fileName: 'cover.jpg',
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

    expect(offlineStorage.getMedia).toHaveBeenCalledWith(
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
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    expect(offlineStorage.deleteMedia).toHaveBeenCalledWith(
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

    expect(offlineStorage.deleteMedia).not.toHaveBeenCalled();
  });

  it('should handle error when loading media', async () => {
    (offlineStorage.listMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    const otherItem = {
      isImage: false,
      mimeType: 'text/plain',
    } as MediaItem;

    expect(component.getMediaIcon(imageItem)).toBe('image');
    expect(component.getMediaIcon(epubItem)).toBe('book');
    expect(component.getMediaIcon(pdfItem)).toBe('picture_as_pdf');
    expect(component.getMediaIcon(zipItem)).toBe('folder_zip');
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

    expect(offlineStorage.revokeProjectUrls).toHaveBeenCalledWith(
      'testuser/test-project'
    );
  });
});
