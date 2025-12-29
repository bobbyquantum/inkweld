import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { Element } from '../../../api-client/model/element';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { WorldbuildingElementSelectorComponent } from './worldbuilding-element-selector.component';

describe('WorldbuildingElementSelectorComponent', () => {
  let component: WorldbuildingElementSelectorComponent;
  let fixture: ComponentFixture<WorldbuildingElementSelectorComponent>;
  let mockProjectState: {
    elements: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof vi.fn>;
  };
  let mockWorldbuildingService: {
    getIdentityData: ReturnType<typeof vi.fn>;
    getWorldbuildingData: ReturnType<typeof vi.fn>;
  };
  let mockDialog: {
    open: ReturnType<typeof vi.fn>;
  };

  // Use 'as unknown as Element[]' because Element.type is ElementType enum
  // Worldbuilding elements have type='WORLDBUILDING' and schemaId like 'character-v1'
  const mockElements = [
    {
      id: 'char-1',
      name: 'Hero',
      type: 'WORLDBUILDING',
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
      type: 'WORLDBUILDING',
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
      type: 'WORLDBUILDING',
      schemaId: 'wb-item-v1',
      parentId: null,
      order: 2,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ] as unknown as Element[];

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
  };

  beforeEach(async () => {
    mockProjectState = {
      elements: vi.fn().mockReturnValue(mockElements),
      project: vi.fn().mockReturnValue(mockProject),
    };

    mockWorldbuildingService = {
      getIdentityData: vi.fn().mockResolvedValue({
        image: 'media://hero.png',
        description: 'A brave hero',
      }),
      getWorldbuildingData: vi.fn().mockResolvedValue({
        occupation: 'Knight',
        age: 25,
      }),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [WorldbuildingElementSelectorComponent, NoopAnimationsModule],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingElementSelectorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load worldbuilding elements on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.availableElements().length).toBe(3);
    expect(component.isLoading()).toBe(false);
  });

  it('should open element picker dialog when openElementPicker is called', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockDialog.open.mockReturnValue({
      afterClosed: () => of({ elements: [mockElements[0]] }),
    });

    await component.openElementPicker();

    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should add elements returned from dialog to selection', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockDialog.open.mockReturnValue({
      afterClosed: () => of({ elements: [mockElements[0]] }),
    });

    await component.openElementPicker();

    // Wait for addElement to complete
    await fixture.whenStable();
    expect(component.selectedElements().length).toBe(1);
    expect(component.selectedElements()[0].id).toBe('char-1');
  });

  it('should add element to selection', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const element = mockElements[0];
    await component.addElement(element);

    expect(component.selectedElements().length).toBe(1);
    expect(component.selectedElements()[0].id).toBe('char-1');
  });

  it('should load identity and data when adding element', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const element = mockElements[0];
    await component.addElement(element);

    expect(mockWorldbuildingService.getIdentityData).toHaveBeenCalledWith(
      'char-1',
      'testuser',
      'test-project'
    );
    expect(mockWorldbuildingService.getWorldbuildingData).toHaveBeenCalledWith(
      'char-1',
      'testuser',
      'test-project'
    );

    const selected = component.selectedElements()[0];
    expect(selected.hasImage).toBe(true);
    expect(selected.description).toBe('A brave hero');
  });

  it('should auto-enable toggles based on available data', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const element = mockElements[0];
    await component.addElement(element);

    const selected = component.selectedElements()[0];
    // Should auto-enable because image exists
    expect(selected.includeReference()).toBe(true);
    // Should auto-enable because description exists
    expect(selected.includeDescription()).toBe(true);
    // Should default to true
    expect(selected.includeData()).toBe(true);
  });

  it('should remove element from selection', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const element = mockElements[0];
    await component.addElement(element);
    expect(component.selectedElements().length).toBe(1);

    component.removeElement(component.selectedElements()[0]);
    expect(component.selectedElements().length).toBe(0);
  });

  it('should enforce max elements limit', async () => {
    fixture.componentRef.setInput('maxElements', 2);
    fixture.detectChanges();
    await fixture.whenStable();

    await component.addElement(mockElements[0]);
    await component.addElement(mockElements[1]);

    expect(component.selectedElements().length).toBe(2);
    expect(component.canAddMore()).toBe(false);

    // Try to add a third element - should not work
    await component.addElement(mockElements[2]);
    expect(component.selectedElements().length).toBe(2);
  });

  it('should emit selectionChange when elements change', async () => {
    const emitSpy = vi.spyOn(component.selectionChange, 'emit');
    fixture.detectChanges();
    await fixture.whenStable();

    await component.addElement(mockElements[0]);
    expect(emitSpy).toHaveBeenCalled();

    const lastCall = emitSpy.mock.calls[emitSpy.mock.calls.length - 1][0];
    expect(lastCall.elements.length).toBe(1);
  });

  it('should emit selectionChange when toggle changes', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    await component.addElement(mockElements[0]);

    const emitSpy = vi.spyOn(component.selectionChange, 'emit');
    component.onToggleChange();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('should pre-select elements when preSelectedIds is provided', async () => {
    fixture.componentRef.setInput('preSelectedIds', ['char-1', 'loc-1']);
    fixture.detectChanges();
    await fixture.whenStable();

    // Wait for all async operations to complete (loadElements calls addElement for each pre-selected)
    await new Promise(resolve => setTimeout(resolve, 50));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedElements().length).toBe(2);
  });

  it('should pass selected IDs to dialog for exclusion', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // First add an element directly
    await component.addElement(mockElements[0]);
    expect(component.selectedIds()).toContain('char-1');

    mockDialog.open.mockReturnValue({
      afterClosed: () => of(null),
    });

    await component.openElementPicker();

    // Check that dialog was called with excludeIds containing the selected element
    const dialogData = mockDialog.open.mock.calls[0][1].data;
    expect(dialogData.excludeIds).toContain('char-1');
  });

  it('should return correct type icons', () => {
    // Test with schemaId format (e.g., 'character-v1')
    expect(component.getTypeIcon('character-v1')).toBe('person');
    expect(component.getTypeIcon('location-v1')).toBe('place');
    expect(component.getTypeIcon('wb-item-v1')).toBe('inventory_2');
    expect(component.getTypeIcon('faction-v1')).toBe('groups');
    expect(component.getTypeIcon('unknown-v1')).toBe('category');
    // Also test without version suffix
    expect(component.getTypeIcon('character')).toBe('person');
    expect(component.getTypeIcon('location')).toBe('place');
    // Cover remaining icon types
    expect(component.getTypeIcon('event-v1')).toBe('event');
    expect(component.getTypeIcon('concept-v1')).toBe('lightbulb');
  });

  it('should return flattened selection data', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    await component.addElement(mockElements[0]);

    const selection = component.getSelection();
    expect(selection.length).toBe(1);
    expect(selection[0].id).toBe('char-1');
    expect(selection[0].includeReference).toBe(true);
    expect(typeof selection[0].includeReference).toBe('boolean'); // Not a signal
  });

  it('should handle errors when loading identity data', async () => {
    mockWorldbuildingService.getIdentityData.mockRejectedValue(
      new Error('Failed to load')
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await component.addElement(mockElements[0]);

    expect(consoleSpy).toHaveBeenCalled();
    expect(component.selectedElements().length).toBe(1);
    consoleSpy.mockRestore();
  });

  it('should not add element when project is not available', async () => {
    mockProjectState.project.mockReturnValue(null);
    fixture.detectChanges();
    await fixture.whenStable();

    await component.addElement(mockElements[0]);
    expect(component.selectedElements().length).toBe(0);
  });
});
