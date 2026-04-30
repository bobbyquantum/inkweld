import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { type Element, ElementType } from '@inkweld/index';
import { type TagDefinition } from '@models/tag.model';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { describe, expect, it, vi } from 'vitest';

import {
  TagPickerDialogComponent,
  type TagPickerDialogData,
} from './tag-picker-dialog.component';

describe('TagPickerDialogComponent', () => {
  let component: TagPickerDialogComponent;
  let dialogRef: MatDialogRef<TagPickerDialogComponent>;

  const mockElements: Element[] = [
    {
      id: 'el-1',
      name: 'John Doe',
      type: ElementType.Worldbuilding,
      schemaId: 'character-v1',
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'el-2',
      name: 'Dark Forest',
      type: ElementType.Worldbuilding,
      schemaId: 'location-v1',
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'el-3',
      name: 'Magic Sword',
      type: ElementType.Worldbuilding,
      schemaId: 'wb-item-v1',
      parentId: null,
      order: 2,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'el-folder',
      name: 'Folder',
      type: ElementType.Folder,
      parentId: null,
      order: 3,
      level: 0,
      expandable: true,
      version: 1,
      metadata: {},
    },
    {
      id: 'el-doc',
      name: 'Chapter 1',
      type: ElementType.Item,
      parentId: null,
      order: 4,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  const mockTags: TagDefinition[] = [
    { id: 'tag-1', name: 'Hero', icon: 'star', color: '#ff0000' },
    { id: 'tag-2', name: 'Villain', icon: 'skull', color: '#000000' },
  ];

  function setup(data: TagPickerDialogData = {}) {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MatDialogRef<TagPickerDialogComponent>;

    TestBed.configureTestingModule({
      imports: [
        TagPickerDialogComponent,
        MatDialogModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: ProjectStateService,
          useValue: { elements: signal(mockElements) },
        },
        {
          provide: TagService,
          useValue: { allTags: signal(mockTags) },
        },
      ],
    });

    const fixture = TestBed.createComponent(TagPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  describe('availableItems', () => {
    it('should include project tags and non-folder elements', () => {
      setup();
      const items = component.availableItems();
      // 2 tags + 4 non-folder elements = 6
      expect(items.length).toBe(6);
      expect(items.filter(i => i.isProjectTag).length).toBe(2);
      expect(items.filter(i => !i.isProjectTag).length).toBe(4);
    });

    it('should exclude specified element IDs', () => {
      setup({ excludeElementIds: ['el-1'] });
      const items = component.availableItems();
      expect(items.find(i => i.id === 'el:el-1')).toBeUndefined();
    });

    it('should exclude specified tag IDs', () => {
      setup({ excludeTagIds: ['tag-1'] });
      const items = component.availableItems();
      expect(items.find(i => i.id === 'tag:tag-1')).toBeUndefined();
      expect(items.find(i => i.id === 'tag:tag-2')).toBeDefined();
    });

    it('should exclude folders', () => {
      setup();
      const items = component.availableItems();
      expect(items.find(i => i.id === 'el:el-folder')).toBeUndefined();
    });

    it('should exclude specified element types', () => {
      setup({ excludeElementTypes: [ElementType.Item] });
      const items = component.availableItems();
      expect(items.find(i => i.id === 'el:el-doc')).toBeUndefined();
    });
  });

  describe('filteredItems', () => {
    it('should return all items when search is empty', () => {
      setup();
      expect(component.filteredItems().length).toBe(
        component.availableItems().length
      );
    });

    it('should filter by name', () => {
      setup();
      component.searchText.set('john');
      expect(component.filteredItems().length).toBe(1);
      expect(component.filteredItems()[0].name).toBe('John Doe');
    });

    it('should filter by type label', () => {
      setup();
      component.searchText.set('character');
      const filtered = component.filteredItems();
      expect(filtered.some(i => i.name === 'John Doe')).toBe(true);
    });

    it('should be case-insensitive', () => {
      setup();
      component.searchText.set('HERO');
      expect(component.filteredItems().length).toBeGreaterThan(0);
    });
  });

  describe('selection', () => {
    it('should toggle item selection', () => {
      setup();
      const item = component.availableItems()[0];
      expect(component.isSelected(item)).toBe(false);

      component.toggleSelection(item);
      expect(component.isSelected(item)).toBe(true);

      component.toggleSelection(item);
      expect(component.isSelected(item)).toBe(false);
    });

    it('should track selection count', () => {
      setup();
      expect(component.hasSelection()).toBe(false);
      expect(component.selectionCountText()).toBe('Nothing selected');

      component.toggleSelection(component.availableItems()[0]);
      expect(component.hasSelection()).toBe(true);
      expect(component.selectionCountText()).toBe('1 item selected');

      component.toggleSelection(component.availableItems()[1]);
      expect(component.selectionCountText()).toBe('2 items selected');
    });
  });

  describe('dialog actions', () => {
    it('should close with selected items on confirm', () => {
      setup();
      const tagItem = component.availableItems().find(i => i.isProjectTag)!;
      const elItem = component.availableItems().find(i => !i.isProjectTag)!;
      component.toggleSelection(tagItem);
      component.toggleSelection(elItem);
      component.confirm();
      expect(dialogRef.close).toHaveBeenCalledWith({
        elements: [elItem.element],
        tags: [tagItem.tag],
      });
    });

    it('should close with null on cancel', () => {
      setup();
      component.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith(null);
    });
  });

  describe('title and subtitle', () => {
    it('should use default title', () => {
      setup();
      expect(component.title).toBe('Add Tags');
    });

    it('should use custom title', () => {
      setup({ title: 'Pick Elements' });
      expect(component.title).toBe('Pick Elements');
    });

    it('should return undefined subtitle by default', () => {
      setup();
      expect(component.subtitle).toBeUndefined();
    });

    it('should return custom subtitle', () => {
      setup({ subtitle: 'Select items to tag' });
      expect(component.subtitle).toBe('Select items to tag');
    });
  });

  describe('icon mapping', () => {
    it('should map character schema to person icon', () => {
      setup();
      const item = component.availableItems().find(i => i.name === 'John Doe');
      expect(item?.icon).toBe('person');
    });

    it('should map location schema to place icon', () => {
      setup();
      const item = component
        .availableItems()
        .find(i => i.name === 'Dark Forest');
      expect(item?.icon).toBe('place');
    });

    it('should map wb-item schema to inventory_2 icon', () => {
      setup();
      const item = component
        .availableItems()
        .find(i => i.name === 'Magic Sword');
      expect(item?.icon).toBe('inventory_2');
    });

    it('should return document as type label for Item type', () => {
      setup();
      const item = component.availableItems().find(i => i.name === 'Chapter 1');
      expect(item?.typeLabel).toBe('document');
    });
  });
});
