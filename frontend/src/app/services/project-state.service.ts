import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ProjectAPIService,
  ProjectDto,
  ProjectElementDto,
} from '@inkweld/index';
import { ProjectElement } from 'app/models/project-element';
import { nanoid } from 'nanoid';
import { firstValueFrom } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { environment } from '../../environments/environment';
import { DocumentSyncState } from '../models/document-sync-state';
import { DialogGatewayService } from './dialog-gateway.service';
import { RecentFilesService } from './recent-files.service';
export interface ValidDropLevels {
  levels: number[];
  defaultLevel: number;
}
@Injectable({
  providedIn: 'root',
})
export class ProjectStateService {
  // Core state signals
  readonly project = signal<ProjectDto | undefined>(undefined);
  readonly elements = signal<ProjectElementDto[]>([]);
  readonly openFiles = signal<ProjectElementDto[]>([]);
  readonly selectedTabIndex = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | undefined>(undefined);

  // Computed state for tree visibility with local expansion state
  readonly visibleElements = computed(() => {
    const elements = this.elements();
    const expanded = this.expandedNodeIds();
    const result: ProjectElement[] = [];
    const stack: { id: string; level: number }[] = [];
    console.log('Assessing elements for visibility', elements);
    for (const element of elements) {
      // Pop ancestors that are not in the current branch
      while (
        stack.length > 0 &&
        stack[stack.length - 1].level >= element.level
      ) {
        stack.pop();
      }

      let visible = true;
      for (const ancestor of stack) {
        if (!expanded.has(ancestor.id)) {
          visible = false;
          break;
        }
      }

      if (visible) {
        result.push({
          ...element,
          expanded: expanded.has(element.id),
        });
        if (element.expandable) {
          stack.push({ id: element.id, level: element.level });
        }
      }
    }
    return result;
  });

  // Sync state management
  readonly getSyncState = computed(() => this.docSyncState());

  // Local-only expanded nodes state
  private readonly expandedNodeIds = signal<Set<string>>(new Set());

