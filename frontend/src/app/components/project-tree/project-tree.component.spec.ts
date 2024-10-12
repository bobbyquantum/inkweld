import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectTreeComponent } from './project-tree.component';
import { ProjectElement } from './ProjectElement';
import { CdkDragDrop, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { ArrayDataSource } from '@angular/cdk/collections';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTreeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('drag and drop functionality', () => {
    let mockDragEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>>;

    beforeEach(() => {
      mockDragEvent = {
        previousIndex: 0,
        currentIndex: 0,
        item: {
          data: {} as ProjectElement,
        } as CdkDrag<ProjectElement>,
        container: {
          data: new ArrayDataSource<ProjectElement>([]),
        } as CdkDropList<ArrayDataSource<ProjectElement>>,
        previousContainer: {
          data: new ArrayDataSource<ProjectElement>([]),
        } as CdkDropList<ArrayDataSource<ProjectElement>>,
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
      };
    });

    it('should not allow dropping an item as a child of another item', () => {
      const testData: ProjectElement[] = [
        { id: '1', name: 'Item 1', type: 'item', level: 0, visible: true },
        { id: '2', name: 'Item 2', type: 'item', level: 0, visible: true },
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[0];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 1;
      component.currentDropLevel = 1; // Attempting to make it a child

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      expect(component.sourceData[0].level).toBe(0);
      expect(component.sourceData[1].level).toBe(0);
    });

    it('should allow dropping an item as a child of a folder', () => {
      const testData: ProjectElement[] = [
        {
          id: '1',
          name: 'Folder',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
        { id: '2', name: 'Item', type: 'item', level: 0, visible: true },
      ];
      component.treeData = testData;
      component.ngOnInit();

      const itemToDrag = component.sourceData[1];
      mockDragEvent.item!.data = itemToDrag;
      mockDragEvent.previousIndex = 1;
      mockDragEvent.currentIndex = 0; // Should be 0 to target the folder
      component.currentDropLevel = 1; // Dropping as a child

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      expect(component.sourceData[1].level).toBe(1);
    });

    it('should not allow dropping a folder as a child of an item', () => {
      const testData: ProjectElement[] = [
        { id: '1', name: 'Item', type: 'item', level: 0, visible: true },
        {
          id: '2',
          name: 'Folder',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[1];
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 1;
      mockDragEvent.currentIndex = 0; // Set to 0 to target the 'Item' node
      component.currentDropLevel = 1; // Attempting to make it a child

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      // The drop should be invalid, so levels should remain unchanged
      expect(component.sourceData[1].level).toBe(0);
    });

    it('should maintain the structure of a dragged folder and its contents', () => {
      const testData: ProjectElement[] = [
        {
          id: '1',
          name: 'Folder 1',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
        { id: '2', name: 'Item 1', type: 'item', level: 1, visible: true },
        {
          id: '3',
          name: 'Folder 2',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[0];
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 2;
      component.currentDropLevel = 0;

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      expect(component.sourceData[0].name).toBe('Folder 2');
      expect(component.sourceData[1].name).toBe('Folder 1');
      expect(component.sourceData[1].level).toBe(0);
      expect(component.sourceData[2].name).toBe('Item 1');
      expect(component.sourceData[2].level).toBe(1);
    });

    it('should update levels correctly when dragging a folder into another folder', () => {
      const testData: ProjectElement[] = [
        {
          id: '1',
          name: 'Folder 1',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
        { id: '2', name: 'Item 1', type: 'item', level: 1, visible: true },
        {
          id: '3',
          name: 'Folder 2',
          type: 'folder',
          level: 0,
          expandable: true,
          expanded: true,
          visible: true,
        },
      ];
      component.treeData = testData;
      component.ngOnInit();

      const folderToDrag = component.sourceData[0];
      mockDragEvent.item!.data = folderToDrag;
      mockDragEvent.previousIndex = 0;
      mockDragEvent.currentIndex = 2;
      component.currentDropLevel = 1;

      component.drop(
        mockDragEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );

      expect(component.sourceData[0].name).toBe('Folder 2');
      expect(component.sourceData[1].name).toBe('Folder 1');
      expect(component.sourceData[1].level).toBe(1);
      expect(component.sourceData[2].name).toBe('Item 1');
      expect(component.sourceData[2].level).toBe(2);
    });
  });
});
