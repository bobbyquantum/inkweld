import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '../../../../components/element-ref/element-ref.model';
import {
  type EditRelationshipTypeDialogData,
  type EditRelationshipTypeDialogResult,
} from '../../../../dialogs/edit-relationship-type-dialog/edit-relationship-type-dialog.component';
import { DocumentSyncState } from '../../../../models/document-sync-state';
import { type ElementTypeSchema } from '../../../../models/schema-types';
import { RelationshipsTabComponent } from './relationships-tab.component';

describe('RelationshipsTabComponent', () => {
  let component: RelationshipsTabComponent;
  let fixture: ComponentFixture<RelationshipsTabComponent>;
  let relationshipServiceMock: Partial<RelationshipService>;
  let projectStateMock: Partial<ProjectStateService>;
  let dialogGatewayMock: Partial<DialogGatewayService>;
  let snackBarMock: Partial<MatSnackBar>;
  let dialogMock: Partial<MatDialog>;
  let worldbuildingServiceMock: Partial<WorldbuildingService>;
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
      isBuiltIn: true,
      icon: 'family_restroom',
      sourceEndpoint: { allowedSchemas: ['character-v1'], maxCount: null },
      targetEndpoint: { allowedSchemas: ['character-v1'], maxCount: 2 },
    },
    {
      id: 'custom-nemesis',
      name: 'Nemesis of',
      inverseLabel: 'Hunted by',
      showInverse: true,
      category: RelationshipCategory.Custom,
      isBuiltIn: false,
      icon: 'bolt',
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
  ];

  /** A valid dialog result that passes form validation */
  const validDialogResult: EditRelationshipTypeDialogResult = {
    name: 'New Name',
    inverseLabel: 'New Inverse',
    showInverse: true,
    category: RelationshipCategory.Social,
    icon: 'people',
    color: '#4682B4',
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
  };

  /** Helper: make the MatDialog mock return a given result. */
  function mockDialogResult(result: EditRelationshipTypeDialogResult): void {
    vi.mocked(dialogMock.open!).mockReturnValue({
      afterClosed: () => of(result),
    } as unknown as MatDialogRef<unknown>);
  }

  /** Helper: make the MatDialog mock return null (cancel). */
  function mockDialogCancelled(): void {
    vi.mocked(dialogMock.open!).mockReturnValue({
      afterClosed: () => of(null),
    } as unknown as MatDialogRef<unknown>);
  }

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
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };

    worldbuildingServiceMock = {
      getSchemas: vi.fn().mockReturnValue([]),
    };

    snackBarMock = {
      open: vi.fn(),
    };

    dialogMock = {
      open: vi.fn(),
    };

    // Default: dialog returns a valid result
    mockDialogResult(validDialogResult);

    await TestBed.configureTestingModule({
      imports: [RelationshipsTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: WorldbuildingService, useValue: worldbuildingServiceMock },
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
    // Family comes before Other alphabetically
    expect(types[0].id).toBe('parent');
    expect(types[1].id).toBe('custom-nemesis');
  });

  // ── createType ─────────────────────────────────────────────────────────────

  it('should open the editor dialog when creating a type', async () => {
    await component.createType();

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should call addCustomType with dialog result on create', async () => {
    await component.createType();

    expect(relationshipServiceMock.addCustomType).toHaveBeenCalledWith(
      validDialogResult
    );
    expect(snackBarMock.open).toHaveBeenCalled();
  });

  it('should not create type if dialog is cancelled', async () => {
    mockDialogCancelled();

    await component.createType();

    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should not open dialog when there is no active project', async () => {
    (projectStateMock.project as ReturnType<typeof signal>).set(undefined);

    await component.createType();

    expect(dialogMock.open).not.toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should show error if create type throws', async () => {
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

  // ── editType ───────────────────────────────────────────────────────────────

  it('should open the editor dialog pre-filled when editing a type', async () => {
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];
    await component.editType(type);

    expect(dialogMock.open).toHaveBeenCalled();
    const callArg = vi.mocked(dialogMock.open!).mock.calls[0][1]
      ?.data as EditRelationshipTypeDialogData;
    expect(callArg?.type?.id).toBe(type.id);
    expect(callArg?.isNew).toBe(false);
  });

  it('should call updateCustomType with dialog result on edit', async () => {
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];
    await component.editType(type);

    expect(relationshipServiceMock.updateCustomType).toHaveBeenCalledWith(
      type.id,
      validDialogResult
    );
    expect(snackBarMock.open).toHaveBeenCalledWith(
      '✓ Updated relationship type',
      'Close',
      { duration: 3000 }
    );
  });

  it('should not edit type if dialog is cancelled', async () => {
    mockDialogCancelled();
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.editType(type);

    expect(relationshipServiceMock.updateCustomType).not.toHaveBeenCalled();
  });

  it('should return early from editType if type is not found in service', async () => {
    vi.mocked(relationshipServiceMock.getTypeById!).mockReturnValue(undefined);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.editType(type);

    expect(dialogMock.open).not.toHaveBeenCalled();
    expect(relationshipServiceMock.updateCustomType).not.toHaveBeenCalled();
  });

  it('should show failure snackbar when updateCustomType returns false', async () => {
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

  it('should show error snackbar when editType throws', async () => {
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

  // ── deleteType ─────────────────────────────────────────────────────────────

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

  // ── cloneType ──────────────────────────────────────────────────────────────

  it('should open the editor in create mode with cloned data when duplicating', async () => {
    component.loadRelationshipTypes();
    const familialType = component
      .relationshipTypes()
      .find(t => t.id === 'parent')!;
    await component.cloneType(familialType);

    expect(dialogMock.open).toHaveBeenCalled();
    const callArg = vi.mocked(dialogMock.open!).mock.calls[0][1]
      ?.data as EditRelationshipTypeDialogData;
    expect(callArg?.isNew).toBe(true);
    expect(callArg?.type?.name).toBe('Parent (Copy)');
  });

  it('should call addCustomType with dialog result on clone', async () => {
    component.loadRelationshipTypes();
    const type = component.relationshipTypes().find(t => t.id === 'parent')!;
    await component.cloneType(type);

    expect(relationshipServiceMock.addCustomType).toHaveBeenCalledWith(
      validDialogResult
    );
    expect(snackBarMock.open).toHaveBeenCalledWith(
      expect.stringContaining('Duplicated relationship type'),
      'Close',
      { duration: 3000 }
    );
  });

  it('should not duplicate when there is no active project', async () => {
    (projectStateMock.project as ReturnType<typeof signal>).set(undefined);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.cloneType(type);

    expect(dialogMock.open).not.toHaveBeenCalled();
    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should not duplicate if dialog is cancelled', async () => {
    mockDialogCancelled();
    component.loadRelationshipTypes();
    const type = component.relationshipTypes()[0];

    await component.cloneType(type);

    expect(relationshipServiceMock.addCustomType).not.toHaveBeenCalled();
  });

  it('should show error snackbar when clone original type not found', async () => {
    vi.mocked(relationshipServiceMock.getTypeById!).mockReturnValue(undefined);
    component.loadRelationshipTypes();
    const type = component.relationshipTypes().find(t => t.id === 'parent')!;

    await component.cloneType(type);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to duplicate relationship type',
      'Close',
      { duration: 5000 }
    );
  });

  // ── View model ─────────────────────────────────────────────────────────────

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

  it('should display "Other" as category label for Custom category', () => {
    component.loadRelationshipTypes();

    const customType = component
      .relationshipTypes()
      .find(t => t.id === 'custom-nemesis');
    expect(customType?.categoryLabel).toBe('Other');
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

  it('should pass available schemas from worldbuilding service to the dialog', async () => {
    const mockSchemas: ElementTypeSchema[] = [
      {
        id: 'character-v1',
        name: 'Character',
        icon: 'person',
        description: '',
        version: 1,
        tabs: [],
      },
    ];
    vi.mocked(worldbuildingServiceMock.getSchemas!).mockReturnValue(
      mockSchemas
    );

    await component.createType();

    const callArg = vi.mocked(dialogMock.open!).mock.calls[0][1]
      ?.data as EditRelationshipTypeDialogData;
    expect(callArg?.availableSchemas).toEqual(mockSchemas);
  });
});
