import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaTagService } from '@services/media-tag/media-tag.service';
import { type MockedObject, vi } from 'vitest';

import { MediaPanelComponent } from './media-panel.component';

describe('MediaPanelComponent', () => {
  let component: MediaPanelComponent;
  let fixture: ComponentFixture<MediaPanelComponent>;
  let mediaTagService: MockedObject<MediaTagService>;
  let localStorageService: MockedObject<LocalStorageService>;
  let dialogGateway: MockedObject<DialogGatewayService>;

  const mockMediaTags = signal<string[]>([]);

  beforeEach(async () => {
    mockMediaTags.set([]);

    mediaTagService = {
      getMediaForElement: vi.fn().mockImplementation(() => mockMediaTags()),
      addTag: vi.fn(),
      removeTag: vi.fn(),
    } as unknown as MockedObject<MediaTagService>;

    localStorageService = {
      getMediaUrl: vi.fn().mockResolvedValue('blob:http://localhost/mock-url'),
    } as unknown as MockedObject<LocalStorageService>;

    dialogGateway = {
      openImageViewerDialog: vi.fn(),
      openMediaSelectorDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [MediaPanelComponent, NoopAnimationsModule],
      providers: [
        { provide: MediaTagService, useValue: mediaTagService },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: DialogGatewayService, useValue: dialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaPanelComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('elementId', 'test-element');
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-project');
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show empty state when no media is tagged', () => {
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.media-panel-empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No media tagged');
  });

  it('should show media grid when media is tagged', () => {
    mockMediaTags.set(['img-1', 'img-2']);
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector(
      '[data-testid="media-panel-grid"]'
    );
    expect(grid).toBeTruthy();

    const items = fixture.nativeElement.querySelectorAll('app-media-item-card');
    expect(items.length).toBe(2);
  });

  it('should show tagged media count', () => {
    mockMediaTags.set(['img-1', 'img-2', 'img-3']);
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector('.media-count');
    expect(count?.textContent).toContain('3 tagged media');
  });

  it('should open media selector on tag button click', async () => {
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '[data-testid="tag-media-button"]'
    );
    expect(button).toBeTruthy();
    button.click();
    await fixture.whenStable();

    expect(dialogGateway.openMediaSelectorDialog).toHaveBeenCalledWith({
      username: 'testuser',
      slug: 'test-project',
      filterType: 'image',
      title: 'Select media to tag',
      multiSelect: true,
    });
  });

  it('should add tag when media is selected from dialog', async () => {
    dialogGateway.openMediaSelectorDialog.mockResolvedValue({
      selectedItems: [
        {
          mediaId: 'img-new',
          mimeType: 'image/png',
          size: 1024,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    });

    fixture.detectChanges();
    await component.openMediaSelector();

    expect(mediaTagService.addTag).toHaveBeenCalledWith(
      'img-new',
      'test-element'
    );
  });

  it('should remove tag on remove button click', () => {
    mockMediaTags.set(['img-1']);
    fixture.detectChanges();

    component.removeTag('img-1');
    expect(mediaTagService.removeTag).toHaveBeenCalledWith(
      'img-1',
      'test-element'
    );
  });

  it('should open image viewer dialog when viewing an image', async () => {
    localStorageService.getMediaUrl.mockResolvedValue(
      'blob:http://localhost/test'
    );
    fixture.detectChanges();

    await component.viewImage('img-1');

    expect(dialogGateway.openImageViewerDialog).toHaveBeenCalledWith({
      imageUrl: 'blob:http://localhost/test',
      fileName: 'img-1',
      mediaId: 'img-1',
    });
  });

  it('should not open image viewer when URL is not available', async () => {
    localStorageService.getMediaUrl.mockResolvedValue(null);
    fixture.detectChanges();

    await component.viewImage('img-1');

    expect(dialogGateway.openImageViewerDialog).not.toHaveBeenCalled();
  });

  it('should remove tag when image viewer returns delete', async () => {
    localStorageService.getMediaUrl.mockResolvedValue(
      'blob:http://localhost/test'
    );
    dialogGateway.openImageViewerDialog.mockResolvedValue('delete');
    fixture.detectChanges();

    await component.viewImage('img-1');

    expect(mediaTagService.removeTag).toHaveBeenCalledWith(
      'img-1',
      'test-element'
    );
  });

  it('should not remove tag when image viewer returns undefined', async () => {
    localStorageService.getMediaUrl.mockResolvedValue(
      'blob:http://localhost/test'
    );
    dialogGateway.openImageViewerDialog.mockResolvedValue(undefined);
    fixture.detectChanges();

    await component.viewImage('img-1');

    expect(mediaTagService.removeTag).not.toHaveBeenCalled();
  });

  it('should load media URLs for tagged media', async () => {
    mockMediaTags.set(['img-1']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(localStorageService.getMediaUrl).toHaveBeenCalledWith(
      'testuser/test-project',
      'img-1'
    );
  });
});
