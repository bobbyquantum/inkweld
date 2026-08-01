import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  LocalStorageService,
  type MediaInfo,
} from '@services/local/local-storage.service';
import {
  MediaSyncService,
  type MediaSyncState,
} from '@services/local/media-sync.service';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  MediaSelectorDialogComponent,
  type MediaSelectorDialogData,
} from './media-selector-dialog.component';

/**
 * Helper to flush all pending promises
 */
async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('MediaSelectorDialogComponent', () => {
  let component: MediaSelectorDialogComponent;
  let fixture: ComponentFixture<MediaSelectorDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<MediaSelectorDialogComponent>>;
  let localStorageService: MockedObject<LocalStorageService>;
  let mediaSyncService: MockedObject<MediaSyncService>;

  const mockMediaItems: MediaInfo[] = [
    {
      mediaId: 'media-1',
      filename: 'image1.png',
      mimeType: 'image/png',
      size: 1024,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      mediaId: 'media-2',
      filename: 'image2.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      createdAt: '2024-01-02T00:00:00Z',
    },
    {
      mediaId: 'media-3',
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      createdAt: '2024-01-03T00:00:00Z',
    },
  ];

  const mockDialogData: MediaSelectorDialogData = {
    username: 'testuser',
    slug: 'test-project',
    filterType: 'image',
    title: 'Select an Image',
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<MediaSelectorDialogComponent>>;

    localStorageService = {
      listMedia: vi.fn().mockResolvedValue(mockMediaItems),
      getMedia: vi
        .fn()
        .mockResolvedValue(new Blob(['test'], { type: 'image/png' })),
    } as unknown as MockedObject<LocalStorageService>;

    mediaSyncService = {
      checkSyncStatus: vi.fn().mockResolvedValue({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      } satisfies MediaSyncState),
      downloadFromServer: vi.fn().mockResolvedValue(undefined),
      downloadAllFromServer: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<MediaSyncService>;

    // Mock URL.createObjectURL
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: MediaSyncService, useValue: mediaSyncService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaSelectorDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should use custom title from data', () => {
    expect(component.title).toBe('Select an Image');
  });

  it('should use default title if not provided', async () => {
    // Recreate with no title
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { username: 'test', slug: 'proj' },
        },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: MediaSyncService, useValue: mediaSyncService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(MediaSelectorDialogComponent);
    const newComponent = newFixture.componentInstance;
    expect(newComponent.title).toBe('Select Image');
  });

  it('should load media on init', async () => {
    fixture.detectChanges();
    await flushPromises();

    expect(localStorageService.listMedia).toHaveBeenCalledWith(
      'testuser/test-project'
    );
  });

  it('should filter to images when filterType is image', async () => {
    fixture.detectChanges();
    await flushPromises();
    // Need extra flush for the getMedia calls in the for loop
    await flushPromises();
    await flushPromises();

    // Should filter out the PDF
    const items = component.mediaItems();
    expect(items.length).toBe(2);
    expect(items.every(item => item.mimeType?.startsWith('image/'))).toBe(true);
  });

  it('should show all items when filterType is all', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { username: 'test', slug: 'proj', filterType: 'all' },
        },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: MediaSyncService, useValue: mediaSyncService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(MediaSelectorDialogComponent);
    newFixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(newFixture.componentInstance.mediaItems().length).toBe(3);
  });

  it('should select an item when clicked', async () => {
    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const items = component.mediaItems();
    expect(component.selectedItem()).toBeNull();

    component.selectItem(items[0]);
    expect(component.selectedItem()).toEqual(items[0]);
  });

  it('should correctly identify selected item', async () => {
    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const items = component.mediaItems();
    component.selectItem(items[0]);

    expect(component.isSelected(items[0])).toBe(true);
    expect(component.isSelected(items[1])).toBe(false);
  });

  it('should close dialog without result when cancel is called', () => {
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('should close dialog with selected item when confirm is called', async () => {
    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const items = component.mediaItems();
    component.selectItem(items[0]);

    await component.confirm();

    expect(localStorageService.getMedia).toHaveBeenCalledWith(
      'testuser/test-project',
      'media-1'
    );
    expect(dialogRef.close).toHaveBeenCalledWith({
      selected: items[0],
      blob: expect.any(Blob),
    });
  });

  it('should not confirm if no item is selected', async () => {
    fixture.detectChanges();
    await flushPromises();

    await component.confirm();

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('should handle error when loading media fails', async () => {
    localStorageService.listMedia.mockRejectedValueOnce(
      new Error('Load failed')
    );

    fixture.detectChanges();
    await flushPromises();

    expect(component.error()).toBe('Failed to load media library');
    expect(component.isLoading()).toBe(false);
  });

  it('should cleanup object URLs on destroy', async () => {
    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    component.ngOnDestroy();

    // Should have revoked URLs for each loaded image
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('should set loading to false after media loads', async () => {
    expect(component.isLoading()).toBe(true);

    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(component.isLoading()).toBe(false);
  });

  it('tries a server download and surfaces an error when the blob is unavailable on confirm', async () => {
    fixture.detectChanges();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const items = component.mediaItems();
    component.selectItem(items[0]);

    // Blob missing locally both before and after the download attempt —
    // confirm must NOT silently do nothing: it tries the server, then shows
    // an error and keeps the dialog open.
    localStorageService.getMedia.mockResolvedValue(null);
    await component.confirm();

    expect(mediaSyncService.downloadFromServer).toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.error()).toBe('Failed to load the selected image');
  });

  describe('multiSelect mode', () => {
    let multiFixture: ComponentFixture<MediaSelectorDialogComponent>;
    let multiComponent: MediaSelectorDialogComponent;

    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [translocoTestProvider(), MediaSelectorDialogComponent],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRef },
          {
            provide: MAT_DIALOG_DATA,
            useValue: {
              username: 'testuser',
              slug: 'test-project',
              filterType: 'image',
              multiSelect: true,
            } satisfies MediaSelectorDialogData,
          },
          { provide: LocalStorageService, useValue: localStorageService },
          { provide: MediaSyncService, useValue: mediaSyncService },
        ],
      }).compileComponents();

      multiFixture = TestBed.createComponent(MediaSelectorDialogComponent);
      multiComponent = multiFixture.componentInstance;
      multiFixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    it('should be in multiSelect mode', () => {
      expect(multiComponent.multiSelect).toBe(true);
    });

    it('should toggle selection of items', () => {
      const items = multiComponent.mediaItems();
      expect(multiComponent.selectedItems().size).toBe(0);

      multiComponent.selectItem(items[0]);
      expect(multiComponent.selectedItems().has(items[0].mediaId)).toBe(true);

      multiComponent.selectItem(items[1]);
      expect(multiComponent.selectedItems().size).toBe(2);

      // Deselect first item
      multiComponent.selectItem(items[0]);
      expect(multiComponent.selectedItems().has(items[0].mediaId)).toBe(false);
      expect(multiComponent.selectedItems().size).toBe(1);
    });

    it('should report isSelected correctly in multi mode', () => {
      const items = multiComponent.mediaItems();
      multiComponent.selectItem(items[0]);

      expect(multiComponent.isSelected(items[0])).toBe(true);
      expect(multiComponent.isSelected(items[1])).toBe(false);
    });

    it('should report hasSelection correctly in multi mode', () => {
      expect(multiComponent.hasSelection()).toBe(false);

      const items = multiComponent.mediaItems();
      multiComponent.selectItem(items[0]);
      expect(multiComponent.hasSelection()).toBe(true);
    });

    it('should close dialog with selectedItems array on confirm', async () => {
      const items = multiComponent.mediaItems();
      multiComponent.selectItem(items[0]);
      multiComponent.selectItem(items[1]);

      await multiComponent.confirm();

      expect(dialogRef.close).toHaveBeenCalledWith({
        selectedItems: expect.arrayContaining([items[0], items[1]]),
      });
    });

    it('should not confirm when no items are selected in multi mode', async () => {
      await multiComponent.confirm();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should report selectedCount correctly', () => {
      const items = multiComponent.mediaItems();
      expect(multiComponent.selectedCount()).toBe(0);

      multiComponent.selectItem(items[0]);
      expect(multiComponent.selectedCount()).toBe(1);

      multiComponent.selectItem(items[1]);
      expect(multiComponent.selectedCount()).toBe(2);
    });
  });

  describe('server-only items', () => {
    it('needsDownload returns true for server-only items', () => {
      const item = {
        ...mockMediaItems[0],
        syncStatus: 'server-only' as const,
      };
      expect(component.needsDownload(item)).toBe(true);
    });

    it('needsDownload returns false for local items', () => {
      expect(component.needsDownload(mockMediaItems[0] as never)).toBe(false);
    });

    it('isDownloading returns false for items not being downloaded', () => {
      expect(component.isDownloading(mockMediaItems[0] as never)).toBe(false);
    });

    it('downloadItem tracks downloading state and calls mediaSync', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const serverItem = {
        ...mockMediaItems[0],
        filename: 'remote.png',
        syncStatus: 'server-only' as const,
      };

      mediaSyncService.downloadFromServer.mockClear();
      // Stub listMedia to return the item as downloaded after the reload
      localStorageService.listMedia.mockResolvedValueOnce([serverItem]);

      const downloadPromise = component.downloadItem(serverItem);
      // While downloading, the flag should be set
      expect(component.isDownloading(serverItem)).toBe(true);

      await downloadPromise;
      // After download completes, the flag should be cleared
      expect(component.isDownloading(serverItem)).toBe(false);
      expect(mediaSyncService.downloadFromServer).toHaveBeenCalledWith(
        'testuser/test-project',
        'remote.png'
      );
    });

    it('selectItem on a server-only item triggers download instead of selecting', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const serverItem = {
        ...mockMediaItems[0],
        filename: 'remote.png',
        syncStatus: 'server-only' as const,
      };

      mediaSyncService.downloadFromServer.mockClear();
      localStorageService.listMedia.mockResolvedValueOnce([serverItem]);

      const beforeSelection = component.selectedItem();
      component.selectItem(serverItem);

      // Should not select the item
      expect(component.selectedItem()).toBe(beforeSelection);
      // Should start downloading it (selectItem delegates to downloadItem)
      await flushPromises();
      expect(mediaSyncService.downloadFromServer).toHaveBeenCalledWith(
        'testuser/test-project',
        'remote.png'
      );
    });

    it('selectItem on a downloading item does not select it', () => {
      const downloadingItem = {
        ...mockMediaItems[0],
        filename: 'remote.png',
        syncStatus: 'server-only' as const,
      };

      // Manually mark as downloading
      component['downloadingItemIds'].update(ids => {
        const next = new Set(ids);
        next.add(downloadingItem.mediaId);
        return next;
      });

      const beforeSelection = component.selectedItem();
      component.selectItem(downloadingItem);
      expect(component.selectedItem()).toBe(beforeSelection);
    });

    it('downloadItem does nothing when item has no filename', async () => {
      const noFilenameItem = {
        ...mockMediaItems[0],
        filename: undefined,
        syncStatus: 'server-only' as const,
      };

      mediaSyncService.downloadFromServer.mockClear();
      await component.downloadItem(noFilenameItem);
      expect(mediaSyncService.downloadFromServer).not.toHaveBeenCalled();
    });

    it('downloadItem does nothing when already downloading', async () => {
      const item = {
        ...mockMediaItems[0],
        filename: 'remote.png',
        syncStatus: 'server-only' as const,
      };

      // Mark as already downloading
      component['downloadingItemIds'].update(ids => {
        const next = new Set(ids);
        next.add(item.mediaId);
        return next;
      });

      mediaSyncService.downloadFromServer.mockClear();
      await component.downloadItem(item);
      expect(mediaSyncService.downloadFromServer).not.toHaveBeenCalled();
    });

    it('downloadItem sets error message on download failure', async () => {
      const item = {
        ...mockMediaItems[0],
        filename: 'broken.png',
        syncStatus: 'server-only' as const,
      };

      mediaSyncService.downloadFromServer.mockRejectedValueOnce(
        new Error('Network error')
      );
      // Stub listMedia so the reload in downloadItem doesn't hang
      localStorageService.listMedia.mockResolvedValue([item]);

      const beforeError = component.error();
      await component.downloadItem(item);

      expect(component.error()).toContain('broken.png');
      expect(component.error()).not.toBe(beforeError);
      // Flag should be cleared even on failure
      expect(component.isDownloading(item)).toBe(false);
    });
  });

  describe('checkServerMedia with server-only items', () => {
    it('should add server-only items as placeholders and auto-download', async () => {
      // Set up checkSyncStatus to return server-only items
      const serverItems = [
        {
          mediaId: 'server-1',
          filename: 'server-img.png',
          size: 500,
          mimeType: 'image/png',
          status: 'server-only' as const,
          server: {
            filename: 'server-img.png',
            size: 500,
            mimeType: 'image/png',
            uploadedAt: '2024-01-04T00:00:00Z',
          },
        },
        {
          mediaId: 'server-2',
          filename: 'server-img2.jpg',
          size: 600,
          mimeType: 'image/jpeg',
          status: 'server-only' as const,
          server: {
            filename: 'server-img2.jpg',
            size: 600,
            mimeType: 'image/jpeg',
            uploadedAt: '2024-01-05T00:00:00Z',
          },
        },
      ];

      // After the first checkServerMedia call (which triggers auto-download),
      // loadMedia runs again and calls checkServerMedia. Break the cycle by
      // returning empty items on subsequent calls.
      let syncCallCount = 0;
      mediaSyncService.checkSyncStatus.mockImplementation(() => {
        syncCallCount++;
        if (syncCallCount <= 1) {
          return Promise.resolve({
            isSyncing: false,
            lastChecked: null,
            needsDownload: serverItems.length,
            needsUpload: 0,
            items: serverItems,
            downloadProgress: 0,
          });
        }
        return Promise.resolve({
          isSyncing: false,
          lastChecked: null,
          needsDownload: 0,
          needsUpload: 0,
          items: [],
          downloadProgress: 0,
        });
      });
      mediaSyncService.downloadAllFromServer.mockClear();
      mediaSyncService.downloadAllFromServer.mockResolvedValue(undefined);

      // Clear local items so only server items remain
      localStorageService.listMedia.mockResolvedValue([]);

      // Call checkServerMedia directly with an empty local items array.
      // Set projectKey first since ngOnInit hasn't run yet.
      component['projectKey'] = 'testuser/test-project';
      await component['checkServerMedia']([]);
      await flushPromises();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      // Should auto-download since no local items exist
      expect(mediaSyncService.downloadAllFromServer).toHaveBeenCalledWith(
        'testuser/test-project'
      );
      // After auto-download completes, serverItemsCount is reset to 0
      expect(component.serverItemsCount()).toBe(0);
      // Downloading flags should be cleared after completion
      expect(component.downloadingItemIds().size).toBe(0);
    });

    it('should not auto-download when local items exist', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const serverItems = [
        {
          mediaId: 'media-1', // Same as local — should be skipped
          filename: 'image1.png',
          size: 1024,
          mimeType: 'image/png',
          status: 'server-only' as const,
          server: {
            filename: 'image1.png',
            size: 1024,
            mimeType: 'image/png',
            uploadedAt: '2024-01-01T00:00:00Z',
          },
        },
        {
          mediaId: 'server-extra',
          filename: 'extra.png',
          size: 300,
          mimeType: 'image/png',
          status: 'server-only' as const,
          server: {
            filename: 'extra.png',
            size: 300,
            mimeType: 'image/png',
            uploadedAt: '2024-01-06T00:00:00Z',
          },
        },
      ];

      mediaSyncService.checkSyncStatus.mockResolvedValue({
        isSyncing: false,
        lastChecked: null,
        needsDownload: serverItems.length,
        needsUpload: 0,
        items: serverItems,
        downloadProgress: 0,
      });
      mediaSyncService.downloadAllFromServer.mockClear();
      mediaSyncService.downloadAllFromServer.mockResolvedValue(undefined);

      // Call checkServerMedia with a local item — should NOT auto-download
      const localItem = { ...mockMediaItems[0] };
      await component['checkServerMedia']([localItem]);
      await flushPromises();
      await flushPromises();

      // Should not auto-download because local items exist
      expect(mediaSyncService.downloadAllFromServer).not.toHaveBeenCalled();

      // Should skip server items that exist locally
      const items = component.mediaItems();
      const serverOnly = items.filter(i => i.syncStatus === 'server-only');
      expect(serverOnly).toHaveLength(1);
      expect(serverOnly[0].mediaId).toBe('server-extra');
    });
  });

  describe('syncFromServer', () => {
    it('should sync all media and reset state', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      mediaSyncService.downloadAllFromServer.mockClear();
      localStorageService.listMedia.mockResolvedValueOnce([mockMediaItems[0]]);

      await component.syncFromServer();

      expect(mediaSyncService.downloadAllFromServer).toHaveBeenCalledWith(
        'testuser/test-project'
      );
      expect(component.isSyncing()).toBe(false);
      expect(component.serverItemsCount()).toBe(0);
    });

    it('should set error on sync failure', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      mediaSyncService.downloadAllFromServer.mockRejectedValueOnce(
        new Error('Sync failed')
      );

      await component.syncFromServer();

      expect(component.error()).toBe('Failed to sync media from server');
      expect(component.isSyncing()).toBe(false);
    });
  });

  describe('clearSearch', () => {
    it('should reset the search query', () => {
      component.searchQuery.set('test query');
      expect(component.searchQuery()).toBe('test query');

      component.clearSearch();
      expect(component.searchQuery()).toBe('');
    });
  });

  describe('filteredItems', () => {
    it('should return all items when no search query', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      component.searchQuery.set('');
      expect(component.filteredItems()).toHaveLength(
        component.mediaItems().length
      );
    });

    it('should filter items by filename', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      component.searchQuery.set('image1');
      const filtered = component.filteredItems();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].filename).toBe('image1.png');
    });

    it('should filter items by mediaId', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      component.searchQuery.set('media-2');
      const filtered = component.filteredItems();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].mediaId).toBe('media-2');
    });

    it('should return empty when no match', async () => {
      fixture.detectChanges();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      component.searchQuery.set('nonexistent');
      expect(component.filteredItems()).toHaveLength(0);
    });
  });
});
