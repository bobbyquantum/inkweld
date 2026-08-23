import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { type Project } from '@inkweld/index';
import { type ElementTypeSchema } from '@models/schema-types';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  TEMPLATE_RELOAD_DELAY,
  TemplatesTabComponent,
} from './templates-tab.component';

describe('TemplatesTabComponent', () => {
  let component: TemplatesTabComponent;
  let fixture: ComponentFixture<TemplatesTabComponent>;
  let mockProjectState: {
    project: ReturnType<typeof signal<Project | null>>;
    elements: ReturnType<typeof signal<any[]>>;
    canWrite: ReturnType<typeof signal<boolean>>;
    openSchemaEditor: ReturnType<typeof vi.fn>;
    closeSchemaEditor: ReturnType<typeof vi.fn>;
  };
  let mockWorldbuildingService: any;
  let mockSnackBar: any;
  let mockDialogGateway: any;
  let mockRelationshipFieldService: {
    removeTypesForSchema: ReturnType<typeof vi.fn>;
  };

  const mockProject: Project = {
    id: 'test-project-id',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: '',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
  };

  const createMockSchemas = (
    schemas: Partial<ElementTypeSchema>[]
  ): ElementTypeSchema[] => {
    return schemas.map(schema => ({
      id: schema.id || 'generated-id',
      name: schema.name || 'Unknown',
      icon: schema.icon || 'help',
      description: schema.description || '',
      version: schema.version || 1,

      tabs: schema.tabs || [],
      defaultValues: schema.defaultValues,
      ...schema,
    }));
  };

  beforeEach(async () => {
    mockProjectState = {
      project: signal<Project | null>(null),
      elements: signal([]),
      canWrite: signal(true),
      openSchemaEditor: vi.fn(),
      closeSchemaEditor: vi.fn(),
    };

    const initialSchemasSignal = signal<ElementTypeSchema[]>([]);
    mockWorldbuildingService = {
      schemas: initialSchemasSignal.asReadonly(),
      getAllSchemas: vi.fn(),
      getSchema: vi.fn(),
      saveSchemasToLibrary: vi.fn(),
      saveSchemaToLibrary: vi.fn(),
      cloneTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      getSchemaForElement: vi.fn().mockResolvedValue(null),
      getWorldbuildingData: vi.fn().mockResolvedValue({}),
      getIdentityData: vi.fn().mockResolvedValue({}),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
      observeChanges: vi.fn().mockResolvedValue(() => {}),
      observeIdentityChanges: vi.fn().mockResolvedValue(() => {}),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockDialogGateway = {
      openRenameDialog: vi.fn(),
      openConfirmationDialog: vi.fn(),
    };

    mockRelationshipFieldService = {
      removeTypesForSchema: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), TemplatesTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        {
          provide: RelationshipFieldService,
          useValue: mockRelationshipFieldService,
        },
        // Override timeout to 0 for faster tests
        { provide: TEMPLATE_RELOAD_DELAY, useValue: 0 },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplatesTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadTemplates', () => {
    it('should load templates successfully', () => {
      mockProjectState.project.set(mockProject);

      const characterSchema = {
        id: 'char-1',
        name: 'Character',
        icon: 'person',
        description: 'A character template',
        version: 1,
        tabs: [
          {
            key: 'basics',
            label: 'Basics',
            fields: [
              { key: 'name', label: 'Name', type: 'text' },
              { key: 'age', label: 'Age', type: 'number' },
            ],
          },
        ],
      };

      const mockSchemas = createMockSchemas([characterSchema]);
      mockWorldbuildingService.getAllSchemas.mockReturnValue(mockSchemas);

      component.loadTemplates();

      // Templates load synchronously from cache

      expect(component.templates()).toHaveLength(1);
      expect(component.templates()[0].id).toBe('char-1');
      expect(component.templates()[0].label).toBe('Character');
      expect(component.templates()[0].tabCount).toBe(1);
      expect(component.templates()[0].fieldCount).toBe(2);
      expect(component.isLoading()).toBe(false);
      expect(component.error()).toBeNull();
    });

    it('should handle empty schemas', () => {
      mockProjectState.project.set(mockProject);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      component.loadTemplates();

      expect(component.templates()).toHaveLength(0);
      expect(component.isLoading()).toBe(false);
    });

    it('should handle loading errors', () => {
      mockProjectState.project.set(mockProject);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockWorldbuildingService.getAllSchemas.mockImplementation(() => {
        throw new Error('Load failed');
      });

      component.loadTemplates();

      expect(component.error()).toBe('Failed to load templates');
      expect(component.isLoading()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should not load templates without a project', () => {
      mockProjectState.project.set(null);

      component.loadTemplates();

      expect(mockWorldbuildingService.getAllSchemas).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should reload templates', () => {
      mockProjectState.project.set(mockProject);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      component.refresh();

      expect(mockWorldbuildingService.getAllSchemas).toHaveBeenCalled();
    });
  });

  const mockCustomTemplate = {
    id: 'custom-1',
    label: 'Custom Template',
    icon: 'edit',
    tabCount: 1,
    fieldCount: 2,
  };

  const mockCustomSchema = {
    id: 'custom-1',
    name: 'Custom Template',
    icon: 'edit',
    description: 'Custom',
    version: 1,
    tabs: [],
  };

  describe('cloneTemplate', () => {
    const charTemplate = {
      id: 'char-1',
      label: 'Character',
      icon: 'person',
      tabCount: 1,
      fieldCount: 2,
    };

    it('should clone a template successfully', async () => {
      mockProjectState.project.set(mockProject);

      mockDialogGateway.openRenameDialog.mockResolvedValue('New Character');
      mockWorldbuildingService.cloneTemplate.mockReturnValue(undefined);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.cloneTemplate(charTemplate);

      expect(mockWorldbuildingService.cloneTemplate).toHaveBeenCalledWith(
        'char-1',
        'New Character',
        'Clone of Character'
      );
    });

    it('should handle cancelled clone dialog', async () => {
      mockProjectState.project.set(mockProject);

      mockDialogGateway.openRenameDialog.mockResolvedValue(null);

      await component.cloneTemplate(charTemplate);

      expect(mockWorldbuildingService.cloneTemplate).not.toHaveBeenCalled();
    });

    it('should handle clone errors', async () => {
      mockProjectState.project.set(mockProject);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockDialogGateway.openRenameDialog.mockResolvedValue('New Character');
      mockWorldbuildingService.cloneTemplate.mockRejectedValue(
        new Error('Clone failed')
      );

      await component.cloneTemplate(charTemplate);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template successfully', async () => {
      mockProjectState.project.set(mockProject);

      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockReturnValue(undefined);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.deleteTemplate(mockCustomTemplate);

      expect(mockWorldbuildingService.deleteTemplate).toHaveBeenCalledWith(
        'custom-1'
      );
      expect(mockProjectState.closeSchemaEditor).toHaveBeenCalledWith(
        'custom-1'
      );
    });

    it('should remove field-managed relationship types before deleting', async () => {
      mockProjectState.project.set(mockProject);
      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockReturnValue(undefined);
      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.deleteTemplate(mockCustomTemplate);

      expect(
        mockRelationshipFieldService.removeTypesForSchema
      ).toHaveBeenCalledWith('custom-1');
    });

    it('should keep relationship data when template deletion fails', async () => {
      mockProjectState.project.set(mockProject);
      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockImplementation(() => {
        throw new Error('No sync provider available');
      });
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await component.deleteTemplate(mockCustomTemplate);

      // Cleanup must run only after a successful deletion.
      expect(
        mockRelationshipFieldService.removeTypesForSchema
      ).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle cancelled delete dialog', async () => {
      mockProjectState.project.set(mockProject);

      mockDialogGateway.openConfirmationDialog.mockResolvedValue(false);

      await component.deleteTemplate(mockCustomTemplate);

      expect(mockWorldbuildingService.deleteTemplate).not.toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      mockProjectState.project.set(mockProject);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      await component.deleteTemplate(mockCustomTemplate);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('editTemplate', () => {
    it('should open the schema editor tab with the loaded schema', () => {
      mockProjectState.project.set(mockProject);

      mockWorldbuildingService.getSchema.mockReturnValue(mockCustomSchema);

      component.editTemplate(mockCustomTemplate);

      expect(mockProjectState.openSchemaEditor).toHaveBeenCalledWith(
        mockCustomSchema
      );
    });

    it('should handle template not found', () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'non-existent',
        label: 'Non Existent',
        icon: 'error',
        tabCount: 0,
        fieldCount: 0,
      };

      mockWorldbuildingService.getSchema.mockReturnValue(null);

      component.editTemplate(template);

      // Should not open an editor tab when template not found
      expect(mockProjectState.openSchemaEditor).not.toHaveBeenCalled();
    });
  });

  describe('createTemplate', () => {
    it('should open the schema editor tab with a blank schema', () => {
      mockProjectState.project.set(mockProject);

      component.createTemplate();

      const schema = mockProjectState.openSchemaEditor.mock.calls[0][0];
      expect(schema).not.toBeNull();
      expect(schema.name).toBe('New Template');
      expect(schema.id).toMatch(/^custom-\d+$/);
    });

    it('should not open the editor without a project', () => {
      mockProjectState.project.set(null);

      component.createTemplate();

      expect(mockProjectState.openSchemaEditor).not.toHaveBeenCalled();
    });
  });

  describe('computed properties', () => {
    it('should compute hasTemplates correctly', () => {
      expect(component.hasTemplates()).toBe(false);

      component['templates'].set([
        {
          id: 'char-1',
          label: 'Character',
          icon: 'person',
          tabCount: 1,
          fieldCount: 2,
        },
      ]);

      expect(component.hasTemplates()).toBe(true);
    });
  });
});
