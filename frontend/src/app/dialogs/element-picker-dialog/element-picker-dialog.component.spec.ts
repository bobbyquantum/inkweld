import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

import { Element } from '../../../api-client/model/element';
import { ElementType } from '../../../api-client/model/element-type';
import { ProjectStateService } from '../../services/project/project-state.service';
import {
  ElementPickerDialogComponent,
  ElementPickerDialogData,
} from './element-picker-dialog.component';

describe('ElementPickerDialogComponent', () => {
  let component: ElementPickerDialogComponent;
  let fixture: ComponentFixture<ElementPickerDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockProjectState: { elements: ReturnType<typeof vi.fn> };

  const mockElements = [
    {
      id: 'char-1',
      name: 'Hero',
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
      id: 'loc-1',
      name: 'Castle',
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
      id: 'item-1',
      name: 'Sword',
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
      id: 'folder-1',
      name: 'Main Folder',
      type: ElementType.Folder,
      schemaId: null,
      parentId: null,
      order: 3,
      level: 0,
      expandable: true,
      version: 1,
      metadata: {},
    },
  ] as unknown as Element[];

  const defaultDialogData: ElementPickerDialogData = {
    title: 'Select Elements',
    maxSelections: 4,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockProjectState = {
      elements: vi.fn().mockReturnValue(mockElements),
    };

    await TestBed.configureTestingModule({
      imports: [ElementPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: defaultDialogData },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display title from dialog data', () => {
    expect(component.title).toBe('Select Elements');
  });

  it('should load all elements by default', () => {
    expect(component.availableElements().length).toBe(4);
  });

  it('should filter elements by type when filterType is provided', async () => {
    // Recreate with filterType
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ElementPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { filterType: ElementType.Worldbuilding },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    // Should only include worldbuilding elements (3), not document (1)
    expect(newComponent.availableElements().length).toBe(3);
  });

  it('should exclude elements by ID when excludeIds is provided', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ElementPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { excludeIds: ['char-1', 'loc-1'] },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    expect(newComponent.availableElements().length).toBe(2);
    expect(
      newComponent.availableElements().find(e => e.id === 'char-1')
    ).toBeUndefined();
  });

  it('should filter elements based on search text', () => {
    component.searchText.set('hero');
    expect(component.filteredElements().length).toBe(1);
    expect(component.filteredElements()[0].name).toBe('Hero');
  });

  it('should filter by schemaId in search', () => {
    component.searchText.set('character');
    expect(component.filteredElements().length).toBe(1);
    expect(component.filteredElements()[0].schemaId).toBe('character-v1');
  });

  it('should toggle element selection', () => {
    const element = mockElements[0];

    expect(component.isSelected(element)).toBe(false);

    component.toggleSelection(element);
    expect(component.isSelected(element)).toBe(true);

    component.toggleSelection(element);
    expect(component.isSelected(element)).toBe(false);
  });

  it('should enforce max selections limit', () => {
    // Select up to max (4)
    component.toggleSelection(mockElements[0]);
    component.toggleSelection(mockElements[1]);
    component.toggleSelection(mockElements[2]);
    component.toggleSelection(mockElements[3]);

    expect(component.selectedIds().size).toBe(4);
    expect(component.canSelectMore()).toBe(false);
  });

  it('should not allow selection beyond max limit', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ElementPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { maxSelections: 2 } },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    newComponent.toggleSelection(mockElements[0]);
    newComponent.toggleSelection(mockElements[1]);
    newComponent.toggleSelection(mockElements[2]); // Should not add

    expect(newComponent.selectedIds().size).toBe(2);
  });

  it('should return correct selection count text', () => {
    expect(component.selectionCountText()).toBe('No elements selected');

    component.toggleSelection(mockElements[0]);
    expect(component.selectionCountText()).toBe('1 element selected');

    component.toggleSelection(mockElements[1]);
    expect(component.selectionCountText()).toBe('2 elements selected');
  });

  it('should close dialog with selected elements on confirm', () => {
    component.toggleSelection(mockElements[0]);
    component.toggleSelection(mockElements[1]);

    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      elements: expect.arrayContaining([
        expect.objectContaining({ id: 'char-1' }),
        expect.objectContaining({ id: 'loc-1' }),
      ]),
    });
  });

  it('should close dialog with null on cancel', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });

  it('should return correct type icons', () => {
    expect(component.getTypeIcon('character-v1')).toBe('person');
    expect(component.getTypeIcon('location-v1')).toBe('place');
    expect(component.getTypeIcon('wb-item-v1')).toBe('inventory_2');
    expect(component.getTypeIcon('faction-v1')).toBe('groups');
    expect(component.getTypeIcon('event-v1')).toBe('event');
    expect(component.getTypeIcon('concept-v1')).toBe('lightbulb');
    expect(component.getTypeIcon('unknown-v1')).toBe('category');
    expect(component.getTypeIcon(undefined)).toBe('category');
  });

  it('should return correct type labels', () => {
    expect(component.getTypeLabel('character-v1')).toBe('character');
    expect(component.getTypeLabel('location-v1')).toBe('location');
    expect(component.getTypeLabel(undefined)).toBe('');
  });

  it('should have hasSelection computed correctly', () => {
    expect(component.hasSelection()).toBe(false);

    component.toggleSelection(mockElements[0]);
    expect(component.hasSelection()).toBe(true);
  });
});
