import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ElementType, Project } from '@inkweld/index';
import { MockedObject, vi } from 'vitest';

import { ElementTypeSchema } from '../../models/schema-types';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { NewElementDialogComponent } from './new-element-dialog.component';

describe('NewElementDialogComponent', () => {
  let component: NewElementDialogComponent;
  let fixture: ComponentFixture<NewElementDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<NewElementDialogComponent>>;
  let mockProjectState: {
    project: ReturnType<typeof signal<Project | undefined>>;
  };
  let mockWorldbuildingService: {
    getAllSchemas: ReturnType<typeof vi.fn>;
    hasNoSchemas: ReturnType<typeof vi.fn>;
    loadDefaults: ReturnType<typeof vi.fn>;
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
      type: schema.type || 'UNKNOWN',
      name: schema.name || 'Unknown',
      icon: schema.icon || 'help',
      description: schema.description || '',
      version: schema.version || 1,
      isBuiltIn: schema.isBuiltIn ?? true,
      tabs: schema.tabs || [],
      ...schema,
    })) as ElementTypeSchema[];
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<NewElementDialogComponent>>;

    mockProjectState = {
      project: signal<Project | undefined>(undefined),
    };

    mockWorldbuildingService = {
      getAllSchemas: vi.fn(),
      hasNoSchemas: vi.fn(),
      loadDefaults: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        NewElementDialogComponent,
        ReactiveFormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewElementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with default values', () => {
    expect(component.form.get('name')?.value).toBe('');
    expect(component.form.get('type')?.value).toBe(ElementType.Item);
  });

  it('should validate required fields', () => {
    expect(component.form.valid).toBeFalsy();

    component.form.patchValue({
      name: 'Test Element',
      type: ElementType.Item,
    });

    expect(component.form.valid).toBeTruthy();
  });

  it('should close dialog on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should close dialog with form value on create when valid', () => {
    const formValue = {
      name: 'Test Element',
      type: ElementType.Item,
    };

    component.form.patchValue(formValue);
    component.onCreate();

    expect(dialogRef.close).toHaveBeenCalledWith(formValue);
  });

  it('should not close dialog on create when invalid', () => {
    component.onCreate();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  describe('step navigation', () => {
    it('should start at step 1', () => {
      expect(component.currentStep()).toBe(1);
    });

    it('should not advance to step 2 without selecting a type', () => {
      component.nextStep();
      expect(component.currentStep()).toBe(1);
    });

    it('should advance to step 2 after selecting a type', () => {
      component.selectType(ElementType.Item);
      expect(component.currentStep()).toBe(2);
    });

    it('should go back to step 1 from step 2', () => {
      component.selectType(ElementType.Item);
      expect(component.currentStep()).toBe(2);

      component.previousStep();
      expect(component.currentStep()).toBe(1);
    });

    it('should not go back from step 1', () => {
      component.previousStep();
      expect(component.currentStep()).toBe(1);
    });

    it('should set form type when selecting a type', () => {
      component.selectType(ElementType.Folder);
      expect(component.form.controls.type.value).toBe(ElementType.Folder);
      expect(component.selectedType()).toBe(ElementType.Folder);
    });
  });

  describe('type filtering', () => {
    it('should return all options when search is empty', () => {
      component.searchQuery.set('');
      expect(component.filteredOptions().length).toBeGreaterThan(0);
      expect(component.filteredOptions()).toEqual(
        component.elementTypeOptions()
      );
    });

    it('should filter options by label', () => {
      component.searchQuery.set('folder');
      const filtered = component.filteredOptions();
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe(ElementType.Folder);
    });

    it('should filter options by description', () => {
      component.searchQuery.set('narrative');
      const filtered = component.filteredOptions();
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe(ElementType.Item);
    });

    it('should be case insensitive', () => {
      component.searchQuery.set('FOLDER');
      const filtered = component.filteredOptions();
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe(ElementType.Folder);
    });

    it('should return empty when no match', () => {
      component.searchQuery.set('nonexistent');
      expect(component.filteredOptions().length).toBe(0);
    });
  });

  describe('category grouping', () => {
    it('should separate document options', () => {
      const docOptions = component.documentOptions();
      expect(docOptions.length).toBe(2); // Folder and Document
      expect(docOptions.every(o => o.category === 'document')).toBe(true);
    });

    it('should start with no worldbuilding options', () => {
      const wbOptions = component.worldbuildingOptions();
      expect(wbOptions.length).toBe(0);
    });
  });

  describe('getSelectedOption', () => {
    it('should return undefined when no type selected', () => {
      expect(component.getSelectedOption()).toBeUndefined();
    });

    it('should return the selected option details', () => {
      component.selectType(ElementType.Folder);
      const selected = component.getSelectedOption();
      expect(selected).toBeDefined();
      expect(selected?.type).toBe(ElementType.Folder);
      expect(selected?.label).toBe('Folder');
      expect(selected?.icon).toBe('folder');
    });
  });

  describe('worldbuilding type loading', () => {
    it('should load worldbuilding types when project is set', async () => {
      const mockSchemas = createMockSchemas([
        {
          type: 'CHARACTER',
          name: 'Character',
          icon: 'person',
          description: 'A character template',
        },
        {
          type: 'LOCATION',
          name: 'Location',
          icon: 'place',
          description: 'A location template',
        },
      ]);

      mockWorldbuildingService.hasNoSchemas.mockResolvedValue(false);
      mockWorldbuildingService.getAllSchemas.mockResolvedValue(mockSchemas);

      mockProjectState.project.set(mockProject);
      fixture.detectChanges();

      // Wait for async loading
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockWorldbuildingService.getAllSchemas).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );

      const wbOptions = component.worldbuildingOptions();
      expect(wbOptions.length).toBe(2);
      expect(wbOptions[0].type).toBe('CHARACTER');
      expect(wbOptions[1].type).toBe('LOCATION');
    });

    it('should auto-load default templates if library is empty', async () => {
      const loadedSchemas = createMockSchemas([
        {
          type: 'CHARACTER',
          name: 'Character',
          icon: 'person',
          description: 'Default character',
        },
      ]);

      mockWorldbuildingService.hasNoSchemas.mockResolvedValue(true);
      mockWorldbuildingService.loadDefaults.mockResolvedValue(undefined);
      mockWorldbuildingService.getAllSchemas.mockResolvedValue(loadedSchemas);

      mockProjectState.project.set(mockProject);
      fixture.detectChanges();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockWorldbuildingService.loadDefaults).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );

      const wbOptions = component.worldbuildingOptions();
      expect(wbOptions.length).toBe(1);
    });

    it('should handle errors when loading schemas', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockWorldbuildingService.hasNoSchemas.mockRejectedValue(
        new Error('Load failed')
      );

      mockProjectState.project.set(mockProject);
      fixture.detectChanges();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleErrorSpy).toHaveBeenCalled();
      // Should still have default document types
      expect(component.documentOptions().length).toBe(2);

      consoleErrorSpy.mockRestore();
    });

    it('should filter worldbuilding options by search', async () => {
      const mockSchemas = createMockSchemas([
        {
          type: 'CHARACTER',
          name: 'Character',
          icon: 'person',
          description: 'A character template',
        },
        {
          type: 'LOCATION',
          name: 'Location',
          icon: 'place',
          description: 'A location template',
        },
      ]);

      mockWorldbuildingService.hasNoSchemas.mockResolvedValue(false);
      mockWorldbuildingService.getAllSchemas.mockResolvedValue(mockSchemas);

      mockProjectState.project.set(mockProject);
      fixture.detectChanges();

      await new Promise(resolve => setTimeout(resolve, 50));

      component.searchQuery.set('character');
      const filtered = component.filteredOptions();
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('CHARACTER');
    });
  });
});
