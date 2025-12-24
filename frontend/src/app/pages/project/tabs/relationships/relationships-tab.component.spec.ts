import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../../../../components/element-ref/element-ref.model';
import { RelationshipsTabComponent } from './relationships-tab.component';

describe('RelationshipsTabComponent', () => {
  let component: RelationshipsTabComponent;
  let fixture: ComponentFixture<RelationshipsTabComponent>;
  let relationshipServiceMock: Partial<RelationshipService>;
  let projectStateMock: Partial<ProjectStateService>;
  let dialogGatewayMock: Partial<DialogGatewayService>;
  let snackBarMock: Partial<MatSnackBar>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
  };

  const mockTypes: RelationshipTypeDefinition[] = [
    {
      id: 'parent',
      name: 'Parent',
      inverseLabel: 'Child of',
      showInverse: true,
      category: RelationshipCategory.Familial,
      icon: 'family_restroom',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['character-v1'], maxCount: null },
      targetEndpoint: { allowedSchemas: ['character-v1'], maxCount: 2 },
    },
    {
      id: 'custom-nemesis',
      name: 'Nemesis of',
      inverseLabel: 'Hunted by',
      showInverse: true,
      category: RelationshipCategory.Custom,
      icon: 'skull',
      isBuiltIn: false,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
  ];

  beforeEach(async () => {
    relationshipServiceMock = {
      getAllTypes: vi.fn().mockReturnValue(mockTypes),
      getTypeById: vi
        .fn()
        .mockImplementation((id: string) => mockTypes.find(t => t.id === id)),
      addCustomType: vi.fn().mockImplementation(type => ({
        ...type,
        id: 'custom-new',
        isBuiltIn: false,
      })),
      updateCustomType: vi.fn().mockReturnValue(true),
      removeCustomType: vi.fn().mockReturnValue(true),
    };

    projectStateMock = {
      project: signal(mockProject as any),
      openSystemTab: vi.fn(),
    };

    dialogGatewayMock = {
      openRenameDialog: vi.fn().mockResolvedValue('New Name'),
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };

    snackBarMock = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RelationshipsTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: MatDialog, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RelationshipsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load relationship types on init', () => {
    component.loadRelationshipTypes();

    expect(relationshipServiceMock.getAllTypes).toHaveBeenCalled();
    expect(component.relationshipTypes().length).toBe(2);
  });

  it('should separate built-in and custom types', () => {
    component.loadRelationshipTypes();

    expect(component.builtInTypes().length).toBe(1);
    expect(component.customTypes().length).toBe(1);
    expect(component.builtInTypes()[0].id).toBe('parent');
    expect(component.customTypes()[0].id).toBe('custom-nemesis');
  });

  it('should create a new custom type', async () => {
    component.loadRelationshipTypes();
    await component.createCustomType();

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalledTimes(2);
    expect(relationshipServiceMock.addCustomType).toHaveBeenCalled();
    expect(snackBarMock.open).toHaveBeenCalled();
  });

  it('should not create type if user cancels name dialog', async () => {
    vi.mocked(dialogGatewayMock.openRenameDialog!).mockResolvedValueOnce(null);

    await component.createCustomType();

    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should edit a custom type', async () => {
    component.loadRelationshipTypes();
    const customType = component.customTypes()[0];
    await component.editType(customType);

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.updateCustomType).toHaveBeenCalledWith(
      'custom-nemesis',
      { name: 'New Name' }
    );
  });

  it('should edit built-in types (now editable)', async () => {
    component.loadRelationshipTypes();
    const builtInType = component.builtInTypes()[0];
    await component.editType(builtInType);

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.updateCustomType).toHaveBeenCalledWith(
      'parent',
      { name: 'New Name' }
    );
  });

  it('should delete a custom type after confirmation', async () => {
    component.loadRelationshipTypes();
    const customType = component.customTypes()[0];
    await component.deleteType(customType);

    expect(dialogGatewayMock.openConfirmationDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.removeCustomType).toHaveBeenCalledWith(
      'custom-nemesis'
    );
  });

  it('should not delete if user cancels confirmation', async () => {
    vi.mocked(dialogGatewayMock.openConfirmationDialog!).mockResolvedValueOnce(
      false
    );

    component.loadRelationshipTypes();
    const customType = component.customTypes()[0];
    await component.deleteType(customType);

    expect(relationshipServiceMock.removeCustomType).not.toHaveBeenCalled();
  });

  it('should delete built-in types (now deletable)', async () => {
    component.loadRelationshipTypes();
    const builtInType = component.builtInTypes()[0];
    await component.deleteType(builtInType);

    expect(dialogGatewayMock.openConfirmationDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.removeCustomType).toHaveBeenCalledWith(
      'parent'
    );
  });

  it('should clone a type as custom', async () => {
    component.loadRelationshipTypes();
    const builtInType = component.builtInTypes()[0];
    await component.cloneType(builtInType);

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name',
        category: RelationshipCategory.Custom,
      })
    );
  });

  it('should format constraints correctly', () => {
    component.loadRelationshipTypes();

    const parentType = component.builtInTypes().find(t => t.id === 'parent');
    expect(parentType?.sourceConstraints).toBe('character-v1');
    expect(parentType?.targetConstraints).toBe('character-v1 · max 2');

    const customType = component
      .customTypes()
      .find(t => t.id === 'custom-nemesis');
    expect(customType?.sourceConstraints).toBe('Any element');
    expect(customType?.targetConstraints).toBe('Any element');
  });

  it('should show loading state', () => {
    component.isLoading.set(true);
    fixture.detectChanges();

    expect(component.isLoading()).toBe(true);
  });

  it('should show error state', () => {
    component.error.set('Test error');
    fixture.detectChanges();

    expect(component.error()).toBe('Test error');
  });

  it('should refresh the list', () => {
    const loadSpy = vi.spyOn(component, 'loadRelationshipTypes');

    component.refresh();

    expect(loadSpy).toHaveBeenCalled();
  });
});
