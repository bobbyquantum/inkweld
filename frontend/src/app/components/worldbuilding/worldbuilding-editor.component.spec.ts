import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { type Element, ElementType } from '../../../api-client';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { DocumentSyncState } from '../../models/document-sync-state';
import {
  type ElementTypeSchema,
  type TabSchema,
} from '../../models/schema-types';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { ElementSyncProviderFactory } from '../../services/sync/element-sync-provider.factory';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { WorldbuildingEditorComponent } from './worldbuilding-editor.component';

type WorldbuildingMock = DeepMockProxy<WorldbuildingService>;

describe('WorldbuildingEditorComponent', () => {
  let component: WorldbuildingEditorComponent;
  let fixture: ComponentFixture<WorldbuildingEditorComponent>;
  let worldbuildingService: WorldbuildingMock;
  let dialogGatewayMock: {
    openRenameDialog: ReturnType<typeof vi.fn>;
    openTagEditorDialog: ReturnType<typeof vi.fn>;
    openSnapshotsDialog: ReturnType<typeof vi.fn>;
    openConfirmationDialog: ReturnType<typeof vi.fn>;
  };
  let matDialogMock: {
    open: ReturnType<typeof vi.fn>;
  };
  let mockProjectState: {
    elements: ReturnType<typeof signal<Element[]>>;
    canWrite: ReturnType<typeof signal<boolean>>;
    renameNode: ReturnType<typeof vi.fn>;
  };
  let syncStateSubject: BehaviorSubject<DocumentSyncState>;

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
      openTagEditorDialog: vi.fn().mockResolvedValue(undefined),
      openSnapshotsDialog: vi.fn().mockResolvedValue(undefined),
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };
    matDialogMock = {
      open: vi.fn(),
    };

    const empty = <T>() => new BehaviorSubject<T>([] as T);
    const none = <T>() => new BehaviorSubject<T | null>(null);
    syncStateSubject = new BehaviorSubject<DocumentSyncState>(
      DocumentSyncState.Synced
    );
    const provider = {
      syncState$: syncStateSubject,
      getSyncState: () => syncStateSubject.getValue(),
      elements$: empty<Element[]>(),
      getElements: () => [],
      publishPlans$: empty<unknown[]>(),
      getPublishPlans: () => [],
      relationships$: empty<unknown[]>(),
      getRelationships: () => [],
      customRelationshipTypes$: empty<unknown[]>(),
      getCustomRelationshipTypes: () => [],
      schemas$: empty<unknown[]>(),
      getSchemas: () => [],
      timeSystems$: empty<unknown[]>(),
      getTimeSystems: () => [],
      elementTags$: empty<unknown[]>(),
      getElementTags: () => [],
      customTags$: empty<unknown[]>(),
      getCustomTags: () => [],
      mediaTags$: empty<unknown[]>(),
      getMediaTags: () => [],
      mediaProjectTags$: empty<unknown[]>(),
      getMediaProjectTags: () => [],
      projectMeta$: none<unknown>(),
      getProjectMeta: () => undefined,
      lastConnectionError$: none<string>(),
      errors$: empty<string>(),
      remotePresence$: empty<unknown[]>(),
      updateElements: vi.fn(),
      updatePublishPlans: vi.fn(),
      updateRelationships: vi.fn(),
      updateCustomRelationshipTypes: vi.fn(),
      updateSchemas: vi.fn(),
      updateTimeSystems: vi.fn(),
      updateElementTags: vi.fn(),
      updateCustomTags: vi.fn(),
      updateMediaTags: vi.fn(),
      updateMediaProjectTags: vi.fn(),
      updateProjectMeta: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(() => false),
      setLocalPresence: vi.fn(),
    };
    const syncFactoryMock = {
      getProvider: vi.fn().mockReturnValue(provider),
    };

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        WorldbuildingEditorComponent,
        ReactiveFormsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: MatDialog, useValue: matDialogMock },
        { provide: ElementSyncProviderFactory, useValue: syncFactoryMock },
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

  it('should build the form from a preview schema without loading data', async () => {
    fixture.componentRef.setInput('previewSchema', mockCharacterSchema);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.previewMode()).toBe(true);
    expect(component.schema()).toBe(mockCharacterSchema);
    expect(component.form().get('name')).toBeDefined();
    expect(component.form().get('age')).toBeDefined();
    expect(component.isInitialLoading()).toBe(false);
    // Preview form is read-only.
    expect(component.form().disabled).toBe(true);
  });

  describe('syncTooltip', () => {
    it('should return synced tooltip when synced', () => {
      expect(component.syncTooltip()).toBe('Document synced');
    });

    it('should return syncing tooltip when syncing', () => {
      syncStateSubject.next(DocumentSyncState.Syncing);
      expect(component.syncTooltip()).toBe('Syncing…');
    });

    it('should return offline tooltip for local state', () => {
      syncStateSubject.next(DocumentSyncState.Local);
      expect(component.syncTooltip()).toBe('Offline - changes saved locally');
    });

    it('should return unavailable tooltip for unavailable state', () => {
      syncStateSubject.next(DocumentSyncState.Unavailable);
      expect(component.syncTooltip()).toBe('Unable to connect to server');
    });
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

      component.ngOnDestroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should handle destroy when no observers exist', () => {
      component['unsubscribeObserver'] = null;

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
      it.each([['identity'], ['relationships'], ['styling']])(
        'should return false for %s section',
        section => {
          component.selectedSection.set(section);
          expect(component.isTabSection()).toBe(false);
        }
      );

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

      it('should return "Styling" for styling section', () => {
        expect(component.getSectionLabel('styling')).toBe('Styling');
      });

      it('should return tab label for a tab section', () => {
        expect(component.getSectionLabel('basic')).toBe('Basic Info');
      });

      it('should return section key as fallback for unknown tab', () => {
        expect(component.getSectionLabel('unknown')).toBe('unknown');
      });
    });

    describe('rendered tab section', () => {
      it('should show a desktop-only section title above a single fields card', async () => {
        component.selectedSection.set('basic');
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const title = fixture.nativeElement.querySelector(
          '[data-testid="tab-section-title"]'
        );
        expect(title?.textContent).toContain('Basic Info');

        const card = fixture.nativeElement.querySelector(
          '[data-testid="tab-fields-card"]'
        );
        expect(card).toBeTruthy();
        // All fields live inside the single card.
        const fields = card.querySelectorAll('.field-container');
        expect(fields).toHaveLength(8);
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

      it('should show the styling nav item for editors', async () => {
        await recreateComponentForViewport(1280, true);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('[data-testid="nav-styling"]')
        ).toBeTruthy();
      });

      it('should hide the styling nav item for read-only users', async () => {
        mockProjectState.canWrite.set(false);
        await recreateComponentForViewport(1280, true);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('[data-testid="nav-styling"]')
        ).toBeNull();
      });

      it('should render a fields card in accordion mode', async () => {
        component['schema'].set(mockCharacterSchema);
        await recreateComponentForViewport(759, false);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const accordion = fixture.nativeElement.querySelector(
          '[data-testid="wb-accordion"]'
        );
        expect(accordion).toBeTruthy();
        expect(
          accordion.querySelector('[data-testid="tab-fields-card"]')
        ).toBeTruthy();
      });

      it('should mark the accordion with the custom menu background', async () => {
        await recreateComponentForViewport(759, false);
        fixture.detectChanges();
        const panel = component.identityPanel();
        panel?.appearance.set({
          menu: { type: 'color', mode: 'auto', value: '#123456' },
        });
        fixture.detectChanges();

        const accordion = fixture.nativeElement.querySelector(
          '[data-testid="wb-accordion"]'
        );
        expect(accordion.classList).toContain('has-custom-background');
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

        expect(dialogGatewayMock.openTagEditorDialog).toHaveBeenCalledWith({
          elementId: 'test-element-123',
          elementName: 'Test Character',
        });
      });

      it('should open the snapshots dialog for the active element', () => {
        component.openSnapshotsDialog();

        expect(dialogGatewayMock.openSnapshotsDialog).toHaveBeenCalledWith({
          documentId: 'test-element-123',
        });
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

    it('should revoke cached blob URLs on destroy', () => {
      const revokeSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {});
      component['resolvedImageUrls'].set({
        'media://bg.png': 'blob:abc',
        'https://x/y.png': 'https://x/y.png',
      });

      component.ngOnDestroy();

      expect(revokeSpy).toHaveBeenCalledWith('blob:abc');
      expect(revokeSpy).not.toHaveBeenCalledWith('https://x/y.png');
      revokeSpy.mockRestore();
    });
  });

  describe('background resolution', () => {
    it('should expose null backgrounds when the identity panel has no appearance', () => {
      fixture.detectChanges();
      const panel = component.identityPanel();
      panel?.appearance.set(undefined);
      expect(component.menuBackground()).toBeNull();
      expect(component.contentBackground()).toBeNull();
    });

    it('should resolve the menu background from the identity appearance', () => {
      fixture.detectChanges();
      const panel = component.identityPanel();
      panel?.appearance.set({
        menu: {
          type: 'color',
          mode: 'manual',
          light: '#123456',
          dark: '#000000',
        },
      });
      expect(component.menuBackground()?.background).toBe('#123456');
      expect(component.contentBackground()).toBeNull();
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

  describe('schema edit mode', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('previewSchema', mockCharacterSchema);
      fixture.componentRef.setInput('editMode', true);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should enable schema editing only in preview + edit mode', () => {
      expect(component['schemaEditingEnabled']()).toBe(true);
    });

    it('should be disabled outside edit mode', async () => {
      fixture.componentRef.setInput('editMode', false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component['schemaEditingEnabled']()).toBe(false);
    });

    it('should emit an add-field event', () => {
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onAddField']('basic');
      expect(emit).toHaveBeenCalledWith({ type: 'add-field', tabKey: 'basic' });
    });

    it('should emit a remove-field event', () => {
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onRemoveField']('basic', 'name');
      expect(emit).toHaveBeenCalledWith({
        type: 'remove-field',
        tabKey: 'basic',
        fieldKey: 'name',
      });
    });

    it('should emit a move-field event', () => {
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onMoveField']('basic', 'age', 1);
      expect(emit).toHaveBeenCalledWith({
        type: 'move-field',
        tabKey: 'basic',
        fieldKey: 'age',
        delta: 1,
      });
    });

    it('should emit an update-field event', () => {
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onUpdateField']('basic', 'name', { label: 'Full name' });
      expect(emit).toHaveBeenCalledWith({
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'name',
        patch: { label: 'Full name' },
      });
    });

    it('should toggle field config open state', () => {
      expect(component['fieldConfigOpen']('basic', 'name')).toBe(false);
      component['toggleFieldConfig']('basic', 'name');
      expect(component['fieldConfigOpen']('basic', 'name')).toBe(true);
      component['toggleFieldConfig']('basic', 'name');
      expect(component['fieldConfigOpen']('basic', 'name')).toBe(false);
    });

    it('should emit add/remove tab events', async () => {
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onAddTab']();
      await component['onRemoveTab']('appearance');
      expect(emit).toHaveBeenNthCalledWith(1, { type: 'add-tab' });
      expect(emit).toHaveBeenNthCalledWith(2, {
        type: 'remove-tab',
        tabKey: 'appearance',
      });
    });

    it('should not emit a remove-tab event when the user cancels', async () => {
      dialogGatewayMock.openConfirmationDialog.mockResolvedValue(false);
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      await component['onRemoveTab']('appearance');
      expect(emit).not.toHaveBeenCalled();
    });

    it('should not emit events when schema editing is disabled', () => {
      fixture.componentRef.setInput('editMode', false);
      fixture.detectChanges();
      const emit = vi.fn();
      component.schemaEdit.subscribe(emit);
      component['onAddField']('basic');
      expect(emit).not.toHaveBeenCalled();
    });

    it('should emit a schema info change', () => {
      const emit = vi.fn();
      component.schemaInfoChange.subscribe(emit);
      component['onSchemaInfoChange']({ name: 'Hero' });
      expect(emit).toHaveBeenCalledWith({ name: 'Hero' });
    });

    it('should emit a default appearance change', () => {
      const emit = vi.fn();
      component.defaultAppearanceChange.subscribe(emit);
      component['onDefaultAppearanceChange']({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });
      expect(emit).toHaveBeenCalledWith({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });
    });

    it('should gate schema info/appearance emission behind edit mode', () => {
      fixture.componentRef.setInput('editMode', false);
      fixture.detectChanges();
      const infoEmit = vi.fn();
      const appEmit = vi.fn();
      component.schemaInfoChange.subscribe(infoEmit);
      component.defaultAppearanceChange.subscribe(appEmit);
      component['onSchemaInfoChange']({ name: 'Hero' });
      component['onDefaultAppearanceChange']({});
      expect(infoEmit).not.toHaveBeenCalled();
      expect(appEmit).not.toHaveBeenCalled();
    });
  });
});
