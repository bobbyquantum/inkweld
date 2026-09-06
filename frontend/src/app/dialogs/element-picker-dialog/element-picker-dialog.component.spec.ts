import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { type Element } from '../../../api-client/model/element';
import { ElementType } from '../../../api-client/model/element-type';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import {
  ElementPickerDialogComponent,
  type ElementPickerDialogData,
} from './element-picker-dialog.component';

describe('ElementPickerDialogComponent', () => {
  let component: ElementPickerDialogComponent;
  let fixture: ComponentFixture<ElementPickerDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockProjectState: {
    elements: ReturnType<typeof vi.fn>;
    canWrite: ReturnType<typeof vi.fn>;
    addElement: ReturnType<typeof vi.fn>;
  };
  let mockMatDialog: { open: ReturnType<typeof vi.fn> };
  let mockWorldbuildingService: {
    getSchemaById: ReturnType<typeof vi.fn>;
    getSchemaIcon: ReturnType<typeof vi.fn>;
  };

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
      canWrite: vi.fn().mockReturnValue(true),
      addElement: vi.fn(),
    };

    mockMatDialog = { open: vi.fn() };

    mockWorldbuildingService = {
      getSchemaById: vi.fn().mockImplementation((schemaId: string) => {
        const icons: Record<string, string> = {
          'character-v1': 'person',
          'location-v1': 'place',
          'wb-item-v1': 'inventory_2',
          'species-v1': 'pets',
          'deity-v1': 'ac_unit',
          'faction-v1': 'groups',
          'event-v1': 'event',
          'concept-v1': 'lightbulb',
        };
        return icons[schemaId] ? { icon: icons[schemaId] } : null;
      }),
      getSchemaIcon: vi.fn().mockImplementation((schemaId: string) => {
        const icons: Record<string, string> = {
          'character-v1': 'person',
          'location-v1': 'place',
          'wb-item-v1': 'inventory_2',
          'species-v1': 'pets',
          'deity-v1': 'ac_unit',
          'faction-v1': 'groups',
          'event-v1': 'event',
          'concept-v1': 'lightbulb',
        };
        return icons[schemaId] ?? 'category';
      }),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: defaultDialogData },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    })
      // MatDialogModule (imported by the component) provides its own MatDialog
      // at the component injector; overrideProvider reaches that level too.
      .overrideProvider(MatDialog, { useValue: mockMatDialog })
      .compileComponents();

    fixture = TestBed.createComponent(ElementPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Rebuild the component with different dialog data. */
  async function recreate(data: ElementPickerDialogData): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    })
      .overrideProvider(MatDialog, { useValue: mockMatDialog })
      .compileComponents();
    fixture = TestBed.createComponent(ElementPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('create new shortcut', () => {
    it('is hidden unless allowCreate is set', () => {
      expect(component.canCreate).toBe(false);
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="element-picker-create-new"]'
        )
      ).toBeNull();
    });

    it('is hidden for non-worldbuilding pickers and read-only users', async () => {
      await recreate({ allowCreate: true, filterType: ElementType.Item });
      expect(component.canCreate).toBe(false);

      mockProjectState.canWrite.mockReturnValue(false);
      await recreate({ allowCreate: true });
      expect(component.canCreate).toBe(false);
    });

    it('creates the element next to its template siblings and selects it', async () => {
      await recreate({
        allowCreate: true,
        filterType: ElementType.Worldbuilding,
      });
      expect(component.canCreate).toBe(true);

      const elements = [
        ...mockElements,
        {
          ...mockElements[0],
          id: 'char-2',
          name: 'Older',
          parentId: 'folder-1',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          ...mockElements[0],
          id: 'char-3',
          name: 'Newer',
          parentId: 'folder-2',
          createdAt: '2024-06-01T00:00:00Z',
        },
      ];
      const created = {
        ...mockElements[0],
        id: 'char-new',
        name: 'Mira',
        parentId: 'folder-2',
      } as unknown as Element;
      mockProjectState.elements.mockReturnValue(elements);
      mockMatDialog.open.mockReturnValue({
        afterClosed: () =>
          of({
            name: 'Mira',
            type: ElementType.Worldbuilding,
            schemaId: 'character-v1',
          }),
      });
      mockProjectState.addElement.mockImplementation(() => {
        mockProjectState.elements.mockReturnValue([...elements, created]);
        return 'char-new';
      });

      await component.createNew();

      expect(mockMatDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ data: { worldbuildingOnly: true } })
      );
      expect(mockProjectState.addElement).toHaveBeenCalledWith(
        ElementType.Worldbuilding,
        'Mira',
        'folder-2',
        'character-v1'
      );
      expect(mockDialogRef.close).toHaveBeenCalledWith({ elements: [created] });
    });

    it('preselects the template when the picker is schema-filtered', async () => {
      await recreate({ allowCreate: true, filterSchemaId: 'location-v1' });
      mockMatDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });

      await component.createNew();

      expect(mockMatDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: {
            worldbuildingOnly: true,
            skipTypeSelection: true,
            preselectedType: ElementType.Worldbuilding,
            preselectedSchemaId: 'location-v1',
          },
        })
      );
      expect(mockProjectState.addElement).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('falls back to the project root when no sibling exists', async () => {
      await recreate({ allowCreate: true });
      mockMatDialog.open.mockReturnValue({
        afterClosed: () =>
          of({
            name: 'Ash',
            type: ElementType.Worldbuilding,
            schemaId: 'species-v1',
          }),
      });
      mockProjectState.addElement.mockReturnValue(undefined);

      await component.createNew();

      expect(mockProjectState.addElement).toHaveBeenCalledWith(
        ElementType.Worldbuilding,
        'Ash',
        undefined,
        'species-v1'
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display title from dialog data', () => {
    expect(component.title).toBe('Select Elements');
  });

  it('should load all elements by default', () => {
    expect(component.availableElements()).toHaveLength(4);
  });

  it('should filter elements by type when filterType is provided', async () => {
    // Recreate with filterType
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { filterType: ElementType.Worldbuilding },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    // Should only include worldbuilding elements (3), not document (1)
    expect(newComponent.availableElements()).toHaveLength(3);
  });

  it('should exclude elements by ID when excludeIds is provided', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { excludeIds: ['char-1', 'loc-1'] },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    expect(newComponent.availableElements()).toHaveLength(2);
    expect(
      newComponent.availableElements().find(e => e.id === 'char-1')
    ).toBeUndefined();
  });

  it('should filter elements by schema when filterSchemaId is provided', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { filterSchemaId: 'character-v1' },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    const available = newComponent.availableElements();
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe('char-1');
  });

  it('should return no elements for a schema with no matches', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { filterSchemaId: 'nonexistent-schema' },
        },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(ElementPickerDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    expect(newComponent.availableElements()).toHaveLength(0);
  });

  it('should filter elements based on search text', () => {
    component.searchText.set('hero');
    expect(component.filteredElements()).toHaveLength(1);
    expect(component.filteredElements()[0].name).toBe('Hero');
  });

  it('should filter by schemaId in search', () => {
    component.searchText.set('character');
    expect(component.filteredElements()).toHaveLength(1);
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
      imports: [translocoTestProvider(), ElementPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { maxSelections: 2 } },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
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

  it('should return correct type icons from the schema library', () => {
    expect(component.getTypeIcon('character-v1')).toBe('person');
    expect(component.getTypeIcon('location-v1')).toBe('place');
    expect(component.getTypeIcon('wb-item-v1')).toBe('inventory_2');
    expect(component.getTypeIcon('species-v1')).toBe('pets');
    expect(component.getTypeIcon('deity-v1')).toBe('ac_unit');
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
