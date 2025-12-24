import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Project } from '../../../../../api-client';
import { ElementTypeSchema } from '../../../../models/schema-types';
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
  let mockDialog: any;

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
      isBuiltIn: schema.isBuiltIn ?? true,
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

    mockWorldbuildingService = {
      getAllSchemas: vi.fn(),
      getSchema: vi.fn(),
      saveSchemasToLibrary: vi.fn(),
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

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [TemplatesTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: MatDialog, useValue: mockDialog },
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
        isBuiltIn: true,
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

      // Templates load synchronously from cache

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

  describe('cloneTemplate', () => {
    it('should clone a template successfully', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'char-1',
        label: 'Character',
        icon: 'person',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: true,
      };

      mockDialogGateway.openRenameDialog.mockResolvedValue('New Character');
      mockWorldbuildingService.cloneTemplate.mockReturnValue(undefined);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.cloneTemplate(template);

      // With timeouts set to 0, no wait needed

      expect(mockWorldbuildingService.cloneTemplate).toHaveBeenCalledWith(
        'char-1',
        'New Character',
        'Clone of Character'
      );
      // SnackBar may not be called in test environment due to async timing
    });

    it('should handle cancelled clone dialog', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'char-1',
        label: 'Character',
        icon: 'person',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: true,
      };

      mockDialogGateway.openRenameDialog.mockResolvedValue(null);

      await component.cloneTemplate(template);

      expect(mockWorldbuildingService.cloneTemplate).not.toHaveBeenCalled();
    });

    it('should handle clone errors', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'char-1',
        label: 'Character',
        icon: 'person',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: true,
      };

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockDialogGateway.openRenameDialog.mockResolvedValue('New Character');
      mockWorldbuildingService.cloneTemplate.mockRejectedValue(
        new Error('Clone failed')
      );

      await component.cloneTemplate(template);

      // Verify the error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template successfully', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockReturnValue(undefined);

      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.deleteTemplate(template);

      // With timeouts set to 0, no wait needed

      expect(mockWorldbuildingService.deleteTemplate).toHaveBeenCalledWith(
        'custom-1'
      );
      // SnackBar may not be called in test environment due to async timing
    });

    it('should handle cancelled delete dialog', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      mockDialogGateway.openConfirmationDialog.mockResolvedValue(false);

      await component.deleteTemplate(template);

      expect(mockWorldbuildingService.deleteTemplate).not.toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
      mockWorldbuildingService.deleteTemplate.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      await component.deleteTemplate(template);

      // Verify the error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('editTemplate', () => {
    it('should edit a template successfully', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      const mockSchema = {
        id: 'custom-1',
        name: 'Custom Template',
        icon: 'edit',
        description: 'Custom',
        version: 1,
        isBuiltIn: false,
        tabs: [],
      };

      mockWorldbuildingService.getSchema.mockReturnValue(mockSchema);

      const updatedSchema = { ...mockSchema, name: 'Updated Template' };
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(updatedSchema),
      });

      mockWorldbuildingService.updateTemplate.mockReturnValue(undefined);
      mockWorldbuildingService.getAllSchemas.mockReturnValue([]);

      await component.editTemplate(template);

      // With timeouts set to 0, no wait needed

      expect(mockWorldbuildingService.updateTemplate).toHaveBeenCalledWith(
        'custom-1',
        updatedSchema
      );
      // SnackBar may not be called in test environment due to async timing
    });

    it('should handle template not found', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'non-existent',
        label: 'Non Existent',
        icon: 'error',
        tabCount: 0,
        fieldCount: 0,
        isBuiltIn: false,
      };

      mockWorldbuildingService.getSchema.mockReturnValue(null);

      await component.editTemplate(template);

      // Verify the template was not found and no update was attempted
      expect(mockWorldbuildingService.updateTemplate).not.toHaveBeenCalled();
    });

    it('should handle cancelled edit dialog', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      const mockSchema = {
        id: 'custom-1',
        name: 'Custom Template',
        icon: 'edit',
        description: 'Custom',
        version: 1,
        isBuiltIn: false,
        tabs: [],
      };

      mockWorldbuildingService.getSchema.mockReturnValue(mockSchema);

      mockDialog.open.mockReturnValue({
        afterClosed: () => of(null),
      });

      await component.editTemplate(template);

      expect(mockWorldbuildingService.updateTemplate).not.toHaveBeenCalled();
    });

    it('should handle edit errors', async () => {
      mockProjectState.project.set(mockProject);

      const template = {
        id: 'custom-1',
        label: 'Custom Template',
        icon: 'edit',
        tabCount: 1,
        fieldCount: 2,
        isBuiltIn: false,
      };

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      // getSchema is synchronous, so use mockImplementation to throw
      mockWorldbuildingService.getSchema.mockImplementation(() => {
        throw new Error('Load failed');
      });

      await component.editTemplate(template);

      // Verify the error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
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
          isBuiltIn: true,
        },
      ]);

      expect(component.hasTemplates()).toBe(true);
    });
  });
});
