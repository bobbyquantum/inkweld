import { type CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideZonelessChangeDetection, type QueryList } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type MatExpansionPanel } from '@angular/material/expansion';
import { type ElementAppearance } from '@models/element-appearance';
import {
  type ElementTypeSchema,
  type FieldSchema,
  FieldType,
  type TabSchema,
} from '@models/schema-types';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { TemplateEditorPageComponent } from './template-editor-page.component';

describe('TemplateEditorPageComponent', () => {
  let component: TemplateEditorPageComponent;
  let fixture: ComponentFixture<TemplateEditorPageComponent>;
  let relationshipFieldService: {
    isRelationshipField: ReturnType<typeof vi.fn>;
    stampRelationshipTypeId: ReturnType<typeof vi.fn>;
    ensureTypeForField: ReturnType<typeof vi.fn>;
    removeTypeForField: ReturnType<typeof vi.fn>;
  };

  const mockSchema: ElementTypeSchema = {
    id: 'character',
    type: 'character',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
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

  beforeEach(async () => {
    relationshipFieldService = {
      isRelationshipField: vi
        .fn()
        .mockImplementation(
          (field: FieldSchema) => field.type === 'relationship'
        ),
      stampRelationshipTypeId: vi
        .fn()
        .mockImplementation((field: FieldSchema) =>
          field.type === 'relationship' && !field.relationshipTypeId
            ? { ...field, relationshipTypeId: 'fieldrel-stamped' }
            : field
        ),
      ensureTypeForField: vi.fn().mockReturnValue('fieldrel-stamped'),
      removeTypeForField: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), TemplateEditorPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: RelationshipFieldService,
          useValue: relationshipFieldService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateEditorPageComponent);
    fixture.componentRef.setInput('schema', mockSchema);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }, 10000);

  it('should create', () => {
    expect(component).toBeDefined();
  });

  it('should initialize with provided schema data', () => {
    expect(component.model().name).toBe('Character');
    expect(component.model().description).toBe('Character schema');
    expect(component.model().icon).toBe('person');
  });

  it('should include date as an available field type', () => {
    expect(component.fieldTypes).toContainEqual({
      value: 'date',
      label: 'Date',
    });
  });

  it('should initialize tabs from schema', () => {
    expect(component.tabs()).toHaveLength(1);
    expect(component.tabs()[0].key).toBe('basic');
    expect(component.tabs()[0].label).toBe('Basic Info');
  });

  it('should assign IDs to fields without IDs during initialization', () => {
    const fields = component.tabs()[0].fields;
    fields.forEach(field => {
      expect(field.id).toBeDefined();
      expect(field.id).toMatch(/^field_[0-9a-f-]{36}$/);
    });
  });

  describe('ngAfterViewInit', () => {
    function makeExpansionPanelSetup(expanded: boolean): {
      mockPanel: { expanded: boolean; open: ReturnType<typeof vi.fn> };
      changesSubject: Subject<void>;
    } {
      const mockPanel = { expanded, open: vi.fn() };
      const changesSubject = new Subject<void>();
      const mockQueryList = {
        changes: changesSubject.asObservable(),
        toArray: () => [mockPanel],
      } as unknown as QueryList<MatExpansionPanel>;

      component._lastFieldId = 'test-field-id';
      component.expansionPanels = mockQueryList;
      component.ngAfterViewInit();

      return { mockPanel, changesSubject };
    }

    it('should set up expansion panel subscription', () => {
      vi.useFakeTimers();
      const { mockPanel, changesSubject } = makeExpansionPanelSetup(false);

      changesSubject.next();
      vi.advanceTimersByTime(150);

      expect(mockPanel.open).toHaveBeenCalled();
      expect(component._lastFieldId).toBeNull();
      vi.useRealTimers();
    });

    it('should not open panel if already expanded', () => {
      vi.useFakeTimers();
      const { mockPanel, changesSubject } = makeExpansionPanelSetup(true);

      changesSubject.next();
      vi.advanceTimersByTime(150);

      expect(mockPanel.open).not.toHaveBeenCalled();
      expect(component._lastFieldId).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('schema info + appearance handlers', () => {
    it('should update schema metadata from the Schema Details section', () => {
      component['onSchemaInfoChange']({ name: 'Hero', icon: 'person' });
      expect(component.model().name).toBe('Hero');
      expect(component.model().icon).toBe('person');
    });

    it('should update the default appearance from the editor styling section', () => {
      const appearance: ElementAppearance = {
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      };
      component['onDefaultAppearanceChange'](appearance);
      expect(component.defaultAppearance()).toEqual(appearance);
    });
  });

  describe('tab management', () => {
    it('should add a new tab', () => {
      const initialTabCount = component.tabs().length;

      component.addTab();

      expect(component.tabs()).toHaveLength(initialTabCount + 1);
      const newTab = component.tabs()[initialTabCount];
      expect(newTab.key).toMatch(/^tab_[0-9a-f-]{36}$/);
      expect(newTab.label).toBe('New Tab');
    });

    it('should generate unique tab labels when adding multiple tabs', () => {
      component.addTab();
      component.addTab();
      component.addTab();

      const labels = component.tabs().map(t => t.label);
      expect(labels).toContain('New Tab');
      expect(labels).toContain('New Tab 1');
      expect(labels).toContain('New Tab 2');
    });

    it('should remove a tab', () => {
      component.addTab();
      const initialTabCount = component.tabs().length;

      component.removeTab(1);

      expect(component.tabs()).toHaveLength(initialTabCount - 1);
    });

    it('should adjust selectedTabIndex when removing a tab at the current index', () => {
      component.addTab();
      component.addTab();
      component.selectedTabIndex.set(2);

      component.removeTab(2);

      expect(component.selectedTabIndex()).toBe(1);
    });

    it('should update tab properties', () => {
      component.updateTab(0, { label: 'Updated Label', icon: 'star' });

      expect(component.tabs()[0].label).toBe('Updated Label');
      expect(component.tabs()[0].icon).toBe('star');
    });

    it('should handle tab drag and drop', () => {
      component.addTab();
      expect(component.tabs()).toHaveLength(2);

      const dragEvent: Partial<CdkDragDrop<TabSchema[]>> = {
        previousIndex: 0,
        currentIndex: 1,
        container: {} as CdkDragDrop<TabSchema[]>['container'],
        previousContainer: {} as CdkDragDrop<TabSchema[]>['previousContainer'],
        item: {} as CdkDragDrop<TabSchema[]>['item'],
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
        dropPoint: { x: 0, y: 0 },
        event: new MouseEvent('drop'),
      };

      const originalFirstLabel = component.tabs()[0].label;
      const originalSecondLabel = component.tabs()[1].label;

      component.onTabsDrop(dragEvent as CdkDragDrop<TabSchema[]>);

      expect(component.tabs()[0].label).toBe(originalSecondLabel);
      expect(component.tabs()[1].label).toBe(originalFirstLabel);
      expect(component.tabs()[0].order).toBe(0);
      expect(component.tabs()[1].order).toBe(1);
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
      expect(newField.key).toMatch(/^field_[0-9a-f-]{36}$/);
      expect(newField.label).toBe('New Field');
      expect(newField.type).toBe('text');
    });

    it('should remove a field from a tab', () => {
      const tabIndex = 0;
      const initialFieldCount = component.tabs()[tabIndex].fields?.length || 0;

      component.removeField(tabIndex, 0);

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
      component.addField(tabIndex);

      const tab = component.tabs()[tabIndex];
      expect(tab.fields).toHaveLength(3);

      type FieldList = FieldSchema[];
      const dragEvent: Partial<CdkDragDrop<FieldList>> = {
        previousIndex: 0,
        currentIndex: 2,
        container: {} as CdkDragDrop<FieldList>['container'],
        previousContainer: {} as CdkDragDrop<FieldList>['previousContainer'],
        item: {} as CdkDragDrop<FieldList>['item'],
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
        dropPoint: { x: 0, y: 0 },
        event: new MouseEvent('drop'),
      };

      const originalFirstKey = component.tabs()[tabIndex].fields[0].key;

      component.onFieldsDrop(dragEvent as CdkDragDrop<FieldList>, tabIndex);

      expect(component.tabs()[tabIndex].fields[2].key).toBe(originalFirstKey);
    });
  });

  describe('onSchemaEdit', () => {
    it('should add a tab', () => {
      const before = component.tabs().length;
      component['onSchemaEdit']({ type: 'add-tab' });
      expect(component.tabs()).toHaveLength(before + 1);
    });

    it('should remove a tab by key', () => {
      component['onSchemaEdit']({ type: 'remove-tab', tabKey: 'basic' });
      expect(component.tabs().some(t => t.key === 'basic')).toBe(false);
    });

    it('should ignore removing a tab with an unknown key', () => {
      const before = component.tabs().length;
      component['onSchemaEdit']({ type: 'remove-tab', tabKey: 'nope' });
      expect(component.tabs()).toHaveLength(before);
    });

    it('should add a field to a tab by key', () => {
      const before = component.tabs()[0].fields.length;
      component['onSchemaEdit']({ type: 'add-field', tabKey: 'basic' });
      expect(component.tabs()[0].fields).toHaveLength(before + 1);
    });

    it('should remove a field by tab and field key', () => {
      const before = component.tabs()[0].fields.length;
      component['onSchemaEdit']({
        type: 'remove-field',
        tabKey: 'basic',
        fieldKey: 'age',
      });
      expect(component.tabs()[0].fields).toHaveLength(before - 1);
      expect(component.tabs()[0].fields.some(f => f.key === 'age')).toBe(false);
    });

    it('should move a field up by delta', () => {
      component['onSchemaEdit']({
        type: 'move-field',
        tabKey: 'basic',
        fieldKey: 'age',
        delta: -1,
      });
      expect(component.tabs()[0].fields[0].key).toBe('age');
    });

    it('should move a field down by delta', () => {
      component['onSchemaEdit']({
        type: 'move-field',
        tabKey: 'basic',
        fieldKey: 'name',
        delta: 1,
      });
      expect(component.tabs()[0].fields[1].key).toBe('name');
    });

    it('should ignore an out-of-range field move', () => {
      const original = component.tabs()[0].fields.map(f => f.key);
      component['onSchemaEdit']({
        type: 'move-field',
        tabKey: 'basic',
        fieldKey: 'age',
        delta: 1,
      });
      expect(component.tabs()[0].fields.map(f => f.key)).toEqual(original);
    });

    it('should update a field by key via onSchemaEdit', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { label: 'Full name', placeholder: 'Enter name' },
      });
      const nameField = component.tabs()[0].fields.find(f => f.key === 'name');
      expect(nameField?.label).toBe('Full name');
      expect(nameField?.placeholder).toBe('Enter name');
    });

    it('should update a tab by key via onSchemaEdit', () => {
      component['onSchemaEdit']({
        type: 'update-tab',
        tabKey: 'basic',
        patch: { label: 'Core', icon: 'star' },
      });
      const tab = component.tabs()[0];
      expect(tab.label).toBe('Core');
      expect(tab.icon).toBe('star');
    });

    it('should ignore an update-tab event for a missing tab key', () => {
      const original = component.tabs();
      component['onSchemaEdit']({
        type: 'update-tab',
        tabKey: 'missing',
        patch: { label: 'Nope' },
      });
      expect(component.tabs()).toEqual(original);
    });
  });

  describe('relationship field lifecycle', () => {
    it('should ensure types for existing relationship fields on init', () => {
      relationshipFieldService.ensureTypeForField.mockClear();

      const schemaWithRel: ElementTypeSchema = {
        ...mockSchema,
        tabs: [
          {
            key: 'rel',
            label: 'Relationships',
            fields: [
              {
                key: 'mother',
                label: 'Mother',
                type: FieldType.RELATIONSHIP,
                relationshipTypeId: 'fieldrel-existing',
              },
            ],
          },
        ],
      };

      TestBed.resetTestingModule();
      return TestBed.configureTestingModule({
        imports: [translocoTestProvider(), TemplateEditorPageComponent],
        providers: [
          provideZonelessChangeDetection(),
          {
            provide: RelationshipFieldService,
            useValue: relationshipFieldService,
          },
        ],
      })
        .compileComponents()
        .then(() => {
          const f = TestBed.createComponent(TemplateEditorPageComponent);
          f.componentRef.setInput('schema', schemaWithRel);
          f.detectChanges();
          expect(
            relationshipFieldService.ensureTypeForField
          ).toHaveBeenCalledWith(
            'character',
            expect.objectContaining({ key: 'mother' })
          );
        });
    });

    it('should stamp a relationshipTypeId when a field becomes a relationship', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { type: FieldType.RELATIONSHIP, label: 'Mother' },
      });

      const field = component.tabs()[0].fields.find(f => f.key === 'name');
      expect(field?.type).toBe(FieldType.RELATIONSHIP);
      expect(field?.relationshipTypeId).toBe('fieldrel-stamped');
      expect(relationshipFieldService.ensureTypeForField).toHaveBeenCalledWith(
        'character',
        expect.objectContaining({ relationshipTypeId: 'fieldrel-stamped' })
      );
    });

    it('should re-ensure the type when a relationship field is edited', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { type: FieldType.RELATIONSHIP, label: 'Mother' },
      });
      relationshipFieldService.ensureTypeForField.mockClear();

      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { label: 'Renamed Mother' },
      });

      expect(relationshipFieldService.ensureTypeForField).toHaveBeenCalledWith(
        'character',
        expect.objectContaining({ label: 'Renamed Mother' })
      );
    });

    it('should remove the type when a relationship field changes type', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: {
          type: FieldType.RELATIONSHIP,
          label: 'Mother',
          relationshipTypeId: 'fieldrel-x',
        },
      });
      relationshipFieldService.removeTypeForField.mockClear();

      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { type: FieldType.TEXT },
      });

      expect(relationshipFieldService.removeTypeForField).toHaveBeenCalledWith(
        expect.objectContaining({ relationshipTypeId: 'fieldrel-x' }),
        true
      );
    });

    it('should remove the type when a relationship field is deleted', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: {
          type: FieldType.RELATIONSHIP,
          label: 'Mother',
          relationshipTypeId: 'fieldrel-x',
        },
      });
      relationshipFieldService.removeTypeForField.mockClear();

      component['onSchemaEdit']({
        type: 'remove-field',
        tabKey: 'basic',
        fieldKey: 'name',
      });

      expect(relationshipFieldService.removeTypeForField).toHaveBeenCalledWith(
        expect.objectContaining({ relationshipTypeId: 'fieldrel-x' }),
        true
      );
    });

    it('should remove types for relationship fields when a tab is deleted', () => {
      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: {
          type: FieldType.RELATIONSHIP,
          label: 'Mother',
          relationshipTypeId: 'fieldrel-x',
        },
      });
      relationshipFieldService.removeTypeForField.mockClear();

      component['onSchemaEdit']({ type: 'remove-tab', tabKey: 'basic' });

      expect(relationshipFieldService.removeTypeForField).toHaveBeenCalledWith(
        expect.objectContaining({ relationshipTypeId: 'fieldrel-x' }),
        true
      );
    });

    it('should not touch relationship types for non-relationship field edits', () => {
      relationshipFieldService.ensureTypeForField.mockClear();
      relationshipFieldService.removeTypeForField.mockClear();

      component['onSchemaEdit']({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { label: 'Full name' },
      });

      expect(
        relationshipFieldService.ensureTypeForField
      ).not.toHaveBeenCalled();
      expect(
        relationshipFieldService.removeTypeForField
      ).not.toHaveBeenCalled();
    });
  });

  describe('scheduleAutosave', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should emit the assembled schema after the debounce', () => {
      const emit = vi.fn();
      component.schemaChange.subscribe(emit);
      component['scheduleAutosave']();
      expect(emit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(700);
      expect(emit).toHaveBeenCalledTimes(1);
      const emitted = emit.mock.calls[0][0] as ElementTypeSchema;
      expect(emitted.tabs).toEqual(component.tabs());
    });

    it('should reset the debounce on repeated calls', () => {
      const emit = vi.fn();
      component.schemaChange.subscribe(emit);
      component['scheduleAutosave']();
      vi.advanceTimersByTime(300);
      component['scheduleAutosave']();
      vi.advanceTimersByTime(300);
      expect(emit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('should emit the schema immediately after a schema edit', () => {
      const emit = vi.fn();
      component.schemaChange.subscribe(emit);
      component['onSchemaEdit']({ type: 'add-tab' });
      // Schema edits are committed immediately, not debounced, so closing the
      // tab can never lose the last edit.
      expect(emit).toHaveBeenCalledTimes(1);
      const emitted = emit.mock.calls[0][0] as ElementTypeSchema;
      expect(emitted.tabs).toEqual(component.tabs());
    });
  });

  describe('form validation', () => {
    it('should require template name', () => {
      component.basicForm.name().value.set('');
      component.basicForm.name().markAsTouched();

      expect(
        component.basicForm
          .name()
          .errors()
          .some(e => e.kind === 'required')
      ).toBe(true);
    });

    it('should require template icon', () => {
      component.basicForm.icon().value.set('');
      component.basicForm.icon().markAsTouched();

      expect(
        component.basicForm
          .icon()
          .errors()
          .some(e => e.kind === 'required')
      ).toBe(true);
    });
  });

  describe('done output', () => {
    it('should emit null on cancel', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.cancel();

      expect(emitted).toEqual([null]);
    });

    it('should emit updated schema on save', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.model.set({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
      });

      component.save();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
        tabs: expect.any(Array),
      });
    });

    it('should include the default appearance on save', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.model.set({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
      });
      component.defaultAppearance.set({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });

      component.save();

      expect(emitted[0]?.defaultAppearance).toEqual({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });
    });

    it('should include the default image on save', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.model.set({
        name: 'Updated Character',
        description: 'Updated description',
        icon: 'star',
      });
      component.defaultImage.set('media://default.png');

      component.save();

      expect(emitted[0]?.defaultImage).toBe('media://default.png');
    });

    it('should not emit when form is invalid', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.model.set({
        name: '',
        icon: 'person',
        description: '',
      });

      component.save();

      expect(emitted).toHaveLength(0);
    });

    it('should not emit when field keys are duplicated', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      component.updateField(0, 1, { key: 'name' });

      component.save();

      expect(emitted).toHaveLength(0);
      expect(component.validationError()).toBe(
        'Field keys must be unique across the template.'
      );
    });

    it('should reject a flat field key that collides with a nested group', () => {
      const emitted: (ElementTypeSchema | null)[] = [];
      component.done.subscribe(v => emitted.push(v));

      // Give the first tab a nested group 'appearance.*' and a flat field 'appearance'.
      component.updateTab(0, { key: 'appearance', label: 'Appearance' });
      component.updateField(0, 1, { key: 'appearance.height' });
      component.updateField(0, 0, { key: 'appearance' });

      component.save();

      expect(emitted).toHaveLength(0);
      expect(component.validationError()).toContain(
        'conflicts with a nested field group'
      );
    });
  });
});
