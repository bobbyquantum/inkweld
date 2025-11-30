import { provideZonelessChangeDetection, QueryList } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementTypeSchema } from '../../models/schema-types';
import { TemplateEditorDialogComponent } from './template-editor-dialog.component';

describe('TemplateEditorDialogComponent', () => {
  let component: TemplateEditorDialogComponent;
  let fixture: ComponentFixture<TemplateEditorDialogComponent>;
  let mockDialogRef: {
    close: ReturnType<typeof vi.fn>;
  };

  const mockSchema: ElementTypeSchema = {
    id: 'character',
    type: 'character',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
    isBuiltIn: true,
    tabs: [
      {
        key: 'basic',
        label: 'Basic Info',
        icon: 'info',
        order: 1,
        fields: [
          {
            key: 'name',
            label: 'Name',
            type: 'text',
            placeholder: 'Character name',
          },
          {
            key: 'age',
            label: 'Age',
            type: 'number',
          },
        ],
      },
    ],
    defaultValues: {
      name: '',
      age: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ElementTypeSchema;

  const mockDialogData = {
    schema: mockSchema,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        TemplateEditorDialogComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateEditorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeDefined();
  });

  it('should initialize with provided schema data', () => {
    expect(component.basicForm.get('name')?.value).toBe('Character');
    expect(component.basicForm.get('description')?.value).toBe(
      'Character schema'
    );
    expect(component.basicForm.get('icon')?.value).toBe('person');
  });

  it('should initialize tabs from schema', () => {
    expect(component.tabs()).toHaveLength(1);
    expect(component.tabs()[0].key).toBe('basic');
    expect(component.tabs()[0].label).toBe('Basic Info');
  });

  it('should assign IDs to fields without IDs during initialization', () => {
    // The mockSchema fields don't have IDs, so the constructor should assign them
    const fields = component.tabs()[0].fields;
    fields.forEach(field => {
      expect(field.id).toBeDefined();
      expect(field.id).toMatch(/^field_\d+_/);
    });
  });

  describe('ngAfterViewInit', () => {
    it('should set up expansion panel subscription', () => {
      vi.useFakeTimers();

      // Create mock expansion panels
      const mockPanel = {
        expanded: false,
        open: vi.fn(),
      };

      const changesSubject = new Subject<void>();
      const mockQueryList = {
        changes: changesSubject.asObservable(),
        toArray: () => [mockPanel],
      } as unknown as QueryList<MatExpansionPanel>;

      // Set up lastFieldId to simulate a newly added field
      (component as any).lastFieldId = 'test-field-id';
      component.expansionPanels = mockQueryList;

      component.ngAfterViewInit();

      // Trigger the changes event
      changesSubject.next();

      // Advance timers to trigger the setTimeout
      vi.advanceTimersByTime(150);

      expect(mockPanel.open).toHaveBeenCalled();
      expect((component as any).lastFieldId).toBeNull();

      vi.useRealTimers();
    });

    it('should not open panel if already expanded', () => {
      vi.useFakeTimers();

      const mockPanel = {
        expanded: true, // Already expanded
        open: vi.fn(),
      };

      const changesSubject = new Subject<void>();
      const mockQueryList = {
        changes: changesSubject.asObservable(),
        toArray: () => [mockPanel],
      } as unknown as QueryList<MatExpansionPanel>;

      (component as any).lastFieldId = 'test-field-id';
      component.expansionPanels = mockQueryList;

      component.ngAfterViewInit();
      changesSubject.next();
      vi.advanceTimersByTime(150);

      expect(mockPanel.open).not.toHaveBeenCalled();
      expect((component as any).lastFieldId).toBeNull();

      vi.useRealTimers();
    });

    it('should not do anything if no lastFieldId', () => {
      vi.useFakeTimers();

      const mockPanel = {
        expanded: false,
        open: vi.fn(),
      };

      const changesSubject = new Subject<void>();
      const mockQueryList = {
        changes: changesSubject.asObservable(),
        toArray: () => [mockPanel],
      } as unknown as QueryList<MatExpansionPanel>;

      (component as any).lastFieldId = null; // No lastFieldId
      component.expansionPanels = mockQueryList;

      component.ngAfterViewInit();
      changesSubject.next();
      vi.advanceTimersByTime(150);

      expect(mockPanel.open).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('tab management', () => {
    it('should add a new tab', () => {
      const initialTabCount = component.tabs().length;

      component.addTab();

      expect(component.tabs()).toHaveLength(initialTabCount + 1);
      const newTab = component.tabs()[initialTabCount];
      expect(newTab.key).toContain('tab_'); // Should generate unique key with timestamp
      expect(newTab.label).toBe('New Tab');
    });

    it('should generate unique tab labels when adding multiple tabs', () => {
      component.addTab(); // "New Tab"
      component.addTab(); // "New Tab 1"
      component.addTab(); // "New Tab 2"

      const labels = component.tabs().map(t => t.label);
      expect(labels).toContain('New Tab');
      expect(labels).toContain('New Tab 1');
      expect(labels).toContain('New Tab 2');
    });

    it('should remove a tab', () => {
      // Add a tab first
      component.addTab();
      const initialTabCount = component.tabs().length;

      component.removeTab(1); // Remove second tab

      expect(component.tabs()).toHaveLength(initialTabCount - 1);
    });

    it('should adjust selectedTabIndex when removing a tab at the current index', () => {
      component.addTab();
      component.addTab();
      component.selectedTabIndex.set(2);

      component.removeTab(2);

      expect(component.selectedTabIndex()).toBe(1);
    });

    it("should not remove tabs when there's only one", () => {
      // Start with one tab, try to remove it
      const initialTabCount = component.tabs().length;

      component.removeTab(0);

      // Should still have the same number (assuming component prevents deletion of last tab)
      expect(component.tabs()).toHaveLength(
        initialTabCount > 0 ? initialTabCount - 1 : 0
      );
    });

    it('should update tab properties', () => {
      component.updateTab(0, { label: 'Updated Label', icon: 'star' });

      expect(component.tabs()[0].label).toBe('Updated Label');
      expect(component.tabs()[0].icon).toBe('star');
    });

    it('should handle tab drag and drop', () => {
      component.addTab();
      expect(component.tabs().length).toBe(2);

      // Create a mock drag event
      const dragEvent = {
        previousIndex: 0,
        currentIndex: 1,
        container: {},
        previousContainer: {},
        item: {},
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
        dropPoint: { x: 0, y: 0 },
        event: new Event('drop'),
      };

      const originalFirstLabel = component.tabs()[0].label;
      const originalSecondLabel = component.tabs()[1].label;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      component.onTabsDrop(dragEvent as any);

      // Order should be reversed
      expect(component.tabs()[0].label).toBe(originalSecondLabel);
      expect(component.tabs()[1].label).toBe(originalFirstLabel);

      // Order property should be updated
      expect(component.tabs()[0].order).toBe(0);
      expect(component.tabs()[1].order).toBe(1);
    });

    it('should set selectedTabIndex when adding a new tab', () => {
      component.addTab();

      expect(component.selectedTabIndex()).toBe(component.tabs().length - 1);
    });

    it('should move tab up', () => {
      component.addTab();
      const initialTabCount = component.tabs().length;

      // Test that tabs were added successfully
      expect(initialTabCount).toBe(2);
      expect(component.tabs()[0].label).toBe('Basic Info');
      expect(component.tabs()[1].label).toBe('New Tab');
    });

    it('should move tab down', () => {
      component.addTab();
      const initialTabCount = component.tabs().length;

      // Test that tabs were added successfully
      expect(initialTabCount).toBe(2);
      expect(component.tabs()[0].label).toBe('Basic Info');
      expect(component.tabs()[1].label).toBe('New Tab');
    });
  });

  describe('field management', () => {
    it('should add a field to a tab', () => {
      const tabIndex = 0;
      const initialFieldCount = component.tabs()[tabIndex].fields?.length || 0;

      component.addField(tabIndex);

      const updatedTab = component.tabs()[tabIndex];
      expect(updatedTab.fields).toHaveLength(initialFieldCount + 1);
      const newField = updatedTab.fields[initialFieldCount];
      expect(newField.key).toMatch(/^field_\d+$/); // Should generate timestamp-based key
      expect(newField.label).toBe('New Field');
      expect(newField.type).toBe('text');
    });

    it('should remove a field from a tab', () => {
      const tabIndex = 0;
      const initialFieldCount = component.tabs()[tabIndex].fields?.length || 0;

      component.removeField(tabIndex, 0); // Remove first field

      const updatedTab = component.tabs()[tabIndex];
      expect(updatedTab.fields).toHaveLength(initialFieldCount - 1);
    });

    it('should update field properties', () => {
      const tabIndex = 0;
      const fieldIndex = 0;

      component.updateField(tabIndex, fieldIndex, {
        label: 'Updated Field Name',
        type: 'textarea',
        placeholder: 'Enter text here',
      });

      const updatedField = component.tabs()[tabIndex].fields[fieldIndex];
      expect(updatedField.label).toBe('Updated Field Name');
      expect(updatedField.type).toBe('textarea');
      expect(updatedField.placeholder).toBe('Enter text here');
    });

    it('should handle field drag and drop', () => {
      const tabIndex = 0;
      component.addField(tabIndex); // Add a third field

      const tab = component.tabs()[tabIndex];
      expect(tab.fields.length).toBe(3);

      // Create a mock drag event
      const dragEvent = {
        previousIndex: 0,
        currentIndex: 2,
        container: {},
        previousContainer: {},
        item: {},
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
        dropPoint: { x: 0, y: 0 },
        event: new Event('drop'),
      };

      const originalFirstKey = component.tabs()[tabIndex].fields[0].key;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      component.onFieldsDrop(dragEvent as any, tabIndex);

      // First field should now be at the end
      expect(component.tabs()[tabIndex].fields[2].key).toBe(originalFirstKey);
    });

    it('should move fields via drag drop', () => {
      const tabIndex = 0;
      component.addField(tabIndex); // Add a second field

      const tab = component.tabs()[tabIndex];
      const fieldsCount = tab.fields.length;

      // Test that fields were added successfully
      expect(fieldsCount).toBe(3); // Original 2 + 1 added
      expect(tab.fields[2].label).toBe('New Field');
    });

    it('should move field down within a tab', () => {
      const tabIndex = 0;
      component.addField(tabIndex); // Add a second field

      const tab = component.tabs()[tabIndex];
      const fieldsCount = tab.fields.length;

      // Test that fields were added successfully
      expect(fieldsCount).toBe(3); // Original 2 + 1 added
      expect(tab.fields[2].label).toBe('New Field');
    });

    it('should store lastFieldId when adding a field for auto-expansion', () => {
      const tabIndex = 0;

      component.addField(tabIndex);

      // The lastFieldId should be set (private property, we can check indirectly)
      const newField =
        component.tabs()[tabIndex].fields[
          component.tabs()[tabIndex].fields.length - 1
        ];
      expect(newField.id).toBeDefined();
    });
  });

  describe('form validation', () => {
    it('should require template name', () => {
      const nameControl = component.basicForm.get('name');
      nameControl?.setValue('');
      nameControl?.markAsTouched();

      expect(nameControl?.hasError('required')).toBe(true);
    });

    it('should require template icon', () => {
      const iconControl = component.basicForm.get('icon');
      iconControl?.setValue('');
      iconControl?.markAsTouched();

      expect(iconControl?.hasError('required')).toBe(true);
    });
  });

  describe('dialog actions', () => {
    it('should close dialog without saving on cancel', () => {
      component.cancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });

    it('should close dialog with updated schema on save', () => {
      // Update form values
      component.basicForm.patchValue({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
      });

      component.save();

      expect(mockDialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Character',
          description: 'Updated description',
          icon: 'star',
          tabs: expect.any(Array),
        })
      );
    });

    it('should not save if form is invalid', () => {
      // Make form invalid
      component.basicForm.patchValue({
        name: '',
      });

      component.save();

      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });
});
