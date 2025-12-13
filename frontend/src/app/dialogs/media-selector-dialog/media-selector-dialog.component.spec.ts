import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  MediaInfo,
  OfflineStorageService,
} from '@services/offline/offline-storage.service';
import { MockedObject, vi } from 'vitest';

import {
  MediaSelectorDialogComponent,
  MediaSelectorDialogData,
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
  let offlineStorageService: MockedObject<OfflineStorageService>;

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

    offlineStorageService = {
      listMedia: vi.fn().mockResolvedValue(mockMediaItems),
      getMedia: vi
        .fn()
        .mockResolvedValue(new Blob(['test'], { type: 'image/png' })),
    } as unknown as MockedObject<OfflineStorageService>;

    // Mock URL.createObjectURL
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      imports: [MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: OfflineStorageService, useValue: offlineStorageService },
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
      imports: [MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { username: 'test', slug: 'proj' },
        },
        { provide: OfflineStorageService, useValue: offlineStorageService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(MediaSelectorDialogComponent);
    const newComponent = newFixture.componentInstance;
    expect(newComponent.title).toBe('Select Image');
  });

  it('should load media on init', async () => {
    fixture.detectChanges();
    await flushPromises();

    expect(offlineStorageService.listMedia).toHaveBeenCalledWith(
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
      imports: [MediaSelectorDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { username: 'test', slug: 'proj', filterType: 'all' },
        },
        { provide: OfflineStorageService, useValue: offlineStorageService },
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

    expect(offlineStorageService.getMedia).toHaveBeenCalledWith(
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
    offlineStorageService.listMedia.mockRejectedValueOnce(
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
});
