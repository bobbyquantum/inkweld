import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { type TagDefinition } from '@components/tags/tag.model';
import { type Element, ElementType } from '@inkweld/index';
import { MediaTagService } from '@services/media-tag/media-tag.service';
import { MediaProjectTagService } from '@services/project/media-project-tag.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

import {
  ImageViewerDialogComponent,
  type ImageViewerDialogData,
} from './image-viewer-dialog.component';

describe('ImageViewerDialogComponent', () => {
  let component: ImageViewerDialogComponent;
  let fixture: ComponentFixture<ImageViewerDialogComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  let mockDialogData: ImageViewerDialogData;

  const allTagDefs: TagDefinition[] = [
    { id: 'tag-1', name: 'Hero', icon: 'star', color: '#ff0000' },
    { id: 'tag-2', name: 'Villain', icon: 'skull', color: '#000000' },
    { id: 'tag-3', name: 'NPC', icon: 'person', color: '#00ff00' },
  ];

  const allElements: Element[] = [
    {
      id: 'el-1',
      name: 'Char A',
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'el-2',
      name: 'Loc B',
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  const mockTagService = {
    allTags: signal(allTagDefs),
  };

  const mockMediaProjectTagService = {
    getTagsForMedia: vi.fn().mockReturnValue([]),
    addTag: vi.fn(),
    removeTag: vi.fn(),
  };

  const mockMediaTagService = {
    getElementsForMedia: vi.fn().mockReturnValue([]),
    addTag: vi.fn(),
    removeTag: vi.fn(),
  };

  const mockProjectState = {
    elements: signal(allElements),
  };

  const mockMatDialog = {
    open: vi
      .fn()
      .mockReturnValue({ afterClosed: () => ({ subscribe: vi.fn() }) }),
  };

  beforeEach(async () => {
    mockDialogData = {
      imageUrl: 'http://example.com/test.jpg',
      fileName: 'test.jpg',
    };
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ImageViewerDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: TagService, useValue: mockTagService },
        {
          provide: MediaProjectTagService,
          useValue: mockMediaProjectTagService,
        },
        { provide: MediaTagService, useValue: mockMediaTagService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: MatDialog, useValue: mockMatDialog },
      ],
    })
      .overrideComponent(ImageViewerDialogComponent, {
        set: {
          providers: [{ provide: MatDialog, useValue: mockMatDialog }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ImageViewerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the image', () => {
    const imageElement = fixture.nativeElement.querySelector(
      '.viewer-container img'
    );

    expect(imageElement.src).toContain('http://example.com/test.jpg');
    expect(imageElement.alt).toBe('test.jpg');
  });

  it('should close the dialog when closeDialog is called', () => {
    component.closeDialog();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should initialize zoom and pan at default values', () => {
    expect(component.zoomLevel()).toBe(1);
    expect(component.panX()).toBe(0);
    expect(component.panY()).toBe(0);
  });

  it('should zoom in on wheel towards cursor point', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    const image = component.imageElement()?.nativeElement as HTMLImageElement;

    // Mock layout sizes
    container.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 200,
          height: 100,
          right: 200,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    );
    Object.defineProperty(image, 'naturalWidth', { value: 400 });
    Object.defineProperty(image, 'naturalHeight', { value: 200 });

    const preventDefault = vi.fn();
    component.onWheel({
      deltaY: -100,
      clientX: 100,
      clientY: 50,
      preventDefault,
    } as unknown as WheelEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.zoomLevel()).toBeGreaterThan(1);
    expect(component.panX()).toBeCloseTo(0);
    expect(component.panY()).toBeCloseTo(0);
  });

  it('should toggle zoom on double click', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    container.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 300,
          height: 200,
          right: 300,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    );

    // Zoom in from fit
    component.onDoubleClick({
      clientX: 150,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);
    expect(component.zoomLevel()).toBeCloseTo(2);

    // Reset when already zoomed
    component.panX.set(25);
    component.panY.set(-10);
    component.onDoubleClick({
      clientX: 150,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);
    expect(component.zoomLevel()).toBe(1);
    expect(component.panX()).toBe(0);
    expect(component.panY()).toBe(0);
  });

  it('should pan when dragging at zoomed level', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    container.setPointerCapture = vi.fn();
    container.releasePointerCapture = vi.fn();

    component.zoomLevel.set(2);
    component.onPointerDown({
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      target: container,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    component.onPointerMove({
      pointerId: 1,
      clientX: 30,
      clientY: 35,
    } as unknown as PointerEvent);

    expect(component.panX()).toBe(20);
    expect(component.panY()).toBe(25);

    component.onPointerUp({
      pointerId: 1,
      target: container,
    } as unknown as PointerEvent);
    expect(container.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  describe('tag management', () => {
    it('should return empty resolvedProjectTags when no mediaId', () => {
      expect(component.resolvedProjectTags()).toEqual([]);
    });

    it('should resolve project tags for media', () => {
      component.data.mediaId = 'media-1';
      mockMediaProjectTagService.getTagsForMedia.mockReturnValue([
        'tag-1',
        'tag-2',
      ]);
      const result = component.resolvedProjectTags();
      expect(result).toEqual([allTagDefs[0], allTagDefs[1]]);
    });

    it('should filter out unknown tag IDs in resolvedProjectTags', () => {
      component.data.mediaId = 'media-1';
      mockMediaProjectTagService.getTagsForMedia.mockReturnValue([
        'tag-1',
        'nonexistent',
      ]);
      const result = component.resolvedProjectTags();
      expect(result).toEqual([allTagDefs[0]]);
    });

    it('should compute filteredAvailableTags excluding assigned', () => {
      component.data.mediaId = 'media-1';
      mockMediaProjectTagService.getTagsForMedia.mockReturnValue(['tag-1']);
      const available = component.filteredAvailableTags();
      expect(available.map(t => t.id)).toEqual(['tag-2', 'tag-3']);
    });

    it('should return all tags as available when none assigned', () => {
      component.data.mediaId = 'media-1';
      mockMediaProjectTagService.getTagsForMedia.mockReturnValue([]);
      expect(component.filteredAvailableTags().length).toBe(3);
    });

    it('should return empty resolvedElementTags when no mediaId', () => {
      expect(component.resolvedElementTags()).toEqual([]);
    });

    it('should resolve element tags for media', () => {
      component.data.mediaId = 'media-1';
      mockMediaTagService.getElementsForMedia.mockReturnValue(['el-1', 'el-2']);
      expect(component.resolvedElementTags()).toEqual(allElements);
    });

    it('should filter out unknown element IDs in resolvedElementTags', () => {
      component.data.mediaId = 'media-1';
      mockMediaTagService.getElementsForMedia.mockReturnValue([
        'el-1',
        'nonexistent',
      ]);
      expect(component.resolvedElementTags().length).toBe(1);
    });

    it('should add project tag by id', () => {
      component.data.mediaId = 'media-1';
      component.addProjectTagById(allTagDefs[0]);
      expect(mockMediaProjectTagService.addTag).toHaveBeenCalledWith(
        'media-1',
        'tag-1'
      );
    });

    it('should not add project tag when no mediaId', () => {
      component.addProjectTagById(allTagDefs[0]);
      expect(mockMediaProjectTagService.addTag).not.toHaveBeenCalled();
    });

    it('should remove project tag', () => {
      component.data.mediaId = 'media-1';
      component.removeProjectTag(allTagDefs[0]);
      expect(mockMediaProjectTagService.removeTag).toHaveBeenCalledWith(
        'media-1',
        'tag-1'
      );
    });

    it('should not remove project tag when no mediaId', () => {
      component.removeProjectTag(allTagDefs[0]);
      expect(mockMediaProjectTagService.removeTag).not.toHaveBeenCalled();
    });

    it('should remove element tag', () => {
      component.data.mediaId = 'media-1';
      component.removeElementTag('el-1');
      expect(mockMediaTagService.removeTag).toHaveBeenCalledWith(
        'media-1',
        'el-1'
      );
    });

    it('should not remove element tag when no mediaId', () => {
      component.removeElementTag('el-1');
      expect(mockMediaTagService.removeTag).not.toHaveBeenCalled();
    });

    it('should open tag picker and apply results', () => {
      component.data.mediaId = 'media-1';
      mockMediaProjectTagService.getTagsForMedia.mockReturnValue(['tag-1']);
      mockMediaTagService.getElementsForMedia.mockReturnValue(['el-1']);

      const result = {
        elements: [allElements[1]],
        tags: [allTagDefs[2]],
      };
      mockMatDialog.open.mockReturnValue({
        afterClosed: () => of(result),
      } as any);

      component.addTags();

      expect(mockMatDialog.open).toHaveBeenCalled();
      expect(mockMediaTagService.addTag).toHaveBeenCalledWith(
        'media-1',
        'el-2'
      );
      expect(mockMediaProjectTagService.addTag).toHaveBeenCalledWith(
        'media-1',
        'tag-3'
      );
    });

    it('should not open tag picker when no mediaId', () => {
      component.addTags();
      expect(mockMatDialog.open).not.toHaveBeenCalled();
    });

    it('should handle tag picker cancelled (null result)', () => {
      component.data.mediaId = 'media-1';
      mockMatDialog.open.mockReturnValue({
        afterClosed: () => of(null),
      } as any);

      component.addTags();

      expect(mockMediaTagService.addTag).not.toHaveBeenCalled();
      expect(mockMediaProjectTagService.addTag).not.toHaveBeenCalled();
    });
  });

  describe('dialog actions', () => {
    it('should download image', () => {
      const mockClick = vi.fn();
      const mockRemove = vi.fn();
      const appendSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockReturnValue(null as unknown as Node);
      const createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
        remove: mockRemove,
      } as unknown as HTMLAnchorElement);

      component.downloadImage();

      expect(mockClick).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
      appendSpy.mockRestore();
      createSpy.mockRestore();
    });

    it('should close with delete result', () => {
      component.deleteImage();
      expect(mockDialogRef.close).toHaveBeenCalledWith('delete');
    });

    it('should close with change-image result', () => {
      component.changeImage();
      expect(mockDialogRef.close).toHaveBeenCalledWith('change-image');
    });

    it('should toggle showInfo', () => {
      expect(component.showInfo()).toBe(false);
      component.showInfo.set(true);
      expect(component.showInfo()).toBe(true);
    });
  });

  describe('transform', () => {
    it('should return correct transform string', () => {
      expect(component.getTransform()).toBe('translate(0px, 0px) scale(1)');
      component.panX.set(10);
      component.panY.set(-5);
      component.zoomLevel.set(2);
      expect(component.getTransform()).toBe('translate(10px, -5px) scale(2)');
    });
  });

  it('should prevent drag start', () => {
    const preventDefault = vi.fn();
    component.onDragStart({ preventDefault } as unknown as DragEvent);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('should not pan when at min zoom', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    container.setPointerCapture = vi.fn();

    component.zoomLevel.set(1);
    component.onPointerDown({
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      target: container,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    component.onPointerMove({
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    } as unknown as PointerEvent);

    expect(component.panX()).toBe(0);
    expect(component.panY()).toBe(0);
  });

  it('should handle zoom out on wheel', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    const image = component.imageElement()?.nativeElement as HTMLImageElement;

    container.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 200,
          height: 100,
          right: 200,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    );
    Object.defineProperty(image, 'naturalWidth', { value: 400 });
    Object.defineProperty(image, 'naturalHeight', { value: 200 });

    // Already at min zoom, zoom out should clamp
    component.onWheel({
      deltaY: 100,
      clientX: 100,
      clientY: 50,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent);

    expect(component.zoomLevel()).toBe(1);
  });
});
