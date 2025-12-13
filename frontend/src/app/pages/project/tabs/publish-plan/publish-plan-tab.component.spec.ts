import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BackmatterItem,
  BackmatterType,
  createDefaultPublishPlan,
  type ElementItem,
  type FrontmatterItem,
  FrontmatterType,
  PublishFormat,
  PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
  type SeparatorItem,
  SeparatorStyle,
  type TableOfContentsItem,
  type WorldbuildingItem,
} from '../../../../models/publish-plan';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { PublishService } from '../../../../services/publish/publish.service';
import { PublishPlanTabComponent } from './publish-plan-tab.component';

describe('PublishPlanTabComponent', () => {
  let component: PublishPlanTabComponent;
  let fixture: ComponentFixture<PublishPlanTabComponent>;
  let mockProjectState: {
    elements: ReturnType<typeof signal<any[]>>;
    project: ReturnType<typeof signal<any>>;
    getPublishPlan: ReturnType<typeof vi.fn>;
    updatePublishPlan: ReturnType<typeof vi.fn>;
  };
  let mockPublishService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let testPlan: PublishPlan;

  beforeEach(async () => {
    testPlan = createDefaultPublishPlan('Test Project', 'Test Author');

    mockProjectState = {
      elements: signal([
        { id: 'elem-1', name: 'Chapter 1', type: ElementType.Item },
        { id: 'elem-2', name: 'Chapter 2', type: ElementType.Item },
        { id: 'folder-1', name: 'Folder', type: ElementType.Folder },
      ]),
      project: signal({ title: 'Test Project', coverImage: null }),
      getPublishPlan: vi.fn().mockReturnValue(testPlan),
      updatePublishPlan: vi.fn(),
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

    await TestBed.configureTestingModule({
      imports: [PublishPlanTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: PublishService, useValue: mockPublishService },
        { provide: MatSnackBar, useValue: mockSnackBar },
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

  it('should display plan name', () => {
    const header = fixture.nativeElement.querySelector('.plan-header h2');
    expect(header?.textContent).toContain('Default Export');
  });

  it('should show save button when changes are made', () => {
    let saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    expect(saveBtn).toBeNull();

    component['hasChanges'].set(true);
    fixture.detectChanges();

    saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toContain('Save Changes');
  });

  it('should call updatePublishPlan when saving', async () => {
    component['hasChanges'].set(true);
    fixture.detectChanges();

    const saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    saveBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockProjectState.updatePublishPlan).toHaveBeenCalled();
  });

  describe('updateName', () => {
    it('should update plan name and set hasChanges', () => {
      const event = { target: { value: 'New Name' } } as unknown as Event;
      component.updateName(event);

      expect(component['localPlan']()?.name).toBe('New Name');
      expect(component['hasChanges']()).toBe(true);
    });

    it('should not update if no local plan', () => {
      component['localPlan'].set(null);
      const event = { target: { value: 'New Name' } } as unknown as Event;
      component.updateName(event);

      expect(component['hasChanges']()).toBe(false);
    });
  });

  describe('updateFormat', () => {
    it('should update plan format', () => {
      const event = {
        target: { value: PublishFormat.PDF_SIMPLE },
      } as unknown as Event;
      component.updateFormat(event);

      expect(component['localPlan']()?.format).toBe(PublishFormat.PDF_SIMPLE);
      expect(component['hasChanges']()).toBe(true);
    });
  });

  describe('updateFormatSelect', () => {
    it('should update format from mat-select', () => {
      component.updateFormatSelect({ value: PublishFormat.HTML });

      expect(component['localPlan']()?.format).toBe(PublishFormat.HTML);
      expect(component['hasChanges']()).toBe(true);
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata field', () => {
      const event = {
        target: { value: 'New Title' },
      } as unknown as Event;
      component.updateMetadata('title', event);

      expect(component['localPlan']()?.metadata.title).toBe('New Title');
      expect(component['hasChanges']()).toBe(true);
    });
  });

  describe('updateOption', () => {
    it('should update boolean option from checkbox', () => {
      const event = {
        target: { type: 'checkbox', checked: true },
      } as unknown as Event;
      component.updateOption('includeToc', event);

      expect(component['localPlan']()?.options.includeToc).toBe(true);
      expect(component['hasChanges']()).toBe(true);
    });

    it('should update string option from input', () => {
      const event = {
        target: { type: 'text', value: '---' },
      } as unknown as Event;
      component.updateOption('sceneBreakText', event);

      expect(component['localPlan']()?.options.sceneBreakText).toBe('---');
    });
  });

  describe('updateOptionCheckbox', () => {
    it('should update option from mat-checkbox', () => {
      component.updateOptionCheckbox('includeCover', { checked: true });

      expect(component['localPlan']()?.options.includeCover).toBe(true);
      expect(component['hasChanges']()).toBe(true);
    });
  });

  describe('addElement', () => {
    it('should add element item to plan', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.addElement('elem-1');

      const plan = component['localPlan']();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Element);
      expect((lastItem as { elementId: string }).elementId).toBe('elem-1');
      expect(component['hasChanges']()).toBe(true);
      expect(component['showAddItemMenu']()).toBe(false);
    });
  });

  describe('addFrontmatter', () => {
    it('should add frontmatter item', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.addFrontmatter(FrontmatterType.TitlePage);

      const plan = component['localPlan']();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Frontmatter);
    });
  });

  describe('addBackmatter', () => {
    it('should add backmatter item', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.addBackmatter(BackmatterType.Acknowledgments);

      const plan = component['localPlan']();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Backmatter);
    });
  });

  describe('addSeparator', () => {
    it('should add separator item', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.addSeparator(SeparatorStyle.PageBreak);

      const plan = component['localPlan']();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.Separator);
    });
  });

  describe('addTableOfContents', () => {
    it('should add TOC item', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.addTableOfContents();

      const plan = component['localPlan']();
      expect(plan?.items.length).toBe(initialLength + 1);
      const lastItem = plan?.items[plan.items.length - 1];
      expect(lastItem?.type).toBe(PublishPlanItemType.TableOfContents);
    });
  });

  describe('removeItem', () => {
    it('should remove item from plan', () => {
      // First add an item
      component.addElement('elem-1');
      const plan = component['localPlan']();
      const addedItem = plan?.items[plan.items.length - 1];
      const lengthAfterAdd = plan?.items.length ?? 0;

      // Then remove it
      component.removeItem(addedItem!.id);

      expect(component['localPlan']()?.items.length).toBe(lengthAfterAdd - 1);
    });
  });

  describe('moveItemUp', () => {
    it('should move item up in list', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = component['localPlan']();
      const lastItemId = plan?.items[plan.items.length - 1].id;
      const lastIndex = (plan?.items.length ?? 1) - 1;

      component.moveItemUp(lastIndex);

      const updatedPlan = component['localPlan']();
      expect(updatedPlan?.items[lastIndex - 1].id).toBe(lastItemId);
    });

    it('should not move first item up', () => {
      const plan = component['localPlan']();
      const firstItemId = plan?.items[0]?.id;

      component.moveItemUp(0);

      expect(component['localPlan']()?.items[0]?.id).toBe(firstItemId);
    });
  });

  describe('moveItemDown', () => {
    it('should move item down in list', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = component['localPlan']();
      const firstItemId = plan?.items[0].id;

      component.moveItemDown(0);

      expect(component['localPlan']()?.items[1].id).toBe(firstItemId);
    });

    it('should not move last item down', () => {
      const plan = component['localPlan']();
      const lastIndex = (plan?.items.length ?? 1) - 1;
      const lastItemId = plan?.items[lastIndex]?.id;

      component.moveItemDown(lastIndex);

      expect(component['localPlan']()?.items[lastIndex]?.id).toBe(lastItemId);
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

    it('should return person for characters', () => {
      expect(component.getElementIcon({ type: ElementType.Character })).toBe(
        'person'
      );
    });

    it('should return place for locations', () => {
      expect(component.getElementIcon({ type: ElementType.Location })).toBe(
        'place'
      );
    });

    it('should return map for maps', () => {
      expect(component.getElementIcon({ type: ElementType.Map })).toBe('map');
    });
  });

  describe('discardChanges', () => {
    it('should reset local plan to original', () => {
      component.updateName({
        target: { value: 'Changed' },
      } as unknown as Event);
      expect(component['localPlan']()?.name).toBe('Changed');

      component.discardChanges();

      expect(component['localPlan']()?.name).toBe('Default Export');
      expect(component['hasChanges']()).toBe(false);
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
      component['localPlan'].set({ ...testPlan, items: [] });

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
  });

  describe('dropItem', () => {
    it('should reorder items on drop', () => {
      component.addElement('elem-1');
      component.addElement('elem-2');
      const plan = component['localPlan']();
      const items = plan?.items ?? [];

      const event: CdkDragDrop<PublishPlanItem[]> = {
        previousIndex: 0,
        currentIndex: 1,
        container: { data: items },
        previousContainer: { data: items },
      } as CdkDragDrop<PublishPlanItem[]>;

      const firstItemId = items[0]?.id;
      component.dropItem(event);

      expect(component['localPlan']()?.items[1]?.id).toBe(firstItemId);
      expect(component['hasChanges']()).toBe(true);
    });
  });

  describe('onElementSelected', () => {
    it('should add element when selected', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.onElementSelected({ value: 'elem-1' });

      expect(component['localPlan']()?.items.length).toBe(initialLength + 1);
    });

    it('should not add element when value is null', () => {
      const initialLength = component['localPlan']()?.items.length ?? 0;
      component.onElementSelected({ value: null });

      expect(component['localPlan']()?.items.length).toBe(initialLength);
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

    it('should return working plan', () => {
      expect(component['workingPlan']).toBeTruthy();
      expect(component['workingPlan']?.name).toBe('Default Export');
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
