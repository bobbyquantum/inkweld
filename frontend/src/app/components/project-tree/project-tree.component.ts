import { Component, ViewChild } from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ArrayDataSource } from '@angular/cdk/collections';

interface ProjectElement {
  id: string;
  name: string;
  children?: ProjectElement[];
  type: 'folder' | 'item';
  level: number;
  expandable?: boolean;
  expanded?: boolean;
  visible?: boolean;
}

const TREE_DATA: ProjectElement[] = [
  {
    id: 'chapters',
    name: '📖 Chapters',
    type: 'folder',
    level: 0,
    expandable: true,
    expanded: false,
    visible: true,
  },
  {
    id: 'c1',
    name: 'Chapter 1',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: false,
  },
  {
    id: 'c2',
    name: 'Chapter 2',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: false,
  },
  {
    id: 'chars',
    name: 'Characters',
    type: 'folder',
    level: 0,
    expandable: true,
    expanded: true,
    visible: true,
  },
  {
    id: 'ch1',
    name: 'Extras',
    type: 'folder',
    level: 1,
    expandable: true,
    expanded: true,
    visible: true,
  },
  {
    id: 'ce1',
    name: 'Extra A',
    type: 'item',
    level: 2,
    expandable: false,
    expanded: true,
    visible: true,
  },
  {
    id: 'ce2',
    name: 'Extra B',
    type: 'item',
    level: 2,
    expandable: false,
    expanded: true,
    visible: true,
  },
  {
    id: 'ch1',
    name: 'Character A',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: true,
  },
  {
    id: 'ch2',
    name: 'Character B',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: true,
  },
  {
    id: 'lo',
    name: 'Locations',
    type: 'folder',
    level: 0,
    expandable: true,
    expanded: true,
    visible: true,
  },
  {
    id: 'l1',
    name: 'Location 1',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: true,
  },
  {
    id: 'l2',
    name: 'Location 2',
    type: 'item',
    level: 1,
    expandable: false,
    expanded: true,
    visible: true,
  },
];
@Component({
  standalone: true,
  imports: [MatTreeModule, DragDropModule, MatIconModule, MatButtonModule],
  selector: 'app-project-tree',
  templateUrl: './project-tree.component.html',
  styleUrls: ['./project-tree.component.scss'],
})
export class ProjectTreeComponent {
  sourceData: ProjectElement[] = JSON.parse(JSON.stringify(TREE_DATA));

  @ViewChild('tree')
  treeEl!: MatTree<ProjectElement>;

  dataSource = new ArrayDataSource<ProjectElement>(
    this.sourceData.filter(x => x.visible)
  );

  levelAccessor(dataNode: ProjectElement): number {
    return dataNode.level;
  }
  hasChild = (_: number, node: ProjectElement) => node.expandable;
  parentExpanded = (_: number, node: ProjectElement) => {
    return this.getParentNode(node)?.expanded;
  };

  toggleExpanded(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    this.sourceData[nodeIndex].expanded = !this.sourceData[nodeIndex].expanded;
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > node.level) {
        this.sourceData[i].visible = this.sourceData[nodeIndex].expanded;
      } else {
        break;
      }
    }
    this.dataSource = new ArrayDataSource<ProjectElement>(
      this.sourceData.filter(x => x.visible)
    );
  }

  getParentNode(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    for (let i = nodeIndex - 1; i >= 0; i--) {
      if (this.sourceData[i].level === node.level - 1) {
        return this.sourceData[i];
      }
    }
    return null;
  }

  addItem(node: ProjectElement) {
    const newItem: ProjectElement = {
      id: 'aaaa',
      name: 'New Item',
      type: 'item',
      level: 1,
    };
    if (!node.children) {
      node.children = [];
    }
    if (node.children.length >= 5) {
      alert('Maximum number of children reached');
      return;
    }
    node.children.push(newItem);
  }
  getNodeSubtree(nodeIndex: number): ProjectElement[] {
    const subtree = [this.sourceData[nodeIndex]];
    const nodeLevel = this.sourceData[nodeIndex].level;
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > nodeLevel) {
        subtree.push(this.sourceData[i]);
      } else {
        break;
      }
    }
    return subtree;
  }
  updateVisibility() {
    const stack: { level: number; expanded?: boolean }[] = [];

    for (const node of this.sourceData) {
      // Pop from stack if current node's level is less than the last level in stack
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      // Determine visibility
      node.visible = stack.every(parent => parent.expanded !== false);

      // If the node is expandable, push it to the stack
      if (node.expandable) {
        stack.push({ level: node.level, expanded: node.expanded });
      }
    }
  }

  visibleNodes(): ProjectElement[] {
    return this.sourceData.filter(x => x.visible);
  }
  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    console.log('origin/destination', event.previousIndex, event.currentIndex);

    if (!event.isPointerOverContainer) return;

    const visibleNodes = this.visibleNodes();
    console.log('visible nodes', visibleNodes);

    const node = event.item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) return;

    const targetNode = visibleNodes[event.currentIndex];
    const targetIndex = this.sourceData.findIndex(n => n.id === targetNode.id);
    if (targetIndex === -1) return;

    // Remove the node and its descendants from their current positions
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    this.sourceData.splice(nodeIndex, nodeSubtree.length);

    // Adjust target index if necessary
    let newIndex = targetIndex;
    if (nodeIndex < targetIndex) {
      newIndex = targetIndex - nodeSubtree.length + 1;
    }

    // Insert the node and its descendants at the new position
    this.sourceData.splice(newIndex, 0, ...nodeSubtree);

    // Update levels
    let prevNodeLevel = -1;
    if (newIndex > 0) {
      prevNodeLevel = this.sourceData[newIndex - 1].level;
    }
    const levelDifference = prevNodeLevel + 1 - node.level;

    for (const n of nodeSubtree) {
      n.level += levelDifference;
    }

    // Update visibility
    this.updateVisibility();

    // Update the data source
    this.dataSource = new ArrayDataSource(
      this.sourceData.filter(x => x.visible)
    );
  }
}
