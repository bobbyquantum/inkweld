import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '../../../../components/element-ref/element-ref.model';
import { DocumentSyncState } from '../../../../models/document-sync-state';
import { RelationshipsTabComponent } from './relationships-tab.component';

describe('RelationshipsTabComponent', () => {
  let component: RelationshipsTabComponent;
  let fixture: ComponentFixture<RelationshipsTabComponent>;
  let relationshipServiceMock: Partial<RelationshipService>;
  let projectStateMock: Partial<ProjectStateService>;
  let dialogGatewayMock: Partial<DialogGatewayService>;
  let snackBarMock: Partial<MatSnackBar>;
  let allTypesSignal: ReturnType<typeof signal<RelationshipTypeDefinition[]>>;
  let syncStateSignal: ReturnType<typeof signal<DocumentSyncState>>;

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
    allTypesSignal = signal(mockTypes);
    syncStateSignal = signal(DocumentSyncState.Synced);

    relationshipServiceMock = {
      allTypes: allTypesSignal,
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
      isLoading: signal(false),
      getSyncState: syncStateSignal,
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

    expect(component.relationshipTypes().length).toBe(2);
  });

  it('should sort types by category then name', () => {
    component.loadRelationshipTypes();

    const types = component.relationshipTypes();
    // Custom category comes before Family alphabetically
    expect(types[0].id).toBe('custom-nemesis');
    expect(types[1].id).toBe('parent');
  });

  it('should create a new type', async () => {
    component.loadRelationshipTypes();
    await component.createType();

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalledTimes(2);
    expect(relationshipServiceMock.addCustomType).toHaveBeenCalled();
    expect(snackBarMock.open).toHaveBeenCalled();
  });

  it('should not create type if user cancels name dialog', async () => {
    vi.mocked(dialogGatewayMock.openRenameDialog!).mockResolvedValueOnce(null);

    await component.createType();

    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should not create type when there is no active project', async () => {
    (projectStateMock.project as ReturnType<typeof signal>).set(undefined);

    await component.createType();

    expect(dialogGatewayMock.openRenameDialog).not.toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should not create type if user cancels inverse label dialog', async () => {
    vi.mocked(dialogGatewayMock.openRenameDialog!)
      .mockResolvedValueOnce('Forward Name')
      .mockResolvedValueOnce(null);

    await component.createType();

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalledTimes(2);
    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should show error if create type fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(relationshipServiceMock.addCustomType!).mockImplementation(() => {
      throw new Error('boom');
    });

    await component.createType();

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to create relationship type',
      'Close',
      { duration: 5000 }
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should edit a type', async () => {
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];
    await component.editType(type);

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.updateCustomType).toHaveBeenCalledWith(
      type.id,
      { name: 'New Name' }
    );
  });

  it('should not edit a type when user cancels rename', async () => {
    vi.mocked(dialogGatewayMock.openRenameDialog!).mockResolvedValueOnce(null);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.editType(type);

    expect(relationshipServiceMock.updateCustomType).not.toHaveBeenCalled();
  });

  it('should show failure snackbar when edit returns false', async () => {
    vi.mocked(relationshipServiceMock.updateCustomType!).mockReturnValueOnce(
      false
    );
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.editType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to update relationship type',
      'Close',
      { duration: 5000 }
    );
  });

  it('should show error snackbar when edit throws', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(relationshipServiceMock.updateCustomType!).mockImplementation(
      () => {
        throw new Error('boom');
      }
    );
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.editType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to update relationship type',
      'Close',
      { duration: 5000 }
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should delete a type after confirmation', async () => {
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];
    await component.deleteType(type);

    expect(dialogGatewayMock.openConfirmationDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.removeCustomType).toHaveBeenCalledWith(
      type.id
    );
  });

  it('should not delete if user cancels confirmation', async () => {
    vi.mocked(dialogGatewayMock.openConfirmationDialog!).mockResolvedValueOnce(
      false
    );

    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];
    await component.deleteType(type);

    expect(relationshipServiceMock.removeCustomType).not.toHaveBeenCalled();
  });

  it('should show failure snackbar when delete returns false', async () => {
    vi.mocked(relationshipServiceMock.removeCustomType!).mockReturnValueOnce(
      false
    );
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.deleteType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to delete relationship type',
      'Close',
      { duration: 5000 }
    );
  });

  it('should show error snackbar when delete throws', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(relationshipServiceMock.removeCustomType!).mockImplementation(
      () => {
        throw new Error('boom');
      }
    );
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.deleteType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to delete relationship type',
      'Close',
      { duration: 5000 }
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should duplicate a type preserving its category', async () => {
    component.loadRelationshipTypes();
    const familialType = component
      .relationshipTypes()
      .find(t => t.id === 'parent')!;
    await component.cloneType(familialType);

    expect(dialogGatewayMock.openRenameDialog).toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name',
        category: RelationshipCategory.Familial,
      })
    );
  });

  it('should not duplicate when there is no active project', async () => {
    (projectStateMock.project as ReturnType<typeof signal>).set(undefined);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.cloneType(type);

    expect(dialogGatewayMock.openRenameDialog).not.toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should not duplicate if user cancels rename dialog', async () => {
    vi.mocked(dialogGatewayMock.openRenameDialog!).mockResolvedValueOnce(null);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.cloneType(type);

    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should format constraints correctly', () => {
    component.loadRelationshipTypes();

    const parentType = component
      .relationshipTypes()
      .find(t => t.id === 'parent');
    expect(parentType?.sourceConstraints).toBe('character-v1');
    expect(parentType?.targetConstraints).toBe('character-v1 · max 2');

    const customType = component
      .relationshipTypes()
      .find(t => t.id === 'custom-nemesis');
    expect(customType?.sourceConstraints).toBe('Any element');
    expect(customType?.targetConstraints).toBe('Any element');
  });

  it('should show loading state', () => {
    (projectStateMock.isLoading as any).set(true);
    fixture.detectChanges();

    expect(component.isLoading()).toBe(true);
  });

  it('should show loading state while syncing with no relationship types', () => {
    allTypesSignal.set([]);
    syncStateSignal.set(DocumentSyncState.Syncing);
    fixture.detectChanges();

    expect(component.isLoading()).toBe(true);
  });

  it('should filter types by search query across name, inverse and category', () => {
    component.loadRelationshipTypes();

    component.searchQuery.set('nemesis');
    expect(component.filteredTypes().map(t => t.id)).toEqual([
      'custom-nemesis',
    ]);

    component.searchQuery.set('child of');
    expect(component.filteredTypes().map(t => t.id)).toEqual(['parent']);

    component.searchQuery.set('family');
    expect(component.filteredTypes().map(t => t.id)).toEqual(['parent']);
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

  it('should show an error when duplicating a type whose source is missing', async () => {
    vi.mocked(relationshipServiceMock.getTypeById!).mockReturnValue(undefined);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    component.loadRelationshipTypes();
    const type = component.relationshipTypes().find(t => t.id === 'parent')!;

    await component.cloneType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to duplicate relationship type',
      'Close',
      { duration: 5000 }
    );
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
