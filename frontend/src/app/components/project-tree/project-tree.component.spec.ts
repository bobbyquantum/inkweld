import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectTreeComponent } from './project-tree.component';
import { ProjectElement } from './ProjectElement';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDragSortEvent,
} from '@angular/cdk/drag-drop';
import { ArrayDataSource } from '@angular/cdk/collections';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;
  let mockDragEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>>;

  function createProjectElement(
    id: string,
    name: string,
    type: 'item' | 'folder',
    level: number,
    expandable = false,
    expanded = true,
    visible = true
  ): ProjectElement {
    return {
      id,
      name,
      type,
      level,
      expandable,
      expanded,
      visible,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTreeComponent);
    component = fixture.componentInstance;

    mockDragEvent = {
      previousIndex: 0,
      currentIndex: 0,
      item: {
        data: {} as ProjectElement,
      } as CdkDrag<ProjectElement>,
      container: {
        data: new ArrayDataSource<ProjectElement>([]),
        getSortedItems: () => {
          // Return the sorted items as per the test scenario
          return [];
        },
      } as unknown as CdkDropList<ArrayDataSource<ProjectElement>>,
      previousContainer: {
        data: new ArrayDataSource<ProjectElement>([]),
      } as CdkDropList<ArrayDataSource<ProjectElement>>,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
    };
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('drag and drop functionality', () => {
    it('should not allow dropping an item as a child of another item', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Item 1', 'item', 0),
        createProjectElement('2', 'Item 2', 'item', 0),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[0];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 1;
      component.currentDropLevel = 1; // Attempting to make it a child of Item 2

      // Update getSortedItems to return the sorted list after dragging
      if (mockDragEvent.container) {
        mockDragEvent.container.getSortedItems = () =>
          [
            { data: component.sourceData[1] }, // Item 2
          ] as CdkDrag<ProjectElement>[];
      }

      // Should throw error when attempting to drop as child of an item
      expect(() =>
        component.drop(
          mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
        )
      ).toThrow(Error('Cannot drop as child of an item'));

      // Verify the structure remains unchanged
      expect(component.sourceData[0].id).toBe('1');
      expect(component.sourceData[0].level).toBe(0);
      expect(component.sourceData[1].id).toBe('2');
      expect(component.sourceData[1].level).toBe(0);
    });

    it('should allow dropping an item as a child of a folder', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder', 'folder', 0, true),
        createProjectElement('2', 'Item', 'item', 0),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[1];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 1;
      mockDragEvent.currentIndex = 1; // Dropping after the folder
      component.currentDropLevel = 1; // Dropping as a child of the folder

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // The item should now be a child of the folder
      expect(component.sourceData[1].id).toBe('2');
      expect(component.sourceData[1].level).toBe(1);
    });

    it('should not allow dropping a folder as a child of an item', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Item', 'item', 0),
        createProjectElement('2', 'Folder', 'folder', 0, true),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[1];
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 1;
      mockDragEvent.currentIndex = 1; // Attempting to drop after the item
      component.currentDropLevel = 1; // Attempting to make it a child of the item

      // Should throw error when attempting to drop as child of an item
      expect(() =>
        component.drop(
          mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
        )
      ).toThrow('Cannot drop as child of an item');

      // The folder should remain at level 0 since dropping into an item is invalid
      expect(component.sourceData[0].id).toBe('1');
      expect(component.sourceData[0].level).toBe(0);
      expect(component.sourceData[1].id).toBe('2');
      expect(component.sourceData[1].level).toBe(0);
    });

    it('should maintain the structure of a dragged folder and its contents', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder 1', 'folder', 0, true),
        createProjectElement('2', 'Item 1', 'item', 1),
        createProjectElement('3', 'Folder 2', 'folder', 0, true),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[0];
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 2; // Dropping after 'Folder 2'
      component.currentDropLevel = 0; // Keeping it at the root level

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // After the drop, Folder 1 and its contents should be moved after Folder 2
      expect(component.sourceData[0].id).toBe('3'); // Folder 2
      expect(component.sourceData[0].level).toBe(0);

      expect(component.sourceData[1].id).toBe('1'); // Folder 1
      expect(component.sourceData[1].level).toBe(0);

      expect(component.sourceData[2].id).toBe('2'); // Item 1
      expect(component.sourceData[2].level).toBe(1);
    });

    it('should update levels correctly when dragging a folder into another folder', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder 1', 'folder', 0, true),
        createProjectElement('2', 'Item 1', 'item', 1),
        createProjectElement('3', 'Folder 2', 'folder', 0, true),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[0]; // 'Folder 1'
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 2; // Dropping after 'Folder 2'
      component.currentDropLevel = 1; // Making 'Folder 1' a child of 'Folder 2'

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // After the drop, 'Folder 1' should be a child of 'Folder 2', and levels updated accordingly
      expect(component.sourceData[0].id).toBe('3'); // 'Folder 2'
      expect(component.sourceData[0].level).toBe(0);

      expect(component.sourceData[1].id).toBe('1'); // 'Folder 1' now at level 1
      expect(component.sourceData[1].level).toBe(1);

      expect(component.sourceData[2].id).toBe('2'); // 'Item 1' now at level 2
      expect(component.sourceData[2].level).toBe(2);
    });

    it('should allow dropping an item at the root level', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder', 'folder', 0, true),
        createProjectElement('2', 'Item', 'item', 1),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[1];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 1;
      mockDragEvent.currentIndex = 1; // Moving to the end
      component.currentDropLevel = 0; // Dropping at root level

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // The item should now be at the root level
      expect(component.sourceData[1].id).toBe('2');
      expect(component.sourceData[1].level).toBe(0);
    });

    it('should prevent dropping an item below the root level (negative level)', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Item', 'item', 0),
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[0];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 0;
      component.currentDropLevel = -1; // Invalid level

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // The item's level should remain at 0
      expect(component.sourceData[0].level).toBe(0);
    });
  });

  describe('valid drop levels calculation', () => {
    it('should calculate valid drop levels when dragging between items of same level', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Item 1', 'item', 0),
        createProjectElement('2', 'Item 2', 'item', 0),
      ];
      component.treeData = testData;
      component.ngOnInit();

      component.draggedNode = component.sourceData[0];

      // Simulate sorting
      const mockSortEvent: Partial<
        CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      > = {
        previousIndex: 0,
        currentIndex: 1,
        container: {
          getSortedItems: () => [
            { data: component.sourceData[1] }, // Item 2
            { data: component.sourceData[0] }, // Item 1 (dragged node)
          ],
        } as CdkDropList<ArrayDataSource<ProjectElement>>,
      };

      component.sorted(
        mockSortEvent as CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      );

      // Since both items are at level 0, valid levels should be [0]
      expect(component.validLevelsArray).toEqual([0]);
    });

    it('should calculate valid drop levels when dragging item into a folder', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder', 'folder', 0, true),
        createProjectElement('2', 'Item', 'item', 0),
      ];
      component.treeData = testData;
      component.ngOnInit();

      component.draggedNode = component.sourceData[1];

      // Simulate sorting
      const mockSortEvent: Partial<
        CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      > = {
        previousIndex: 1,
        currentIndex: 1,
        container: {
          getSortedItems: () => [
            { data: component.sourceData[0] }, // Folder
            { data: component.sourceData[1] }, // Item (dragged node)
          ],
        } as CdkDropList<ArrayDataSource<ProjectElement>>,
      };

      component.sorted(
        mockSortEvent as CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      );

      // Valid levels should be [0, 1] (same level or inside the folder)
      expect(component.validLevelsArray).toEqual([0, 1]);
    });

    it('should calculate valid drop levels when dragging between different levels', () => {
      const testData: ProjectElement[] = [
        createProjectElement('1', 'Folder 1', 'folder', 0, true),
        createProjectElement('2', 'Item 1', 'item', 1),
        createProjectElement('3', 'Folder 2', 'folder', 0, true),
      ];
      component.treeData = testData;
      component.ngOnInit();

      component.draggedNode = component.sourceData[1]; // 'Item 1'

      // Simulate sorting
      const mockSortEvent: Partial<
        CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      > = {
        previousIndex: 1,
        currentIndex: 2,
        container: {
          getSortedItems: () => [
            { data: component.sourceData[0] }, // Folder 1
            { data: component.sourceData[2] }, // Folder 2
            { data: component.sourceData[1] }, // Item 1 (dragged node)
          ],
        } as CdkDropList<ArrayDataSource<ProjectElement>>,
      };

      component.sorted(
        mockSortEvent as CdkDragSortEvent<ArrayDataSource<ProjectElement>>
      );

      // Valid levels should be [0, 1] (root level or inside Folder 2)
      expect(component.validLevelsArray).toEqual([0, 1]);
    });
  });
});
