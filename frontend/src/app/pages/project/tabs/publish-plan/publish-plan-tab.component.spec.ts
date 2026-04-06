import { type CdkDrag, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BackmatterItem,
  BackmatterType,
  createDefaultPublishPlan,
  type ElementItem,
  type FrontmatterItem,
  FrontmatterType,
  PublishFormat,
  type PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
  type SeparatorItem,
  SeparatorStyle,
  type TableOfContentsItem,
  type WorldbuildingItem,
} from '../../../../models/publish-plan';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { PublishService } from '../../../../services/publish/publish.service';
import { PublishedFilesService } from '../../../../services/publish/published-files.service';
import { WorldbuildingService } from '../../../../services/worldbuilding/worldbuilding.service';
import { PublishPlanTabComponent } from './publish-plan-tab.component';

describe('PublishPlanTabComponent', () => {
  let component: PublishPlanTabComponent;
  let fixture: ComponentFixture<PublishPlanTabComponent>;
  let currentPlan: ReturnType<typeof signal<PublishPlan | null>>;
  let mockProjectState: {
    elements: ReturnType<typeof signal<any[]>>;
    project: ReturnType<typeof signal<any>>;
    getPublishPlan: ReturnType<typeof vi.fn>;
    updatePublishPlan: ReturnType<typeof vi.fn>;
    coverMediaId: ReturnType<typeof signal<string | null>>;
  };
  let mockPublishService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let mockPublishedFilesService: {
    files$: BehaviorSubject<any[]>;
    loadFiles: ReturnType<typeof vi.fn>;
    downloadFile: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };
  let testPlan: PublishPlan;

  beforeEach(async () => {
    testPlan = createDefaultPublishPlan('Test Project', 'Test Author');
    currentPlan = signal<PublishPlan | null>(testPlan);

    mockProjectState = {
      elements: signal([
        { id: 'elem-1', name: 'Chapter 1', type: ElementType.Item },
        { id: 'elem-2', name: 'Chapter 2', type: ElementType.Item },
        { id: 'folder-1', name: 'Folder', type: ElementType.Folder },
      ]),
      project: signal({ title: 'Test Project', coverImage: null }),
      getPublishPlan: vi.fn().mockImplementation(() => currentPlan()),
      updatePublishPlan: vi.fn().mockImplementation((plan: PublishPlan) => {
        currentPlan.set(plan);
      }),
      coverMediaId: signal(null),
    };

    mockPublishService = {
      publish: vi.fn().mockResolvedValue({
        success: true,
        stats: { wordCount: 1000, chapterCount: 5 },
      }),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockPublishedFilesService = {
      files$: new BehaviorSubject<any[]>([]),
      loadFiles: vi.fn().mockResolvedValue([]),
      downloadFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [PublishPlanTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: PublishService, useValue: mockPublishService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        {
          provide: PublishedFilesService,
          useValue: mockPublishedFilesService,
        },
        {
          provide: WorldbuildingService,
          useValue: {
            getIconForType: vi.fn().mockReturnValue('auto_awesome'),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({
              get: (key: string) => (key === 'tabId' ? testPlan.id : null),
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishPlanTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }, 10000);

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display plan name input', () => {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="plan-name-input"]'
    );
    expect(input).toBeTruthy();
    expect(input.value).toContain('Default Export');
  });

  it('should show sidenav navigation sections', () => {
    expect(component['sections'].length).toBe(5);
    expect(component['sections'].map((s: { key: string }) => s.key)).toEqual([
      'metadata',
      'contents',
      'formatting',
      'preview',
      'publish',
    ]);
  });

  it('should switch sections via selectSection', () => {
    expect(component['selectedSection']()).toBe('metadata');
    component.selectSection('contents');
    expect(component['selectedSection']()).toBe('contents');
    component.selectSection('preview');
    expect(component['selectedSection']()).toBe('preview');
  });

  it('should auto-save when making changes', () => {
    const event = { target: { value: 'Updated Name' } } as unknown as Event;
    component.updateName(event);

    expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Name' })
    );
  });

  describe('updateName', () => {
    it('should auto-save plan name', () => {
      const event = { target: { value: 'New Name' } } as unknown as Event;
      component.updateName(event);

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name' })
      );
    });

    it('should not update if no plan', () => {
      currentPlan.set(null);
      const event = { target: { value: 'New Name' } } as unknown as Event;
      component.updateName(event);

      expect(mockProjectState.updatePublishPlan).not.toHaveBeenCalled();
    });
  });

  describe('updateFormat', () => {
    it('should auto-save plan format', () => {
      const event = {
        target: { value: PublishFormat.PDF_SIMPLE },
      } as unknown as Event;
      component.updateFormat(event);

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({ format: PublishFormat.PDF_SIMPLE })
      );
    });
  });

  describe('updateFormatSelect', () => {
    it('should auto-save format from mat-select', () => {
      component.updateFormatSelect({ value: PublishFormat.HTML });

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({ format: PublishFormat.HTML })
      );
    });
  });

  describe('updateMetadata', () => {
    it('should auto-save metadata field', () => {
      const event = {
        target: { value: 'New Title' },
      } as unknown as Event;
      component.updateMetadata('title', event);

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ title: 'New Title' }),
        })
      );
    });
  });

  describe('updateOption', () => {
    it('should auto-save boolean option from checkbox', () => {
      const event = {
        target: { type: 'checkbox', checked: true },
      } as unknown as Event;
      component.updateOption('includeToc', event);

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ includeToc: true }),
        })
      );
    });

    it('should auto-save string option from input', () => {
      const event = {
        target: { type: 'text', value: '---' },
      } as unknown as Event;
      component.updateOption('sceneBreakText', event);

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ sceneBreakText: '---' }),
        })
      );
    });
  });

  describe('updateOptionCheckbox', () => {
    it('should auto-save option from mat-checkbox', () => {
      component.updateOptionCheckbox('includeCover', { checked: true });

      expect(mockProjectState.updatePublishPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ includeCover: true }),
        })
      );
    });
  });

  describe('addElement', () => {
    it('should add element item to plan', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addElement('elem-1');

      const updatedPlan = currentPlan();
      expect(updatedPlan?.items.length).toBe(initialLength + 1);
      const lastItem = updatedPlan?.items[updatedPlan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Element);
      expect((lastItem as { elementId: string }).elementId).toBe('elem-1');
      expect(component['showAddItemMenu']()).toBe(false);
    });

    it('should insert element at specific index', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      component.addElement('elem-new', 1);

      const plan = currentPlan();
      expect(plan?.items.length).toBe(3);
      expect((plan?.items[1] as { elementId: string }).elementId).toBe(
        'elem-new'
      );
    });

    it('should append when index is undefined', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');

      const plan = currentPlan();
      expect(
        (plan?.items[plan.items.length - 1] as { elementId: string }).elementId
      ).toBe('elem-2');
    });

    it('should append when index is out of range', () => {
      component.addElement('elem-1');
      component.addElement('elem-2', 999);

      const plan = currentPlan();
      expect(
        (plan?.items[plan.items.length - 1] as { elementId: string }).elementId
      ).toBe('elem-2');
    });
  });

  describe('addFrontmatter', () => {
    it('should add frontmatter item', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addFrontmatter(FrontmatterType.TitlePage);

      const plan = currentPlan();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Frontmatter);
    });
  });

  describe('addBackmatter', () => {
    it('should add backmatter item', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addBackmatter(BackmatterType.Acknowledgments);

      const plan = currentPlan();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Backmatter);
    });
  });

  describe('addSeparator', () => {
    it('should add separator item', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addSeparator(SeparatorStyle.PageBreak);

      const plan = currentPlan();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Separator);
    });
  });

  describe('addTableOfContents', () => {
    it('should add TOC item', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addTableOfContents();

      const plan = currentPlan();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.TableOfContents);
    });
  });

  describe('addEverything', () => {
    it('should add all non-folder elements in order', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.addEverything();

      const plan = currentPlan();
      // Should add elem-1 and elem-2 (not folder-1)
      expect(plan?.items.length).toBe(initialLength + 2);
      const addedItems = plan!.items.slice(initialLength);
      expect(addedItems[0].type).toBe(PublishPlanItemType.Element);
      expect((addedItems[0] as ElementItem).elementId).toBe('elem-1');
      expect((addedItems[1] as ElementItem).elementId).toBe('elem-2');
    });

    it('should not add items when no document elements exist', () => {
      mockProjectState.elements.set([
        { id: 'folder-1', name: 'Folder', type: ElementType.Folder },
      ]);

      const initialLength = currentPlan()?.items.length ?? 0;
      component.addEverything();

      expect(currentPlan()?.items.length).toBe(initialLength);
    });
  });

  describe('removeItem', () => {
    it('should remove item from plan', () => {
      // First add an item
      component.addElement('elem-1');
      const plan = currentPlan();
      const addedItem = plan?.items[plan.items.length - 1];
      const lengthAfterAdd = plan?.items.length ?? 0;

      // Then remove it
      component.removeItem(addedItem!.id);

      expect(currentPlan()?.items.length).toBe(lengthAfterAdd - 1);
    });
  });

  describe('moveItemUp', () => {
    it('should move item up in list', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = currentPlan();
      const lastItemId = plan?.items[plan.items.length - 1].id;
      const lastIndex = (plan?.items.length ?? 1) - 1;

      component.moveItemUp(lastIndex);

      const updatedPlan = currentPlan();
      expect(updatedPlan?.items[lastIndex - 1].id).toBe(lastItemId);
    });

    it('should not move first item up', () => {
      const plan = currentPlan();
      const firstItemId = plan?.items[0]?.id;

      component.moveItemUp(0);

      expect(currentPlan()?.items[0]?.id).toBe(firstItemId);
    });
  });

  describe('moveItemDown', () => {
    it('should move item down in list', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = currentPlan();
      const firstItemId = plan?.items[0].id;

      component.moveItemDown(0);

      expect(currentPlan()?.items[1].id).toBe(firstItemId);
    });

    it('should not move last item down', () => {
      const plan = currentPlan();
      const lastIndex = (plan?.items.length ?? 1) - 1;
      const lastItemId = plan?.items[lastIndex]?.id;

      component.moveItemDown(lastIndex);

      expect(currentPlan()?.items[lastIndex]?.id).toBe(lastItemId);
    });
  });

  describe('getItemLabel', () => {
    it('should return element name for element items', () => {
      const item: ElementItem = {
        id: 'test',
        type: PublishPlanItemType.Element,
        elementId: 'elem-1',
        includeChildren: false,
      };
      expect(component.getItemLabel(item)).toBe('Chapter 1');
    });

    it('should return Unknown Element for missing element', () => {
      const item: ElementItem = {
        id: 'test',
        type: PublishPlanItemType.Element,
        elementId: 'non-existent',
        includeChildren: false,
      };
      expect(component.getItemLabel(item)).toBe('Unknown Element');
    });

    it('should return formatted label for frontmatter', () => {
      const item: FrontmatterItem = {
        id: 'test',
        type: PublishPlanItemType.Frontmatter,
        contentType: FrontmatterType.TitlePage,
      };
      expect(component.getItemLabel(item)).toContain('Frontmatter');
    });

    it('should return formatted label for backmatter', () => {
      const item: BackmatterItem = {
        id: 'test',
        type: PublishPlanItemType.Backmatter,
        contentType: BackmatterType.AboutAuthor,
      };
      expect(component.getItemLabel(item)).toContain('Backmatter');
    });

    it('should return formatted label for separator', () => {
      const item: SeparatorItem = {
        id: 'test',
        type: PublishPlanItemType.Separator,
        style: SeparatorStyle.PageBreak,
      };
      expect(component.getItemLabel(item)).toContain('Separator');
    });

    it('should return Table of Contents for TOC', () => {
      const item: TableOfContentsItem = {
        id: 'test',
        type: PublishPlanItemType.TableOfContents,
        title: 'Contents',
        depth: 2,
        includePageNumbers: false,
      };
      expect(component.getItemLabel(item)).toBe('Table of Contents');
    });

    it('should return worldbuilding label', () => {
      const item: WorldbuildingItem = {
        id: 'test',
        type: PublishPlanItemType.Worldbuilding,
        title: 'Characters',
        categories: [],
        format: 'appendix',
      };
      expect(component.getItemLabel(item)).toContain('Worldbuilding');
    });
  });

  describe('getItemIcon', () => {
    it('should return description for element', () => {
      const item: ElementItem = {
        id: 'test',
        type: PublishPlanItemType.Element,
        elementId: 'elem-1',
        includeChildren: false,
      };
      expect(component.getItemIcon(item)).toBe('description');
    });

    it('should return first_page for frontmatter', () => {
      const item: FrontmatterItem = {
        id: 'test',
        type: PublishPlanItemType.Frontmatter,
        contentType: FrontmatterType.TitlePage,
      };
      expect(component.getItemIcon(item)).toBe('first_page');
    });

    it('should return last_page for backmatter', () => {
      const item: BackmatterItem = {
        id: 'test',
        type: PublishPlanItemType.Backmatter,
        contentType: BackmatterType.AboutAuthor,
      };
      expect(component.getItemIcon(item)).toBe('last_page');
    });

    it('should return horizontal_rule for separator', () => {
      const item: SeparatorItem = {
        id: 'test',
        type: PublishPlanItemType.Separator,
        style: SeparatorStyle.PageBreak,
      };
      expect(component.getItemIcon(item)).toBe('horizontal_rule');
    });

    it('should return list for TOC', () => {
      const item: TableOfContentsItem = {
        id: 'test',
        type: PublishPlanItemType.TableOfContents,
        title: 'Contents',
        depth: 2,
        includePageNumbers: false,
      };
      expect(component.getItemIcon(item)).toBe('list');
    });

    it('should return public for worldbuilding', () => {
      const item: WorldbuildingItem = {
        id: 'test',
        type: PublishPlanItemType.Worldbuilding,
        title: 'Characters',
        categories: [],
        format: 'appendix',
      };
      expect(component.getItemIcon(item)).toBe('public');
    });
  });

  describe('formatEnumLabel', () => {
    it('should format hyphenated strings', () => {
      expect(component.formatEnumLabel('page-break')).toBe('Page Break');
    });

    it('should format camelCase strings', () => {
      expect(component.formatEnumLabel('titlePage')).toBe('Title Page');
    });
  });

  describe('getFormatDisplayName', () => {
    it('should return friendly name for EPUB', () => {
      expect(component.getFormatDisplayName(PublishFormat.EPUB)).toBe(
        'EPUB (E-Book)'
      );
    });

    it('should return friendly name for PDF', () => {
      expect(component.getFormatDisplayName(PublishFormat.PDF_SIMPLE)).toBe(
        'PDF'
      );
    });
  });

  describe('getElementIcon', () => {
    it('should return folder icon for folders', () => {
      expect(component.getElementIcon({ type: ElementType.Folder })).toBe(
        'folder'
      );
    });

    it('should return description for items', () => {
      expect(component.getElementIcon({ type: ElementType.Item })).toBe(
        'description'
      );
    });

    it('should return auto_awesome for worldbuilding with schemaId (no project mocked)', () => {
      expect(
        component.getElementIcon({
          type: ElementType.Worldbuilding,
          schemaId: 'character-v1',
        })
      ).toBe('auto_awesome');
    });

    it('should return auto_awesome for worldbuilding with schemaId (no project mocked) - location', () => {
      expect(
        component.getElementIcon({
          type: ElementType.Worldbuilding,
          schemaId: 'location-v1',
        })
      ).toBe('auto_awesome');
    });

    it('should return auto_awesome for worldbuilding with schemaId (no project mocked) - map', () => {
      expect(
        component.getElementIcon({
          type: ElementType.Worldbuilding,
          schemaId: 'map-v1',
        })
      ).toBe('auto_awesome');
    });
  });

  describe('generatePublication', () => {
    it('should call publish service and show success message', async () => {
      component.addElement('elem-1');
      await component.generatePublication();

      expect(mockPublishService.publish).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('1,000 words'),
        'OK',
        expect.any(Object)
      );
    });

    it('should show error message on failure', async () => {
      mockPublishService.publish.mockResolvedValue({
        success: false,
        error: 'Test error',
      });
      component.addElement('elem-1');

      await component.generatePublication();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Test error'),
        'Dismiss',
        expect.any(Object)
      );
    });

    it('should show cancelled message', async () => {
      mockPublishService.publish.mockResolvedValue({
        success: false,
        cancelled: true,
      });
      component.addElement('elem-1');

      await component.generatePublication();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Generation cancelled',
        undefined,
        expect.any(Object)
      );
    });

    it('should not generate if no items', async () => {
      // Clear items
      currentPlan.set({ ...testPlan, items: [] });

      await component.generatePublication();

      expect(mockPublishService.publish).not.toHaveBeenCalled();
    });

    it('should prevent double-click', async () => {
      component.addElement('elem-1');
      component['isGenerating'].set(true);

      await component.generatePublication();

      expect(mockPublishService.publish).not.toHaveBeenCalled();
    });

    it('should handle thrown errors', async () => {
      mockPublishService.publish.mockRejectedValue(new Error('Network error'));
      component.addElement('elem-1');

      await component.generatePublication();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
        'Dismiss',
        expect.any(Object)
      );
    });
  });

  describe('section toggles', () => {
    it('should toggle metadata section', () => {
      const initial = component['metadataExpanded']();
      component.toggleMetadata();
      expect(component['metadataExpanded']()).toBe(!initial);
    });

    it('should toggle options section', () => {
      const initial = component['optionsExpanded']();
      component.toggleOptions();
      expect(component['optionsExpanded']()).toBe(!initial);
    });

    it('should toggle items section', () => {
      const initial = component['itemsExpanded']();
      component.toggleItems();
      expect(component['itemsExpanded']()).toBe(!initial);
    });

    it('should toggle add item menu', () => {
      const initial = component['showAddItemMenu']();
      component.toggleAddItemMenu();
      expect(component['showAddItemMenu']()).toBe(!initial);
    });

    it('should select section', () => {
      component.selectSection('formatting');
      expect(component['selectedSection']()).toBe('formatting');
    });

    it('should support useSidenav signal', () => {
      expect(typeof component['useSidenav']()).toBe('boolean');
    });
  });

  describe('published files', () => {
    it('should filter published files by planId', () => {
      const planId = testPlan.id;
      mockPublishedFilesService.files$.next([
        {
          id: 'f1',
          planId,
          planName: 'Other Name',
          format: 'EPUB',
          filename: 'test.epub',
          size: 1000,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'f2',
          planId: 'other-plan',
          planName: 'Other',
          format: 'PDF_SIMPLE',
          filename: 'other.pdf',
          size: 2000,
          createdAt: '2026-01-02T00:00:00Z',
        },
      ]);

      const files = component['publishedFiles']();
      expect(files.length).toBe(1);
      expect(files[0].id).toBe('f1');
    });

    it('should fall back to planName matching for legacy records', () => {
      mockPublishedFilesService.files$.next([
        {
          id: 'f1',
          planId: null,
          planName: testPlan.name,
          format: 'EPUB',
          filename: 'test.epub',
          size: 1000,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const files = component['publishedFiles']();
      expect(files.length).toBe(1);
    });

    it('should download published file', async () => {
      mockProjectState.project.set({
        title: 'Test',
        username: 'user',
        slug: 'proj',
        coverImage: null,
      });
      await component.downloadPublishedFile('f1');
      expect(mockPublishedFilesService.downloadFile).toHaveBeenCalledWith(
        'user/proj',
        'f1'
      );
    });

    it('should delete published file', async () => {
      mockProjectState.project.set({
        title: 'Test',
        username: 'user',
        slug: 'proj',
        coverImage: null,
      });
      await component.deletePublishedFile('f1');
      expect(mockPublishedFilesService.deleteFile).toHaveBeenCalledWith(
        'user/proj',
        'f1'
      );
    });

    it('should get format icon', () => {
      expect(component.getPublishedFormatIcon('EPUB')).toBe('book');
      expect(component.getPublishedFormatIcon('PDF_SIMPLE')).toBe(
        'picture_as_pdf'
      );
      expect(component.getPublishedFormatIcon('unknown')).toBe(
        'insert_drive_file'
      );
    });
  });

  describe('dropItem', () => {
    it('should reorder items on drop', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = currentPlan();
      const items = plan?.items ?? [];

      const containerRef = { data: items };
      const event: CdkDragDrop<PublishPlanItem[]> = {
        previousIndex: 0,
        currentIndex: 1,
        container: containerRef,
        previousContainer: containerRef,
      } as CdkDragDrop<PublishPlanItem[]>;

      const firstItemId = items[0]?.id;
      component.dropItem(event);

      expect(currentPlan()?.items[1]?.id).toBe(firstItemId);
    });

    it('should add element at drop position on cross-container drop', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = currentPlan();
      const items = plan?.items ?? [];

      const treeContainer = { data: [] };
      const planContainer = { data: items };
      const event: CdkDragDrop<PublishPlanItem[]> = {
        previousIndex: 0,
        currentIndex: 1,
        container: planContainer,
        previousContainer: treeContainer,
        item: { data: { id: 'elem-3', type: ElementType.Item } },
      } as unknown as CdkDragDrop<PublishPlanItem[]>;

      component.dropItem(event);

      const updatedPlan = currentPlan();
      expect(updatedPlan?.items.length).toBe(3);
      expect((updatedPlan?.items[1] as { elementId: string }).elementId).toBe(
        'elem-3'
      );
    });

    it('should ignore cross-container drop with missing node id', () => {
      component.addElement('elem-1');
      const plan = currentPlan();
      const items = plan?.items ?? [];

      const treeContainer = { data: [] };
      const planContainer = { data: items };
      const event: CdkDragDrop<PublishPlanItem[]> = {
        previousIndex: 0,
        currentIndex: 0,
        container: planContainer,
        previousContainer: treeContainer,
        item: { data: { type: ElementType.Item } },
      } as unknown as CdkDragDrop<PublishPlanItem[]>;

      component.dropItem(event);

      expect(currentPlan()?.items.length).toBe(1);
    });

    it('should do nothing when plan is null', () => {
      currentPlan.set(null);
      const event: CdkDragDrop<PublishPlanItem[]> = {
        previousIndex: 0,
        currentIndex: 0,
        container: { data: [] },
        previousContainer: { data: [] },
      } as unknown as CdkDragDrop<PublishPlanItem[]>;

      expect(() => component.dropItem(event)).not.toThrow();
    });
  });

  describe('canEnterPublishList', () => {
    it('should allow document elements', () => {
      const drag = { data: { type: ElementType.Item } } as unknown as CdkDrag;
      expect(component.canEnterPublishList(drag)).toBe(true);
    });

    it('should reject folders', () => {
      const drag = {
        data: { type: ElementType.Folder },
      } as unknown as CdkDrag;
      expect(component.canEnterPublishList(drag)).toBe(false);
    });

    it('should reject items with no type', () => {
      const drag = { data: {} } as unknown as CdkDrag;
      expect(component.canEnterPublishList(drag)).toBe(false);
    });
  });

  describe('onElementSelected', () => {
    it('should add element when selected', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.onElementSelected({ value: 'elem-1' });

      expect(currentPlan()?.items.length).toBe(initialLength + 1);
    });

    it('should not add element when value is null', () => {
      const initialLength = currentPlan()?.items.length ?? 0;
      component.onElementSelected({ value: null });

      expect(currentPlan()?.items.length).toBe(initialLength);
    });
  });

  describe('computed properties', () => {
    it('should filter document elements', () => {
      const docs = component['documentElements']();
      expect(docs.length).toBe(2);
      expect(docs.every(e => e.type !== ElementType.Folder)).toBe(true);
    });

    it('should return project cover image', () => {
      expect(component['projectCoverImage']()).toBeNull();

      mockProjectState.project.set({ title: 'Test', coverImage: 'cover.jpg' });
      expect(component['projectCoverImage']()).toBe('cover.jpg');
    });

    it('should return plan', () => {
      expect(component['plan']()).toBeTruthy();
      expect(component['plan']()?.name).toBe('Default Export');
    });
  });

  describe('showPublishDialog', () => {
    it('should open dialog and handle close without navigation', async () => {
      const afterClosed$ = new Subject<undefined>();
      const mockDialogRef = {
        afterClosed: () => afterClosed$.asObservable(),
      } as unknown as MatDialogRef<unknown>;
      const mockDialog = TestBed.inject(MatDialog);
      vi.spyOn(mockDialog, 'open').mockReturnValue(mockDialogRef);

      const mockFile = { id: 'file-1', name: 'test.docx' } as never;
      const mockBlob = new Blob(['test']);

      component['showPublishDialog'](mockFile, mockBlob);
      afterClosed$.next(undefined);
      afterClosed$.complete();
      await fixture.whenStable();

      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should navigate to published-files when dialog result is view-files', async () => {
      const afterClosed$ = new Subject<{ action: string }>();
      const mockDialogRef = {
        afterClosed: () => afterClosed$.asObservable(),
      } as unknown as MatDialogRef<unknown>;
      const mockDialog = TestBed.inject(MatDialog);
      vi.spyOn(mockDialog, 'open').mockReturnValue(mockDialogRef);
      const mockRouter = TestBed.inject(Router);
      const navigateSpy = vi
        .spyOn(mockRouter, 'navigate')
        .mockResolvedValue(true);

      mockProjectState.project.set({
        title: 'Test',
        username: 'user',
        slug: 'proj',
        coverImage: null,
      });
      const mockFile = { id: 'file-1', name: 'test.docx' } as never;
      const mockBlob = new Blob(['test']);

      component['showPublishDialog'](mockFile, mockBlob);
      afterClosed$.next({ action: 'view-files' });
      afterClosed$.complete();
      await fixture.whenStable();

      expect(navigateSpy).toHaveBeenCalledWith([
        '/project',
        'user',
        'proj',
        'tab',
        'published-files',
      ]);
    });
  });
});

describe('PublishPlanTabComponent - no plan', () => {
  it('should handle missing plan gracefully', async () => {
    const mockProjectState = {
      elements: signal([]),
      project: signal({ title: 'Test', coverImage: null }),
      getPublishPlan: vi.fn().mockReturnValue(null),
      updatePublishPlan: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PublishPlanTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        {
          provide: PublishService,
          useValue: { publish: vi.fn() },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: () => 'non-existent' }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublishPlanTabComponent);
    fixture.detectChanges();

    // Component should not crash
    expect(fixture.componentInstance).toBeTruthy();
  });
});
