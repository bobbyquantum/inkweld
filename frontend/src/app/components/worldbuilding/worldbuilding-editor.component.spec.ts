import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { Element, ElementType } from '../../../api-client';
import { ElementTypeSchema } from '../../models/schema-types';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { WorldbuildingEditorComponent } from './worldbuilding-editor.component';

type WorldbuildingMock = DeepMockProxy<WorldbuildingService>;

describe('WorldbuildingEditorComponent', () => {
  let component: WorldbuildingEditorComponent;
  let fixture: ComponentFixture<WorldbuildingEditorComponent>;
  let worldbuildingService: WorldbuildingMock;
  let mockProjectState: {
    elements: ReturnType<typeof signal<Element[]>>;
    canWrite: ReturnType<typeof signal<boolean>>;
  };

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
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
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'bio', label: 'Biography', type: 'textarea' },
          { key: 'birthDate', label: 'Birth Date', type: 'date' },
          {
            key: 'gender',
            label: 'Gender',
            type: 'select',
            options: ['Male', 'Female', 'Other'],
          },
          { key: 'isAlive', label: 'Is Alive', type: 'checkbox' },
          { key: 'aliases', label: 'Aliases', type: 'array' },
        ],
      },
      {
        key: 'appearance',
        label: 'Appearance',
        icon: 'visibility',
        order: 2,
        fields: [
          { key: 'appearance.height', label: 'Height', type: 'text' },
          { key: 'appearance.weight', label: 'Weight', type: 'text' },
          { key: 'appearance.features', label: 'Features', type: 'array' },
        ],
      },
    ],
    defaultValues: { name: '', age: 0 },
  };

  const mockElement: Element = {
    id: 'test-element-123',
    name: 'Test Character',
    type: ElementType.Worldbuilding,
    schemaId: 'character',
    parentId: null,
    level: 0,
    order: 0,
    expandable: false,
    version: 1,
    metadata: {},
  };

  beforeEach(async () => {
    worldbuildingService = mockDeep<WorldbuildingService>();

    // Mock the new abstraction methods
    worldbuildingService.getSchemaForElement.mockResolvedValue(
      mockCharacterSchema
    );
    worldbuildingService.getWorldbuildingData.mockResolvedValue({
      id: 'test-element-123',
      type: 'character',
      name: 'Test Character',
      age: '25',
    } as Record<string, unknown>);
    worldbuildingService.observeChanges.mockResolvedValue(() => {});
    worldbuildingService.saveWorldbuildingData.mockResolvedValue();
    worldbuildingService.initializeWorldbuildingElement.mockResolvedValue();

    // Mock identity data methods
    worldbuildingService.getIdentityData.mockResolvedValue({});
    worldbuildingService.saveIdentityData.mockResolvedValue();
    worldbuildingService.observeIdentityChanges.mockResolvedValue(() => {});

    mockProjectState = {
      elements: signal<Element[]>([mockElement]),
      canWrite: signal<boolean>(true),
    };

    const mockDialogGateway = {
      openRenameDialog: vi.fn().mockResolvedValue(null),
    };

    await TestBed.configureTestingModule({
      imports: [WorldbuildingEditorComponent, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingEditorComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('elementId', 'test-element-123');
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-project');
    fixture.componentRef.setInput('elementType', ElementType.Worldbuilding);

    fixture.detectChanges();
    // Wait for effect to run
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeDefined();
  });

  describe('getTabs', () => {
    it('should return tabs from schema', () => {
      component['schema'].set(mockCharacterSchema);
      const tabs = component.getTabs();
      expect(tabs).toHaveLength(2);
      expect(tabs[0].key).toBe('basic');
      expect(tabs[1].key).toBe('appearance');
    });

    it('should return empty array when no schema', () => {
      component['schema'].set(null);
      const tabs = component.getTabs();
      expect(tabs).toEqual([]);
    });
  });

  describe('getFieldsForTab', () => {
    it('should return fields for existing tab', () => {
      component['schema'].set(mockCharacterSchema);
      const fields = component.getFieldsForTab('basic');
      expect(fields.length).toBeGreaterThan(0);
      expect(fields.some(f => f.key === 'name')).toBe(true);
    });

    it('should return empty array for non-existent tab', () => {
      component['schema'].set(mockCharacterSchema);
      const fields = component.getFieldsForTab('nonexistent');
      expect(fields).toEqual([]);
    });

    it('should return empty array when no schema', () => {
      component['schema'].set(null);
      const fields = component.getFieldsForTab('basic');
      expect(fields).toEqual([]);
    });
  });

  describe('FormArray operations', () => {
    beforeEach(() => {
      // Build the form first
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should get form array for field', () => {
      const formArray = component.getFormArray('aliases');
      expect(formArray).toBeInstanceOf(FormArray);
    });

    it('should add item to array field', () => {
      const initialLength = component.getFormArray('aliases').length;
      component.addArrayItem('aliases');
      expect(component.getFormArray('aliases').length).toBe(initialLength + 1);
    });

    it('should remove item from array field', () => {
      component.addArrayItem('aliases');
      component.addArrayItem('aliases');
      const initialLength = component.getFormArray('aliases').length;
      component.removeArrayItem('aliases', 0);
      expect(component.getFormArray('aliases').length).toBe(initialLength - 1);
    });
  });

  describe('buildFormFromSchema', () => {
    it('should build form with all field types', () => {
      component['buildFormFromSchema'](mockCharacterSchema);

      // Check text field
      expect(component.form.get('name')).toBeDefined();
      // Check number field
      expect(component.form.get('age')).toBeDefined();
      // Check textarea field
      expect(component.form.get('bio')).toBeDefined();
      // Check date field
      expect(component.form.get('birthDate')).toBeDefined();
      // Check select field
      expect(component.form.get('gender')).toBeDefined();
      // Check checkbox field
      expect(component.form.get('isAlive')).toBeDefined();
      // Check array field
      expect(component.form.get('aliases')).toBeInstanceOf(FormArray);
    });

    it('should handle nested fields with dot notation', () => {
      component['buildFormFromSchema'](mockCharacterSchema);

      // Check nested fields under 'appearance' group
      const appearanceGroup = component.form.get('appearance');
      expect(appearanceGroup).toBeDefined();
      expect(appearanceGroup?.get('height')).toBeDefined();
      expect(appearanceGroup?.get('weight')).toBeDefined();
    });

    it('should handle schema with no tabs gracefully', () => {
      const emptySchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        tabs: undefined as unknown as ElementTypeSchema['tabs'],
      };
      // Should not throw
      component['buildFormFromSchema'](emptySchema);
    });
  });

  describe('updateFormFromData', () => {
    beforeEach(() => {
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should update simple form values', () => {
      component['updateFormFromData']({ name: 'John Doe', age: 30 });
      expect(component.form.get('name')?.value).toBe('John Doe');
      expect(component.form.get('age')?.value).toBe(30);
    });

    it('should update nested form values', () => {
      component['updateFormFromData']({
        appearance: { height: '180cm', weight: '75kg' },
      });
      expect(component.form.get('appearance.height')?.value).toBe('180cm');
      expect(component.form.get('appearance.weight')?.value).toBe('75kg');
    });

    it('should update array form values', () => {
      component['updateFormFromData']({
        aliases: ['John', 'Johnny', 'J'],
      });
      const aliasesArray = component.getFormArray('aliases');
      expect(aliasesArray.length).toBe(3);
      expect(aliasesArray.at(0).value).toBe('John');
      expect(aliasesArray.at(1).value).toBe('Johnny');
    });

    it('should set isUpdatingFromRemote flag during update', () => {
      expect(component['isUpdatingFromRemote']).toBe(false);
      // The flag is set to true during update and false after
      component['updateFormFromData']({ name: 'Test' });
      expect(component['isUpdatingFromRemote']).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('should clean up observers on destroy', () => {
      const mockUnsubscribe = vi.fn();
      component['unsubscribeObserver'] = mockUnsubscribe;
      const mockFormUnsubscribe = vi.fn();
      component['formSubscription'] = mockFormUnsubscribe;

      component.ngOnDestroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockFormUnsubscribe).toHaveBeenCalled();
    });

    it('should handle destroy when no observers exist', () => {
      component['unsubscribeObserver'] = null;
      component['formSubscription'] = null;

      // Should not throw
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('loadElementData', () => {
    it('should load schema and data on element load', async () => {
      await component['loadElementData']('test-element-123');

      // Should use the project-level schema lookup
      expect(worldbuildingService.getSchemaForElement).toHaveBeenCalledWith(
        'test-element-123',
        'testuser',
        'test-project'
      );
      expect(worldbuildingService.getWorldbuildingData).toHaveBeenCalledWith(
        'test-element-123',
        'testuser',
        'test-project'
      );
    });

    it('should handle missing schema by initializing element', async () => {
      worldbuildingService.getSchemaForElement
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCharacterSchema);

      await component['loadElementData']('test-element-123');

      expect(
        worldbuildingService.initializeWorldbuildingElement
      ).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      worldbuildingService.getSchemaForElement.mockRejectedValue(
        new Error('Connection failed')
      );

      await component['loadElementData']('test-element-123');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setupRealtimeSync', () => {
    it('should set up observer for realtime changes', async () => {
      await component['setupRealtimeSync']('test-element-123');

      expect(worldbuildingService.observeChanges).toHaveBeenCalledWith(
        'test-element-123',
        expect.any(Function),
        'testuser',
        'test-project'
      );
    });

    it('should unsubscribe previous observer when setting up new one', async () => {
      const mockUnsubscribe = vi.fn();
      component['unsubscribeObserver'] = mockUnsubscribe;

      await component['setupRealtimeSync']('test-element-123');

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('saveData', () => {
    beforeEach(() => {
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should save form data to service', async () => {
      component.form.patchValue({ name: 'Test Name', age: 30 });

      await component['saveData']();

      expect(worldbuildingService.saveWorldbuildingData).toHaveBeenCalledWith(
        'test-element-123',
        expect.objectContaining({ name: 'Test Name', age: 30 }),
        'testuser',
        'test-project'
      );
    });
  });

  describe('meta panel', () => {
    it('should start with meta panel hidden', () => {
      expect(component.showMetaPanel()).toBe(false);
    });

    it('should be able to toggle meta panel', () => {
      component.showMetaPanel.set(true);
      expect(component.showMetaPanel()).toBe(true);

      component.showMetaPanel.set(false);
      expect(component.showMetaPanel()).toBe(false);
    });
  });
});
