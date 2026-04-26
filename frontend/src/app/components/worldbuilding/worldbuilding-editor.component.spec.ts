import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { type Element, ElementType } from '../../../api-client';
import {
  type ElementTypeSchema,
  type TabSchema,
} from '../../models/schema-types';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { WorldbuildingEditorComponent } from './worldbuilding-editor.component';

type WorldbuildingMock = DeepMockProxy<WorldbuildingService>;

describe('WorldbuildingEditorComponent', () => {
  let component: WorldbuildingEditorComponent;
  let fixture: ComponentFixture<WorldbuildingEditorComponent>;
  let worldbuildingService: WorldbuildingMock;
  let dialogGatewayMock: {
    openRenameDialog: ReturnType<typeof vi.fn>;
  };
  let matDialogMock: {
    open: ReturnType<typeof vi.fn>;
  };
  let mockProjectState: {
    elements: ReturnType<typeof signal<Element[]>>;
    canWrite: ReturnType<typeof signal<boolean>>;
    renameNode: ReturnType<typeof vi.fn>;
  };

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
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
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'bio', label: 'Biography', type: 'textarea' },
          { key: 'birthDate', label: 'Birth Date', type: 'date' },
          {
            key: 'gender',
            label: 'Gender',
            type: 'select',
            options: ['Male', 'Female', 'Other'],
          },
          {
            key: 'traits',
            label: 'Traits',
            type: 'multiselect',
            options: [
              { value: 'brave', label: 'Brave' },
              { value: 'curious', label: 'Curious' },
            ],
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
          {
            key: 'appearance.palette',
            label: 'Palette',
            type: 'multiselect',
            options: ['Warm', 'Cool'],
          },
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
    });
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
      renameNode: vi.fn(),
    };

    dialogGatewayMock = {
      openRenameDialog: vi.fn().mockResolvedValue(null),
    };
    matDialogMock = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WorldbuildingEditorComponent, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: MatDialog, useValue: matDialogMock },
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

  describe('getFilledFieldCountForTab', () => {
    beforeEach(() => {
      component['schema'].set(mockCharacterSchema);
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should return 0 when no fields are filled', () => {
      expect(component.getFilledFieldCountForTab('basic')).toBe(0);
    });

    it('should count text fields as filled when non-empty', () => {
      component.form().patchValue({ name: 'Alice' });
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should not count whitespace-only text as filled', () => {
      component.form().patchValue({ name: '   ' });
      expect(component.getFilledFieldCountForTab('basic')).toBe(0);
    });

    it('should count number fields as filled', () => {
      component.form().patchValue({ age: 25 });
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should count textarea fields as filled when non-empty', () => {
      component.form().patchValue({ bio: 'A brave warrior' });
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should count checkbox as filled when true', () => {
      component.form().patchValue({ isAlive: true });
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should count multiselect fields as filled when non-empty', () => {
      component.form().patchValue({ traits: ['brave'] });
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should not count checkbox as filled when false', () => {
      component.form().patchValue({ isAlive: false });
      expect(component.getFilledFieldCountForTab('basic')).toBe(0);
    });

    it('should count array fields as filled when non-empty', () => {
      component.addArrayItem('aliases');
      expect(component.getFilledFieldCountForTab('basic')).toBe(1);
    });

    it('should not count empty arrays as filled', () => {
      expect(component.getFilledFieldCountForTab('basic')).toBe(0);
    });

    it('should count multiple filled fields', () => {
      component.form().patchValue({
        name: 'Alice',
        age: 30,
        bio: 'A mage',
        isAlive: true,
      });
      component.addArrayItem('aliases');
      // 5 of 7 fields filled (name, age, bio, isAlive, aliases)
      expect(component.getFilledFieldCountForTab('basic')).toBe(5);
    });

    it('should count nested fields in appearance tab', () => {
      component.form().patchValue({ appearance: { height: '180cm' } });
      expect(component.getFilledFieldCountForTab('appearance')).toBe(1);
    });

    it('should return 0 for non-existent tab', () => {
      expect(component.getFilledFieldCountForTab('nonexistent')).toBe(0);
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
      expect(component.form().get('name')).toBeDefined();
      // Check number field
      expect(component.form().get('age')).toBeDefined();
      // Check textarea field
      expect(component.form().get('bio')).toBeDefined();
      // Check date field
      expect(component.form().get('birthDate')).toBeDefined();
      // Check select field
      expect(component.form().get('gender')).toBeDefined();
      // Check multiselect field
      expect(component.form().get('traits')?.value).toEqual([]);
      // Check checkbox field
      expect(component.form().get('isAlive')).toBeDefined();
      // Check array field
      expect(component.form().get('aliases')).toBeInstanceOf(FormArray);
    });

    it('should handle nested fields with dot notation', () => {
      component['buildFormFromSchema'](mockCharacterSchema);

      // Check nested fields under 'appearance' group
      const appearanceGroup = component.form().get('appearance');
      expect(appearanceGroup).toBeDefined();
      expect(appearanceGroup?.get('height')).toBeDefined();
      expect(appearanceGroup?.get('palette')?.value).toEqual([]);
      expect(appearanceGroup?.get('weight')).toBeDefined();
    });

    it('should handle schema with no tabs gracefully', () => {
      const emptySchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        tabs: undefined as unknown as ElementTypeSchema['tabs'],
      };
      // Should not throw
      component['buildFormFromSchema'](emptySchema);
      expect(component.form()).toBeDefined();
    });
  });

  describe('updateFormFromData', () => {
    beforeEach(() => {
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should update simple form values', () => {
      component['updateFormFromData']({ name: 'John Doe', age: 30 });
      expect(component.form().get('name')?.value).toBe('John Doe');
      expect(component.form().get('age')?.value).toBe(30);
    });

    it('should update nested form values', () => {
      component['updateFormFromData']({
        appearance: { height: '180cm', weight: '75kg' },
      });
      expect(component.form().get('appearance.height')?.value).toBe('180cm');
      expect(component.form().get('appearance.weight')?.value).toBe('75kg');
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

    it('should update nested array form values', () => {
      component['updateFormFromData']({
        appearance: { features: ['Scar', 'Tattoo'] },
      });

      const featuresArray = component.getFormArray('appearance.features');
      expect(featuresArray.length).toBe(2);
      expect(featuresArray.at(0).value).toBe('Scar');
      expect(featuresArray.at(1).value).toBe('Tattoo');
    });

    it('should update multiselect values from remote data', () => {
      component['updateFormFromData']({
        traits: ['brave'],
        appearance: { palette: ['Warm'] },
      });

      expect(component.form().get('traits')?.value).toEqual(['brave']);
      expect(component.form().get('appearance.palette')?.value).toEqual([
        'Warm',
      ]);
    });

    it('should warn when nested group data is not an object', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      component['updateFormFromData']({ appearance: 'unknown' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[WorldbuildingEditor] Skipping field "appearance": FormGroup expected object but got string'
      );
      consoleSpy.mockRestore();
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

    it('should disable the form after loading when write access is unavailable', async () => {
      mockProjectState.canWrite.set(false);

      await component['loadElementData']('test-element-123');

      expect(component.form().disabled).toBe(true);
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

    it('should rebuild schema from realtime sync data when schema is missing', async () => {
      let changeHandler: ((data: Record<string, unknown>) => void) | undefined;

      worldbuildingService.observeChanges.mockReset();
      worldbuildingService.observeChanges.mockImplementation(
        (_elementId, callback) => {
          changeHandler = callback;
          return Promise.resolve(() => {});
        }
      );
      worldbuildingService.getSchemaForElement.mockClear();
      worldbuildingService.getSchemaForElement.mockResolvedValue(
        mockCharacterSchema
      );
      component['schema'].set(null);

      await component['setupRealtimeSync']('test-element-123');
      changeHandler?.({ schemaId: 'character', name: 'Realtime Name' });
      await fixture.whenStable();

      expect(worldbuildingService.getSchemaForElement).toHaveBeenCalledWith(
        'test-element-123',
        'testuser',
        'test-project'
      );
      expect(component['schema']()).toEqual(mockCharacterSchema);
      expect(component.form().get('name')?.value).toBe('Realtime Name');
    });
  });

  describe('saveData', () => {
    beforeEach(() => {
      component['buildFormFromSchema'](mockCharacterSchema);
    });

    it('should save form data to service', async () => {
      component.form().patchValue({ name: 'Test Name', age: 30 });

      await component['saveData']();

      expect(worldbuildingService.saveWorldbuildingData).toHaveBeenCalledWith(
        'test-element-123',
        expect.objectContaining({ name: 'Test Name', age: 30 }),
        'testuser',
        'test-project'
      );
    });
  });

  describe('section navigation', () => {
    beforeEach(() => {
      component['schema'].set(mockCharacterSchema);
    });

    describe('selectSection', () => {
      it('should set selectedSection to the given section', () => {
        component.selectSection('identity');
        expect(component.selectedSection()).toBe('identity');
      });

      it('should switch to a tab section', () => {
        component.selectSection('appearance');
        expect(component.selectedSection()).toBe('appearance');
      });

      it('should switch to relationships section', () => {
        component.selectSection('relationships');
        expect(component.selectedSection()).toBe('relationships');
      });
    });

    describe('isTabSection', () => {
      it('should return false for identity section', () => {
        component.selectedSection.set('identity');
        expect(component.isTabSection()).toBe(false);
      });

      it('should return false for relationships section', () => {
        component.selectedSection.set('relationships');
        expect(component.isTabSection()).toBe(false);
      });

      it('should return true for a schema tab section', () => {
        component.selectedSection.set('basic');
        expect(component.isTabSection()).toBe(true);
      });
    });

    describe('getSectionLabel', () => {
      it('should return "Identity & Details" for identity section', () => {
        expect(component.getSectionLabel('identity')).toBe(
          'Identity & Details'
        );
      });

      it('should return "Relationships" for relationships section', () => {
        expect(component.getSectionLabel('relationships')).toBe(
          'Relationships'
        );
      });

      it('should return tab label for a tab section', () => {
        expect(component.getSectionLabel('basic')).toBe('Basic Info');
      });

      it('should return section key as fallback for unknown tab', () => {
        expect(component.getSectionLabel('unknown')).toBe('unknown');
      });
    });
    describe('layout mode', () => {
      let originalInnerWidth: number;
      let originalMatchMedia: typeof window.matchMedia;

      const recreateComponentForViewport = async (
        width: number,
        isLandscape: boolean
      ): Promise<void> => {
        fixture.destroy();

        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          value: width,
        });
        window.matchMedia = vi
          .fn()
          .mockImplementation((query: string): MediaQueryList => {
            const matches =
              query === '(orientation: landscape)' ? isLandscape : false;
            return {
              matches,
              media: query,
              onchange: null,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
              addListener: vi.fn(),
              removeListener: vi.fn(),
              dispatchEvent: vi.fn(),
            };
          });

        fixture = TestBed.createComponent(WorldbuildingEditorComponent);
        component = fixture.componentInstance;

        fixture.componentRef.setInput('elementId', 'test-element-123');
        fixture.componentRef.setInput('username', 'testuser');
        fixture.componentRef.setInput('slug', 'test-project');
        fixture.componentRef.setInput('elementType', ElementType.Worldbuilding);

        fixture.detectChanges();
        await fixture.whenStable();
      };

      beforeEach(() => {
        originalInnerWidth = window.innerWidth;
        originalMatchMedia = window.matchMedia;
      });

      afterEach(() => {
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          value: originalInnerWidth,
        });
        window.matchMedia = originalMatchMedia;
      });

      it('should use sidenav for desktop viewport', async () => {
        await recreateComponentForViewport(1280, true);

        expect(component.useSidenav()).toBe(true);
        expect(component.selectedSection()).toBe('identity');
      });

      it('should use accordion for narrow portrait viewport', async () => {
        await recreateComponentForViewport(759, false);

        expect(component.useSidenav()).toBe(false);
        expect(component.selectedSection()).toBe('identity');
      });
    });

    describe('getTabIcon', () => {
      it('should return tab icon when defined', () => {
        const tab: TabSchema = {
          key: 'test',
          label: 'Test',
          icon: 'star',
          order: 1,
          fields: [],
        };
        expect(component.getTabIcon(tab)).toBe('star');
      });

      it('should return "article" fallback when no icon', () => {
        const tab: TabSchema = {
          key: 'test',
          label: 'Test',
          order: 1,
          fields: [],
        };
        expect(component.getTabIcon(tab)).toBe('article');
      });
    });

    describe('field helpers', () => {
      it('should resolve group and control names for nested fields', () => {
        const nestedField = mockCharacterSchema.tabs[1].fields[0];

        expect(component.getFieldGroupName(nestedField)).toBe('appearance');
        expect(component.getFieldControlName(nestedField)).toBe('height');
      });

      it('should return null group name and full control name for top-level fields', () => {
        const field = mockCharacterSchema.tabs[0].fields[0];

        expect(component.getFieldGroupName(field)).toBeNull();
        expect(component.getFieldControlName(field)).toBe('name');
      });

      it('should expose field options and labels for string and object options', () => {
        const selectField = mockCharacterSchema.tabs[0].fields[4];
        const multiselectField = mockCharacterSchema.tabs[0].fields[5];

        expect(component.getFieldOptions(selectField)).toEqual([
          'Male',
          'Female',
          'Other',
        ]);
        expect(component.getFieldOptions(multiselectField)).toEqual([
          { value: 'brave', label: 'Brave' },
          { value: 'curious', label: 'Curious' },
        ]);
        expect(component.getOptionValue('Male')).toBe('Male');
        expect(
          component.getOptionValue({ value: 'brave', label: 'Brave' })
        ).toBe('brave');
        expect(component.getOptionLabel('Male')).toBe('Male');
        expect(
          component.getOptionLabel({ value: 'brave', label: 'Brave' })
        ).toBe('Brave');
      });
    });

    describe('dialogs', () => {
      it('should open the tags dialog with element context', () => {
        component.openTagsDialog();

        expect(matDialogMock.open).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            data: {
              elementId: 'test-element-123',
              elementName: 'Test Character',
            },
            width: '450px',
            autoFocus: false,
          })
        );
      });

      it('should open the snapshots dialog for the active element', () => {
        component.openSnapshotsDialog();

        expect(matDialogMock.open).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            data: { documentId: 'test-element-123' },
            width: '550px',
            autoFocus: false,
          })
        );
      });
    });

    describe('rename flow', () => {
      it('should rename the active element when the dialog returns a new name', async () => {
        dialogGatewayMock.openRenameDialog.mockResolvedValue(
          'Renamed Character'
        );

        await component.onRenameRequested();

        expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalledWith({
          currentName: 'Test Character',
          title: 'Rename Element',
        });
        expect(mockProjectState.renameNode).toHaveBeenCalledWith(
          mockElement,
          'Renamed Character'
        );
      });

      it('should not rename when the dialog is cancelled', async () => {
        dialogGatewayMock.openRenameDialog.mockResolvedValue(null);

        await component.onRenameRequested();

        expect(mockProjectState.renameNode).not.toHaveBeenCalled();
      });

      it('should skip rename when the active element cannot be found', async () => {
        mockProjectState.elements.set([]);

        await component.onRenameRequested();

        expect(dialogGatewayMock.openRenameDialog).not.toHaveBeenCalled();
        expect(mockProjectState.renameNode).not.toHaveBeenCalled();
      });
    });

    describe('resize cleanup', () => {
      it('should clean up resize listener on destroy', () => {
        const mockResizeCleanup = vi.fn();
        const mutableComponent = component as unknown as {
          resizeCleanup: (() => void) | null;
        };
        mutableComponent.resizeCleanup = mockResizeCleanup;

        component.ngOnDestroy();

        expect(mockResizeCleanup).toHaveBeenCalled();
      });

      it('should handle destroy when no resize cleanup exists', () => {
        const mutableComponent = component as unknown as {
          resizeCleanup: (() => void) | null;
        };
        mutableComponent.resizeCleanup = null;
        expect(() => component.ngOnDestroy()).not.toThrow();
      });
    });
  });

  describe('initializeIfNeeded', () => {
    it('should return null when write access is unavailable', async () => {
      mockProjectState.canWrite.set(false);

      await expect(
        component['initializeIfNeeded'](
          'test-element-123',
          'testuser',
          'test-project'
        )
      ).resolves.toBeNull();
    });

    it('should return null when the active element cannot be found', async () => {
      mockProjectState.elements.set([]);

      await expect(
        component['initializeIfNeeded'](
          'test-element-123',
          'testuser',
          'test-project'
        )
      ).resolves.toBeNull();
    });

    it('should initialize the element and return the resolved schema', async () => {
      worldbuildingService.getSchemaForElement.mockClear();
      worldbuildingService.getSchemaForElement.mockResolvedValue(
        mockCharacterSchema
      );

      const result = await component['initializeIfNeeded'](
        'test-element-123',
        'testuser',
        'test-project'
      );

      expect(
        worldbuildingService.initializeWorldbuildingElement
      ).toHaveBeenCalledWith(mockElement, 'testuser', 'test-project');
      expect(result).toEqual(mockCharacterSchema);
    });
  });
});
