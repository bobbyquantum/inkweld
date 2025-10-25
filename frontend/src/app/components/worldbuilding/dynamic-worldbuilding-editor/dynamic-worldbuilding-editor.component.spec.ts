import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import * as Y from 'yjs';

import { ElementTypeSchema } from '../../../models/schema-types';
import { WorldbuildingService } from '../../../services/worldbuilding.service';
import { DynamicWorldbuildingEditorComponent } from './dynamic-worldbuilding-editor.component';

type WorldbuildingMock = DeepMockProxy<WorldbuildingService>;

describe('DynamicWorldbuildingEditorComponent', () => {
  let component: DynamicWorldbuildingEditorComponent;
  let fixture: ComponentFixture<DynamicWorldbuildingEditorComponent>;
  let worldbuildingService: WorldbuildingMock;

  const mockCharacterSchema: ElementTypeSchema = {
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
      {
        key: 'appearance',
        label: 'Appearance',
        icon: 'visibility',
        order: 2,
        fields: [
          {
            key: 'appearance.height',
            label: 'Height',
            type: 'text',
          },
          {
            key: 'appearance.weight',
            label: 'Weight',
            type: 'text',
          },
        ],
      },
    ],
    defaultValues: {
      name: '',
      age: 0,
    },
  };

  beforeEach(async () => {
    worldbuildingService = mockDeep<WorldbuildingService>();
    const mockYMap = new Y.Map();
    worldbuildingService.setupCollaboration.mockResolvedValue(mockYMap);
    worldbuildingService.loadSchemaFromElement.mockReturnValue(
      mockCharacterSchema
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    worldbuildingService.getWorldbuildingData.mockResolvedValue({
      type: 'character',
      id: 'test-element-123',
      name: 'Test Character',
      age: '25',
    } as any);

    await TestBed.configureTestingModule({
      imports: [
        DynamicWorldbuildingEditorComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicWorldbuildingEditorComponent);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('elementId', 'test-element-123');
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-project');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeDefined();
  });

  it('should have a schema signal', () => {
    expect(component.schema).toBeDefined();
    expect(typeof component.schema).toBe('function'); // Signal is a function
  });

  it('should have a reactive form', () => {
    expect(component.form).toBeDefined();
  });

  describe('getTabs', () => {
    it('should return tabs from schema', () => {
      component.schema.set(mockCharacterSchema);

      const tabs = component.getTabs();

      expect(tabs).toHaveLength(2);
      expect(tabs[0].key).toBe('basic');
      expect(tabs[1].key).toBe('appearance');
    });

    it('should return empty array if no schema', () => {
      component.schema.set(null);

      const tabs = component.getTabs();

      expect(tabs).toEqual([]);
    });
  });

  describe('getFieldsForTab', () => {
    it('should return fields for a specific tab', () => {
      component.schema.set(mockCharacterSchema);

      const fields = component.getFieldsForTab('basic');

      expect(fields).toHaveLength(2);
      expect(fields[0].key).toBe('name');
      expect(fields[1].key).toBe('age');
    });

    it('should return empty array if tab not found', () => {
      component.schema.set(mockCharacterSchema);

      const fields = component.getFieldsForTab('nonexistent');

      expect(fields).toEqual([]);
    });

    it('should return empty array if no schema', () => {
      component.schema.set(null);

      const fields = component.getFieldsForTab('basic');

      expect(fields).toEqual([]);
    });
  });

  describe('form building', () => {
    it('should build form with top-level fields', () => {
      component.schema.set(mockCharacterSchema);

      // Manually trigger form building (normally done via effect)
      component['buildFormFromSchema'](mockCharacterSchema);

      expect(component.form.get('name')).toBeDefined();
      expect(component.form.get('age')).toBeDefined();
    });

    it('should build form with nested fields', () => {
      component.schema.set(mockCharacterSchema);

      component['buildFormFromSchema'](mockCharacterSchema);

      const appearanceGroup = component.form.get('appearance');
      expect(appearanceGroup).toBeDefined();
      expect(appearanceGroup?.get('height')).toBeDefined();
      expect(appearanceGroup?.get('weight')).toBeDefined();
    });

    it('should handle array fields', () => {
      const schemaWithArray: ElementTypeSchema = {
        ...mockCharacterSchema,
        tabs: [
          {
            key: 'skills',
            label: 'Skills',
            fields: [
              {
                key: 'skills',
                label: 'Skills',
                type: 'array',
              },
            ],
          },
        ],
      };

      component.schema.set(schemaWithArray);
      component['buildFormFromSchema'](schemaWithArray);

      const skillsControl = component.form.get('skills');
      expect(skillsControl).toBeDefined();
    });
  });

  describe('schema loading', () => {
    it('should load schema when element ID changes', async () => {
      // Schema loading happens via effect in the component
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(worldbuildingService.setupCollaboration).toHaveBeenCalledWith(
        'test-element-123',
        'testuser',
        'test-project'
      );
    });
  });

  describe('data syncing', () => {
    it('should update form when data changes', () => {
      component.schema.set(mockCharacterSchema);
      component['buildFormFromSchema'](mockCharacterSchema);

      const testData = {
        name: 'Updated Character',
        age: 30,
      };

      component['updateFormFromData'](testData);

      expect(component.form.get('name')?.value).toBe('Updated Character');
      expect(component.form.get('age')?.value).toBe(30);
    });

    it('should handle nested data updates', () => {
      component.schema.set(mockCharacterSchema);
      component['buildFormFromSchema'](mockCharacterSchema);

      const testData = {
        appearance: {
          height: '6ft',
          weight: '180lbs',
        },
      };

      component['updateFormFromData'](testData);

      const appearanceGroup = component.form.get('appearance');
      expect(appearanceGroup?.get('height')?.value).toBe('6ft');
      expect(appearanceGroup?.get('weight')?.value).toBe('180lbs');
    });
  });
});