  private readonly docSyncState = signal<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );

  // Yjs document management
  private doc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private docId: string | null = null;

  // Services
  private projectAPIService = inject(ProjectAPIService);
  private dialogGateway = inject(DialogGatewayService);
  private recentFilesService = inject(RecentFilesService);

  // Project Loading and Initialization
  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const projectDto = await firstValueFrom(
        this.projectAPIService.projectControllerGetProjectByUsernameAndSlug(
          username,
          slug
        )
      );
      this.project.set(projectDto);

      this.docId = `projectElements:${username}:${slug}`;
      this.doc = new Y.Doc();

      // Initialize IndexedDB persistence
      this.indexeddbProvider = new IndexeddbPersistence(this.docId, this.doc);
      await this.indexeddbProvider.whenSynced;

      // Initialize WebSocket provider
      if (!environment.wssUrl) {
        throw new Error('WebSocket URL is not configured');
      }

      this.provider = new WebsocketProvider(
        environment.wssUrl + '/ws/yjs?documentId=',
        this.docId,
        this.doc,
        { connect: true, resyncInterval: 10000 }
      );

      // Set up WebSocket status handling
      this.provider.on('status', ({ status }: { status: string }) => {
        switch (status) {
          case 'connected':
            this.docSyncState.set(DocumentSyncState.Synced);
            break;
          case 'disconnected':
            this.docSyncState.set(DocumentSyncState.Offline);
            break;
          default:
            this.docSyncState.set(DocumentSyncState.Synced);
        }
      });

      this.initializeFromDoc();
      this.observeDocChanges();
    } catch (err) {
      console.error('Failed to load project:', err);
      this.error.set('Failed to load project');
      this.docSyncState.set(DocumentSyncState.Unavailable);
    } finally {
      this.isLoading.set(false);
    }
  }

  updateElements(elements: ProjectElementDto[]): void {
    if (!this.doc) return;

    const elementsArray = this.doc.getArray<ProjectElementDto>('elements');
    this.doc.transact(() => {
      elementsArray.delete(0, elementsArray.length);
      elementsArray.insert(0, elements);
    });
  }

  updateProject(project: ProjectDto): void {
    if (!this.doc) return;

    const projectMap = this.doc.getMap('projectMeta');
    this.doc.transact(() => {
      projectMap.set('title', project.title);
      projectMap.set('description', project.description);
    });
    this.project.set(project);
  }

  /**
   * Updates the sync state for our doc.
   * In a single-doc approach, we simply store it in `docSyncState`.
   */
  updateSyncState(
    documentId: string,
    state: DocumentSyncState | undefined
  ): void {
    if (!documentId || !state) return;

    // Update sync state
    this.docSyncState.set(state);

    // If we're going offline, disconnect providers
    if (state === DocumentSyncState.Offline) {
      this.provider?.disconnect();
    }

    // If we're coming back online, reconnect
    if (state === DocumentSyncState.Synced) {
      this.provider?.connect();
    }

    // Trigger change detection
    this.getSyncState();
  }
  // Tree Operations
  addElement(
    type: ProjectElementDto['type'],
    name: string,
    parentId?: string
  ): void {
    const elements = this.elements();
    const parentIndex = parentId
      ? elements.findIndex(e => e.id === parentId)
      : -1;
    const parentLevel = parentIndex >= 0 ? elements[parentIndex].level : -1;

    const newElement: ProjectElementDto = {
      id: nanoid(),
      name,
      type,
      level: parentLevel + 1,
      expandable: type === 'FOLDER',
      position: elements.length,
      version: 0,
      metadata: {},
    };

    const newElements = [...elements];
    newElements.splice(parentIndex + 1, 0, newElement);
    this.updateElements(this.recomputePositions(newElements));

    // Auto-expand parent when adding new element
    if (parentId) {
      this.setExpanded(parentId, true);
    }
  }

  isValidDrop(
    nodeAbove: ProjectElementDto | null,
    targetLevel: number
  ): boolean {
    if (!nodeAbove) {
      // If no node above, only allow root level or first level
      return targetLevel <= 1;
    }

    // Items can't have children
    if (nodeAbove.type === 'ITEM' && targetLevel > nodeAbove.level) {
      return false;
    }

    // Folders can only have children one level deeper
    if (nodeAbove.type === 'FOLDER' && targetLevel > nodeAbove.level + 1) {
      return false;
    }

    // Prevent negative levels
    if (targetLevel < 0) {
      return false;
    }

    return true;
  }

  getValidDropLevels(
    nodeAbove: ProjectElementDto | null,
    nodeBelow: ProjectElementDto | null
  ): ValidDropLevels {
    const validLevels = new Set<number>();

    // Debug logging
    console.log('GetValidDropLevels Debug:', {
      nodeAbove: nodeAbove
        ? { name: nodeAbove.name, level: nodeAbove.level, type: nodeAbove.type }
        : null,
      nodeBelow: nodeBelow
        ? { name: nodeBelow.name, level: nodeBelow.level, type: nodeBelow.type }
        : null,
    });

    if (nodeAbove && nodeBelow) {
      if (nodeAbove.level < nodeBelow.level) {
        if (nodeAbove.type === 'FOLDER') {
          if (nodeBelow.level === nodeAbove.level + 1) {
            validLevels.add(nodeBelow.level);
          } else {
            validLevels.add(nodeAbove.level);
            validLevels.add(nodeAbove.level + 1);
          }
        } else {
          validLevels.add(nodeBelow.level);
        }
      } else if (nodeAbove.level === nodeBelow.level) {
        validLevels.add(nodeAbove.level);
        // Also allow dropping inside if above node is a folder
        if (nodeAbove.type === 'FOLDER') {
          validLevels.add(nodeAbove.level + 1);
        }
      } else {
        // Allow all levels between the two nodes
        for (let level = nodeBelow.level; level <= nodeAbove.level; level++) {
          validLevels.add(level);
        }
      }
    } else if (nodeAbove && !nodeBelow) {
      // Allow current level and all levels above it
      for (let level = 0; level <= nodeAbove.level; level++) {
        validLevels.add(level);
      }
      // If above node is a folder, allow one level deeper
      if (nodeAbove.type === 'FOLDER') {
        validLevels.add(nodeAbove.level + 1);
      }
    } else if (!nodeAbove && nodeBelow) {
      validLevels.add(nodeBelow.level);
    } else {
      validLevels.add(0); // Root level only if no context
    }

    const levels = Array.from(validLevels).sort((a, b) => a - b);
    const defaultLevel = levels.length > 0 ? levels[0] : 0;

    return {
      levels,
      defaultLevel,
    };
  }
  getDropInsertIndex(
    nodeAbove: ProjectElementDto | null,
    targetLevel: number
  ): number {
    if (!nodeAbove) {
      return 0;
    }

    const elements = this.elements();
    const nodeAboveIndex = elements.findIndex(n => n.id === nodeAbove.id);
    if (nodeAboveIndex === -1) {
      return elements.length;
    }

    // If dropping at a deeper level than the node above, insert right after it
    if (targetLevel > nodeAbove.level) {
      return nodeAboveIndex + 1;
    }

    // If dropping at the same or higher level, insert after the entire subtree
    const subtree = this.getSubtree(elements, nodeAboveIndex);
    return nodeAboveIndex + subtree.length;
  }
  moveElement(elementId: string, targetIndex: number, newLevel: number): void {
    const elements = this.elements();
    const elementIndex = elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return;

    const element = elements[elementIndex];
    const subtree = this.getSubtree(elements, elementIndex);
    const levelDiff = newLevel - element.level;

    // Remove subtree from current position
    const newElements = elements.filter(e => !subtree.includes(e));

    // Update levels in subtree
    subtree.forEach(e => (e.level += levelDiff));

    // Insert at new position
    newElements.splice(targetIndex, 0, ...subtree);
    void this.updateElements(this.recomputePositions(newElements));
  }

  toggleExpanded(elementId: string): void {
    const expanded = this.expandedNodeIds();
    const newExpanded = new Set(expanded);

    if (expanded.has(elementId)) {
      newExpanded.delete(elementId);
    } else {
      newExpanded.add(elementId);
    }

    this.expandedNodeIds.set(newExpanded);
  }

  setExpanded(elementId: string, expanded: boolean): void {
    const currentExpanded = this.expandedNodeIds();
    const newExpanded = new Set(currentExpanded);

    if (expanded) {
      newExpanded.add(elementId);
    } else {
      newExpanded.delete(elementId);
    }

    this.expandedNodeIds.set(newExpanded);
  }

  isExpanded(elementId: string): boolean {
    return this.expandedNodeIds().has(elementId);
  }

  deleteElement(elementId: string): void {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return;

    const subtree = this.getSubtree(elements, index);
    const newElements = elements.filter(e => !subtree.includes(e));

    // Remove deleted elements from expanded set
    const expanded = this.expandedNodeIds();
    const newExpanded = new Set(expanded);
    subtree.forEach(e => newExpanded.delete(e.id));
    this.expandedNodeIds.set(newExpanded);

    void this.updateElements(this.recomputePositions(newElements));
  }

  // File Operations
  openFile(element: ProjectElementDto): void {
    const files = this.openFiles();

    // Add to recent files if we have a project
    const project = this.project();
    console.log('Opening file:', element.name, 'Project:', project);

    this.recentFilesService.addRecentFile(
      element,
      project!.user!.username,
      project!.slug
    );
    console.log(
      'Added to recent files. Current recent files:',
      this.recentFilesService.getRecentFilesForProject(
        project!.user!.username,
        project!.slug
      )
    );

    if (!files.some(f => f.id === element.id)) {
      this.openFiles.set([...files, element]);
    }
    const index = this.openFiles().findIndex(f => f.id === element.id);
    this.selectedTabIndex.set(index + 1);
  }

  closeFile(index: number): void {
    const files = this.openFiles();
    const newFiles = [...files.slice(0, index), ...files.slice(index + 1)];
    this.openFiles.set(newFiles);

    if (this.selectedTabIndex() >= newFiles.length) {
      this.selectedTabIndex.set(Math.max(0, newFiles.length - 1));
    }
  }

  // Dialog Handlers
  showNewElementDialog(parentElement?: ProjectElementDto): void {
    void this.dialogGateway.openNewElementDialog().then(result => {
      if (result) {
        void this.addElement(result.type, result.name, parentElement?.id);
      }
    });
  }

  showEditProjectDialog(): void {
    void this.dialogGateway
      .openEditProjectDialog(this.project()!)
      .then(result => {
        if (result) {
          void this.updateProject(result);
        }
      });
  }

  private getSubtree(
    elements: ProjectElementDto[],
    startIndex: number
  ): ProjectElementDto[] {
    const startLevel = elements[startIndex].level;
    const subtree = [elements[startIndex]];

    for (let i = startIndex + 1; i < elements.length; i++) {
      if (elements[i].level > startLevel) {
        subtree.push(elements[i]);
      } else {
        break;
      }
    }

    return subtree;
  }

  private recomputePositions(
    elements: ProjectElementDto[]
  ): ProjectElementDto[] {
    return elements.map((element, index) => ({
      ...element,
      position: index,
    }));
  }

  private initializeFromDoc(): void {
    if (!this.doc) return;

    const elementsArray = this.doc.getArray<ProjectElementDto>('elements');
    this.elements.set(elementsArray.toArray());
  }

  private observeDocChanges(): void {
    if (!this.doc) return;

    const elementsArray = this.doc.getArray<ProjectElementDto>('elements');
    elementsArray.observe(() => {
      this.elements.set(elementsArray.toArray());
    });
  }
}
