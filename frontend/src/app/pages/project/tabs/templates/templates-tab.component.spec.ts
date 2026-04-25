import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Project } from '../../../../../api-client';
import { type ElementTypeSchema } from '../../../../models/schema-types';
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
  };
  let mockWorldbuildingService: any;
  let mockSnackBar: any;
  let mockDialogGateway: any;

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
    })) as ElementTypeSchema[];
  };

  beforeEach(async () => {
    mockProjectState = {
      project: signal<Project | null>(null),
      elements: signal([]),
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
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockDialogGateway = {
      openRenameDialog: vi.fn(),
      openConfirmationDialog: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TemplatesTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
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

      expect(component.templates().length).toBe(1);
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

      expect(component.templates().length).toBe(0);
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
    it('should switch to edit mode with the loaded schema', () => {
      mockProjectState.project.set(mockProject);

      mockWorldbuildingService.getSchema.mockReturnValue(mockCustomSchema);

      component.editTemplate(mockCustomTemplate);

      expect(component.editingState().mode).toBe('edit');
      expect(component.editingSchema()).toEqual(mockCustomSchema);
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

      // Should stay in list mode when template not found
      expect(component.editingState().mode).toBe('list');
      expect(mockWorldbuildingService.updateTemplate).not.toHaveBeenCalled();
    });
  });

  describe('createTemplate', () => {
    it('should switch to edit mode with a blank schema', () => {
      mockProjectState.project.set(mockProject);

      component.createTemplate();

      expect(component.editingState().mode).toBe('edit');
      const schema = component.editingSchema();
      expect(schema).not.toBeNull();
      expect(schema!.name).toBe('New Template');
    });

    it('should not switch to edit mode without project', () => {
      mockProjectState.project.set(null);

      component.createTemplate();

      expect(component.editingState().mode).toBe('list');
    });
  });

  describe('onEditorDone', () => {
    it('should return to list mode when cancelled (null result)', async () => {
      mockProjectState.project.set(mockProject);
      mockWorldbuildingService.getSchema.mockReturnValue(mockCustomSchema);
      component.editTemplate(mockCustomTemplate);

      await component.onEditorDone(null);

      expect(component.editingState().mode).toBe('list');
      expect(mockWorldbuildingService.updateTemplate).not.toHaveBeenCalled();
    });

    it('should save an existing template when editor emits a schema', async () => {
      mockProjectState.project.set(mockProject);
      mockWorldbuildingService.getSchema.mockReturnValue(mockCustomSchema);
      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);
      component.editTemplate(mockCustomTemplate);

      const updatedSchema = { ...mockCustomSchema, name: 'Updated Template' };
      await component.onEditorDone(updatedSchema as ElementTypeSchema);

      expect(component.editingState().mode).toBe('list');
      expect(mockWorldbuildingService.updateTemplate).toHaveBeenCalledWith(
        'custom-1',
        updatedSchema
      );
    });

    it('should save a new template when creating', async () => {
      mockProjectState.project.set(mockProject);
      mockWorldbuildingService.saveSchemaToLibrary.mockReturnValue(undefined);
      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      component.createTemplate();

      const newSchema = component.editingSchema()!;
      const savedSchema = { ...newSchema, name: 'My Template' };
      await component.onEditorDone(savedSchema as ElementTypeSchema);

      expect(component.editingState().mode).toBe('list');
      expect(mockWorldbuildingService.saveSchemaToLibrary).toHaveBeenCalledWith(
        savedSchema
      );
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
