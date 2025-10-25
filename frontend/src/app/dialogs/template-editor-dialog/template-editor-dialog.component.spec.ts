import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementTypeSchema } from '../../models/schema-types';
import {
  TemplateEditorDialogComponent,
  TemplateEditorDialogData,
} from './template-editor-dialog.component';

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
  };

  const mockDialogData: TemplateEditorDialogData = {
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
        NoopAnimationsModule,
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
    expect(component.templateForm.get('name')?.value).toBe('Character');
    expect(component.templateForm.get('description')?.value).toBe(
      'Character schema'
    );
    expect(component.templateForm.get('icon')?.value).toBe('person');
  });

  it('should initialize tabs from schema', () => {
    expect(component.tabs()).toHaveLength(1);
    expect(component.tabs()[0].key).toBe('basic');
    expect(component.tabs()[0].label).toBe('Basic Info');
  });

  describe('tab management', () => {
    it('should add a new tab', () => {
      const initialTabCount = component.tabs().length;

      component.addTab();

      expect(component.tabs()).toHaveLength(initialTabCount + 1);
      const newTab = component.tabs()[initialTabCount];
      expect(newTab.key).toBe('tab-1'); // Should generate unique key
      expect(newTab.label).toBe('New Tab');
    });

    it('should remove a tab', () => {
      // Add a tab first
      component.addTab();
      const initialTabCount = component.tabs().length;

      component.removeTab(1); // Remove second tab

      expect(component.tabs()).toHaveLength(initialTabCount - 1);
    });

    it('should not remove the last tab', () => {
      // Start with one tab
      component.removeTab(0);

      expect(component.tabs()).toHaveLength(1); // Should still have one tab
    });

    it('should move tab up', () => {
      component.addTab();
      const firstTab = component.tabs()[0];
      const secondTab = component.tabs()[1];

      component.moveTabUp(1);

      expect(component.tabs()[0]).toBe(secondTab);
      expect(component.tabs()[1]).toBe(firstTab);
    });

    it('should move tab down', () => {
      component.addTab();
      const firstTab = component.tabs()[0];
      const secondTab = component.tabs()[1];

      component.moveTabDown(0);

      expect(component.tabs()[0]).toBe(secondTab);
      expect(component.tabs()[1]).toBe(firstTab);
    });
  });

  describe('field management', () => {
    it('should add a field to a tab', () => {
      const tabIndex = 0;
      const initialFieldCount = component.tabs()[tabIndex].fields?.length || 0;

      component.addField(tabIndex);

      const updatedTab = component.tabs()[tabIndex];
      expect(updatedTab.fields).toHaveLength(initialFieldCount + 1);
      const newField = updatedTab.fields![initialFieldCount];
      expect(newField.key).toBe('field-0'); // Should generate unique key
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

    it('should move field up within a tab', () => {
      const tabIndex = 0;
      component.addField(tabIndex); // Add a second field

      const tab = component.tabs()[tabIndex];
      const firstField = tab.fields![0];
      const secondField = tab.fields![1];

      component.moveFieldUp(tabIndex, 1);

      const updatedTab = component.tabs()[tabIndex];
      expect(updatedTab.fields![0]).toBe(secondField);
      expect(updatedTab.fields![1]).toBe(firstField);
    });

    it('should move field down within a tab', () => {
      const tabIndex = 0;
      component.addField(tabIndex); // Add a second field

      const tab = component.tabs()[tabIndex];
      const firstField = tab.fields![0];
      const secondField = tab.fields![1];

      component.moveFieldDown(tabIndex, 0);

      const updatedTab = component.tabs()[tabIndex];
      expect(updatedTab.fields![0]).toBe(secondField);
      expect(updatedTab.fields![1]).toBe(firstField);
    });
  });

  describe('form validation', () => {
    it('should require template name', () => {
      const nameControl = component.templateForm.get('name');
      nameControl?.setValue('');

      expect(nameControl?.valid).toBe(false);
      expect(nameControl?.errors?.['required']).toBeTruthy();
    });

    it('should require template icon', () => {
      const iconControl = component.templateForm.get('icon');
      iconControl?.setValue('');

      expect(iconControl?.valid).toBe(false);
      expect(iconControl?.errors?.['required']).toBeTruthy();
    });

    it('should validate tab labels are unique', () => {
      component.addTab();

      // Set both tabs to have the same label
      const tabs = component.tabs();
      tabs[0].label = 'Duplicate';
      tabs[1].label = 'Duplicate';

      component['validateUniqueTabLabels']();

      expect(component.templateForm.valid).toBe(false);
    });

    it('should validate field keys are unique within a tab', () => {
      const tabIndex = 0;
      component.addField(tabIndex);

      // Set both fields to have the same key
      const tab = component.tabs()[tabIndex];
      tab.fields![0].key = 'duplicate';
      tab.fields![1].key = 'duplicate';

      component['validateUniqueFieldKeys']();

      expect(component.templateForm.valid).toBe(false);
    });
  });

  describe('dialog actions', () => {
    it('should close dialog without saving on cancel', () => {
      component.onCancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });

    it('should close dialog with updated schema on save', () => {
      // Update form values
      component.templateForm.patchValue({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
      });

      component.onSave();

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
      component.templateForm.patchValue({
        name: '',
      });

      component.onSave();

      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('drag and drop', () => {
    it('should handle tab drop correctly', () => {
      component.addTab();
      const initialTabs = [...component.tabs()];

      const dropEvent = {
        previousIndex: 0,
        currentIndex: 1,
      };

      component.onTabDrop(dropEvent);

      const updatedTabs = component.tabs();
      expect(updatedTabs[0]).toBe(initialTabs[1]);
      expect(updatedTabs[1]).toBe(initialTabs[0]);
    });

    it('should handle field drop correctly', () => {
      const tabIndex = 0;
      component.addField(tabIndex);
      const initialFields = [...(component.tabs()[tabIndex].fields || [])];

      const dropEvent = {
        previousIndex: 0,
        currentIndex: 1,
      };

      component.onFieldDrop(tabIndex, dropEvent);

      const updatedFields = component.tabs()[tabIndex].fields || [];
      expect(updatedFields[0]).toBe(initialFields[1]);
      expect(updatedFields[1]).toBe(initialFields[0]);
    });
  });

  describe('schema building', () => {
    it('should build valid schema from form data', () => {
      component.templateForm.patchValue({
        name: 'Test Schema',
        description: 'Test description',
        icon: 'test-icon',
      });

      component.addTab();
      const tabs = component.tabs();
      tabs[1].label = 'Advanced';
      component.addField(1);

      const builtSchema = component['buildSchemaFromForm']();

      expect(builtSchema.name).toBe('Test Schema');
      expect(builtSchema.description).toBe('Test description');
      expect(builtSchema.icon).toBe('test-icon');
      expect(builtSchema.tabs).toHaveLength(2);
      expect(builtSchema.tabs[0].label).toBe('Basic Info');
      expect(builtSchema.tabs[1].label).toBe('Advanced');
    });

    it('should generate default values from schema fields', () => {
      const tabIndex = 0;
      component.addField(tabIndex);

      // Set field types that should have default values
      const tab = component.tabs()[tabIndex];
      tab.fields![0].type = 'number';
      tab.fields![1].type = 'text';
      tab.fields![2].type = 'boolean';

      const builtSchema = component['buildSchemaFromForm']();

      expect(builtSchema.defaultValues).toBeDefined();
      expect(builtSchema.defaultValues?.name).toBe(0); // number type
      expect(builtSchema.defaultValues?.age).toBe(0); // number type
      expect(builtSchema.defaultValues?.[tab.fields![2].key]).toBe(false); // boolean type
    });
  });
});