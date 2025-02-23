import { ArrayDataSource } from '@angular/cdk/collections';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragMove,
  CdkDragSortEvent,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { ProjectAPIService } from '@worm/index';
import { of } from 'rxjs';

import { projectServiceMock } from '../../../testing/project-api.mock';
import { ProjectElement } from '../../models/project-element';
import { ProjectTreeComponent } from './project-tree.component';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;
  let treeService: jest.Mocked<ProjectStateService>;
  let settingsService: jest.Mocked<SettingsService>;
  let elementsSignal: WritableSignal<ProjectElement[]>;
  let loadingSignal: WritableSignal<boolean>;
  let savingSignal: WritableSignal<boolean>;
  let errorSignal: WritableSignal<string | undefined>;
  let mockDialogRef: MatDialogRef<unknown, unknown>;

  const mockDto: ProjectElement = {
    id: '1',
    name: 'Test Element',
    type: 'FOLDER',
    position: 0,
    level: 1,
    expandable: false,
    version: 0,
    metadata: {},
    visible: true,
  };

  const createMockDialogRef = (returnValue: unknown = true) =>
    ({
      afterClosed: jest.fn().mockReturnValue(of(returnValue)),
      close: jest.fn(),
      componentInstance: {},
      _containerInstance: {},
      _ref: {},
      id: 'mock-dialog',
      backdropClick: of(),
      keydownEvents: of(),
      updatePosition: jest.fn(),
      updateSize: jest.fn(),
      addPanelClass: jest.fn(),
      removePanelClass: jest.fn(),
      getState: jest.fn(),
    }) as unknown as MatDialogRef<unknown, unknown>;

  const setupTestBed = async () => {
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/project/testuser/testproject',
      },
      writable: true,
    });

    elementsSignal = signal<ProjectElement[]>([mockDto]);
    loadingSignal = signal(false);
    savingSignal = signal(false);
    errorSignal = signal<string | undefined>(undefined);

    settingsService = {
      getSetting: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<SettingsService>;

    treeService = {
      elements: elementsSignal,
      isLoading: loadingSignal,
      isSaving: savingSignal,
      error: errorSignal,
      project: signal({ title: 'Test Project' }),
      saveProjectElements: jest.fn().mockResolvedValue(undefined),
      openFile: jest.fn(),
      updateProject: jest.fn(),
      showNewElementDialog: jest.fn(),
      toggleExpanded: jest.fn(),
      moveTreeElement: jest.fn().mockResolvedValue(undefined),
      renameTreeElement: jest.fn().mockResolvedValue(undefined),
      deleteTreeElement: jest.fn().mockResolvedValue(undefined),
      getValidDropLevels: jest
        .fn()
        .mockReturnValue({ levels: [1], defaultLevel: 1 }),
      getDropInsertIndex: jest.fn().mockReturnValue(1),
      isValidDrop: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<ProjectStateService>;

    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent, NoopAnimationsModule],
      providers: [
        { provide: SettingsService, useValue: settingsService },
        { provide: ProjectStateService, useValue: treeService },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        provideHttpClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTreeComponent);
    component = fixture.componentInstance;
    mockDialogRef = createMockDialogRef();
    jest.spyOn(component.dialog, 'open').mockReturnValue(mockDialogRef);
  };

  beforeEach(async () => {
    await setupTestBed();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with elements from service', () => {
    expect(component.treeElements()).toHaveLength(1);
    expect(component.treeElements()[0].type).toBe('FOLDER');
    expect(component.treeElements()[0].level).toBe(1);
  });

  describe('State Management', () => {
    it('should handle loading, saving and error states', () => {
      loadingSignal.set(true);
      expect(component.isLoading()).toBe(true);

      savingSignal.set(true);
      expect(component.isSaving()).toBe(true);

      const errorMessage = 'Test error';
      errorSignal.set(errorMessage);
      expect(component.error()).toBe(errorMessage);

      errorSignal.set(undefined);
      expect(component.error()).toBeUndefined();
    });

    it('should update tree when elements change', () => {
      const newElement: ProjectElement = {
        id: '2',
        name: 'New Element',
        type: 'ITEM',
        position: 1,
        level: 1,
        expandable: false,
        version: 0,
        metadata: {},
        visible: true,
      };

      elementsSignal.set([mockDto, newElement]);
      expect(component.treeElements()).toHaveLength(2);
      const lastElement = component.treeElements()[1];
      expect(lastElement.type).toBe('ITEM');
      expect(lastElement.level).toBe(1);
    });
  });

  describe('Tree Manipulation', () => {
    let testNode: ProjectElement;

    beforeEach(() => {
      testNode = mockDto;
    });

    describe('Node Creation', () => {
      it('should create new item and open rename dialog', () => {
        const mockRenameRef = createMockDialogRef('New Name');
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockRenameRef);

        component.onNewItem(testNode);
        expect(treeService.showNewElementDialog).toHaveBeenCalledWith(testNode);
      });

      it('should create new folder and open rename dialog', () => {
        const mockRenameRef = createMockDialogRef('New Folder');
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockRenameRef);

        component.onNewFolder(testNode);
        expect(treeService.showNewElementDialog).toHaveBeenCalledWith(testNode);
      });
    });

    describe('Rename Dialog', () => {
      it('should open rename dialog and update node name', async () => {
        const newName = 'Updated Name';
        const mockRenameRef = createMockDialogRef(newName);
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockRenameRef);

        await component.onRename(testNode);
        expect(component.dialog.open).toHaveBeenCalled();
        expect(treeService.saveProjectElements).toHaveBeenCalled();
        expect(treeService.renameTreeElement).toHaveBeenCalledWith(
          testNode,
          newName
        );
      });

      it('should not update node name if dialog is cancelled', async () => {
        const mockRenameRef = createMockDialogRef(null);
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockRenameRef);

        await component.onRename(testNode);
        expect(component.dialog.open).toHaveBeenCalled();
        expect(treeService.saveProjectElements).not.toHaveBeenCalled();
        expect(treeService.renameTreeElement).not.toHaveBeenCalled();
      });
    });
  });

  describe('Drag and Drop', () => {
    let mockDrag: CdkDrag<ProjectElement>;
    let mockDropList: CdkDropList<ArrayDataSource<ProjectElement>>;
    let node: ProjectElement;

    const createTestDragEvent = (
      invalid = false
    ): CdkDragDrop<ArrayDataSource<ProjectElement>> => ({
      previousIndex: 0,
      currentIndex: 1,
      item: {
        data: invalid
          ? { ...mockDto, id: undefined, position: undefined }
          : mockDto,
      } as CdkDrag<ProjectElement>,
      container: {
        data: new ArrayDataSource([mockDto]),
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ArrayDataSource<ProjectElement>>,
      previousContainer: {
        data: new ArrayDataSource([mockDto]),
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ArrayDataSource<ProjectElement>>,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
      dropPoint: { x: 0, y: 0 },
    });

    describe('Drop Handling', () => {
      it('should handle valid drops without confirmation', fakeAsync(() => {
        settingsService.getSetting.mockReturnValue(false); // confirmElementMoves disabled
        const event = createTestDragEvent();
        void component.drop(event);
        expect(treeService.isValidDrop).toHaveBeenCalled();
        expect(treeService.getDropInsertIndex).toHaveBeenCalled();
        tick();
        expect(treeService.moveTreeElement).toHaveBeenCalled();
        expect(component.dialog.open).not.toHaveBeenCalled();
      }));

      it('should show confirmation dialog when confirmElementMoves is enabled', fakeAsync(() => {
        settingsService.getSetting.mockReturnValue(true); // confirmElementMoves enabled
        const mockConfirmRef = createMockDialogRef(true);
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockConfirmRef);

        const event = createTestDragEvent();
        void component.drop(event);
        expect(treeService.isValidDrop).toHaveBeenCalled();
        expect(component.dialog.open).toHaveBeenCalled();
      }));

      it('should not move element when confirmation is cancelled', fakeAsync(() => {
        settingsService.getSetting.mockReturnValue(true); // confirmElementMoves enabled
        const mockConfirmRef = createMockDialogRef(false);
        jest.spyOn(component.dialog, 'open').mockReturnValue(mockConfirmRef);

        const event = createTestDragEvent();
        void component.drop(event);
        expect(treeService.isValidDrop).toHaveBeenCalled();
        expect(component.dialog.open).toHaveBeenCalled();
        tick();
        expect(treeService.moveTreeElement).not.toHaveBeenCalled();
      }));
    });

    const createTestNode = (
      id: string,
      level: number,
      position: number = 0
    ): ProjectElement => ({
      id,
      name: `Test Node ${id}`,
      type: 'FOLDER',
      level,
      position,
      expandable: false,
      version: 0,
      metadata: {},
      visible: true,
    });

    beforeEach(() => {
      node = mockDto;
      mockDrag = { data: node } as CdkDrag<ProjectElement>;
      mockDropList = {
        data: new ArrayDataSource<ProjectElement>([node]),
        getSortedItems: () => [mockDrag],
      } as CdkDropList<ArrayDataSource<ProjectElement>>;
    });

    it('should handle drag start', () => {
      component.dragStarted(node);
      expect(component.draggedNode).toBe(node);
      expect(component.currentDropLevel).toBe(node.level);
      expect(component.validLevelsArray).toEqual([node.level]);
    });

    it('should handle sorted event', () => {
      const mockSortEvent = {
        currentIndex: 1,
        container: mockDropList,
      } as CdkDragSortEvent<ArrayDataSource<ProjectElement>>;

      const [nodeAbove, nodeBelow] = [
        createTestNode('2', 1, 0),
        createTestNode('3', 2, 1),
      ];

      // Mock the service to return valid levels based on the nodes
      treeService.getValidDropLevels.mockReturnValue({
        levels: [nodeAbove.level, nodeBelow.level],
        defaultLevel: nodeAbove.level,
      });

      component.sorted(mockSortEvent);
      expect(component.validLevelsArray).toEqual([
        nodeAbove.level,
        nodeBelow.level,
      ]);
    });
  });

  it('should extract project info from URL', async () => {
    const node = mockDto;
    await component.onDelete(node);
    expect(treeService.saveProjectElements).toHaveBeenCalledWith(
      expect.any(String),
      'testproject',
      expect.any(Array)
    );
  });

  it('should handle drag move with invalid container dimensions', () => {
    const mockMoveEvent = {
      pointerPosition: { x: 100, y: 0 },
    } as CdkDragMove<ArrayDataSource<ProjectElement>>;

    jest
      .spyOn(component.treeContainer.nativeElement, 'getBoundingClientRect')
      .mockReturnValue({ left: NaN, width: NaN } as DOMRect);

    component.dragMove(mockMoveEvent);
    expect(component.currentDropLevel).toBe(0);
  });

  it('should handle empty tree state', () => {
    elementsSignal.set([]);
    fixture.detectChanges();
    expect(component.treeElements()).toHaveLength(0);
  });

  it('should handle undefined error state', () => {
    errorSignal.set(undefined);
    fixture.detectChanges();
    expect(component.error()).toBeUndefined();
  });

  describe('Context Menu', () => {
    let regularNode: ProjectElement;
    let fileNode: ProjectElement;

    const createFileNode = (): ProjectElement => ({
      id: '2',
      name: 'Test File',
      type: 'ITEM',
      position: 0,
      level: 1,
      expandable: false,
      version: 0,
      metadata: {},
      visible: true,
    });

    beforeEach(() => {
      regularNode = { ...mockDto };
      fileNode = createFileNode();
      elementsSignal.update(elements => [...elements, fileNode]);
      fixture.detectChanges();
    });

    describe('Basic Menu Operations', () => {
      it('should open and close context menu', () => {
        component.onContextMenuOpen(regularNode);
        expect(component.contextItem).toBe(regularNode);

        component.onContextMenuClose();
        expect(component.contextItem).toBeNull();
      });

      it('should open file through context menu', () => {
        const node = fileNode;
        expect(node.type).toBe('ITEM');

        component.onOpenFile(node);
        expect(treeService.openFile).toHaveBeenCalledWith({
          ...node,
          expandable: false,
          expanded: undefined,
          level: node.level,
          visible: undefined,
        });
      });
    });
  });
});
