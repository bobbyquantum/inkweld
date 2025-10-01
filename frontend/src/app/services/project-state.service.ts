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

import { DocumentSyncState } from '../models/document-sync-state';
import { DialogGatewayService } from './dialog-gateway.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { RecentFilesService } from './recent-files.service';
import { SetupService } from './setup.service';
import { StorageService } from './storage.service';
import { UnifiedProjectService } from './unified-project.service';

// Constants for document cache configuration
const DOCUMENT_CACHE_CONFIG = {
  dbName: 'documentCache',
  version: 1,
  stores: {
    openedDocuments: null,
  },
};

export interface ValidDropLevels {
  levels: number[];
  defaultLevel: number;
}

// Interfaces for tab management
export interface AppTab {
  id: string;
  name: string;
  type: 'document' | 'folder' | 'system';
  systemType?: 'documents-list' | 'project-files' | 'home';
  element?: ProjectElementDto;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectStateService {
  private projectAPIService = inject(ProjectAPIService);
  private unifiedProjectService = inject(UnifiedProjectService);
  private setupService = inject(SetupService);
  private offlineElementsService = inject(OfflineProjectElementsService);
  private dialogGateway = inject(DialogGatewayService);
  private recentFilesService = inject(RecentFilesService);
  private storageService = inject(StorageService);

  // Document cache
  private documentCacheDb: Promise<IDBDatabase> | null = null;
  private readonly OPEN_DOCUMENTS_KEY = 'openedDocuments';
  private readonly documentCacheDocId = signal<string | null>(null);

  // Core state signals
  readonly project = signal<ProjectDto | undefined>(undefined);
  readonly elements = signal<ProjectElementDto[]>([]);
  readonly openDocuments = signal<ProjectElementDto[]>([]);
  readonly openTabs = signal<AppTab[]>([]);
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

  constructor() {
    // Initialize document cache database
    void this.initializeDocumentCache();
  }

  private initializeDocumentCache(): void {
    if (this.storageService.isAvailable()) {
      try {
        this.documentCacheDb = this.storageService.initializeDatabase(
          DOCUMENT_CACHE_CONFIG
        );
        console.log('Document cache initialized');
      } catch (error) {
        console.error('Failed to initialize document cache:', error);
      }
    }
  }

  // Project Loading and Initialization
  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // Check if we're in offline mode
      const mode = this.setupService.getMode();

      if (mode === 'offline') {
        // Load project in offline mode
        await this.loadOfflineProject(username, slug);
      } else {
        // Load project in server mode
        await this.loadServerProject(username, slug);
      }

      // Restore opened documents from cache after project loads
      await this.restoreOpenedDocumentsFromCache();
    } catch (err) {
      console.error('Failed to load project:', err);

      // Provide more specific error messages based on error type
      let errorMessage = 'Failed to load project';

      if (err instanceof Error) {
        if (
          err.message.includes('401') ||
          err.message.includes('Unauthorized')
        ) {
          errorMessage = 'Session expired. Please log in again.';
          // Auth interceptor will handle redirect
        } else if (
          err.message.includes('404') ||
          err.message.includes('not found')
        ) {
          errorMessage = 'Project not found';
        } else if (
          err.message.includes('Network') ||
          err.message.includes('Failed to fetch')
        ) {
          errorMessage =
            'Network error. Please check your connection and try again.';
        } else if (err.message) {
          errorMessage = `Failed to load project: ${err.message}`;
        }
      }

      this.error.set(errorMessage);
      this.docSyncState.set(DocumentSyncState.Unavailable);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadOfflineProject(
    username: string,
    slug: string
  ): Promise<void> {
    // Get project from unified service
    const projectDto = await this.unifiedProjectService.getProject(
      username,
      slug
    );
    if (!projectDto) {
      throw new Error('Project not found');
    }
    this.project.set(projectDto);

    // Load elements from offline service
    this.offlineElementsService.loadElements(username, slug);
    this.elements.set(this.offlineElementsService.elements());

    // Set offline sync state
    this.docSyncState.set(DocumentSyncState.Offline);
  }

  private async loadServerProject(
    username: string,
    slug: string
  ): Promise<void> {
    const projectDto = await firstValueFrom(
      this.projectAPIService.projectControllerGetProjectByUsernameAndSlug(
        username,
        slug
      )
    );
    this.project.set(projectDto);

    this.docId = `${username}:${slug}:elements`;
    this.doc = new Y.Doc();

    // Initialize IndexedDB persistence
    this.indexeddbProvider = new IndexeddbPersistence(this.docId, this.doc);
    await this.indexeddbProvider.whenSynced;

    // Initialize WebSocket provider
    if (!this.setupService.getWebSocketUrl()) {
      throw new Error('WebSocket URL is not configured');
    }

    this.provider = new WebsocketProvider(
      this.setupService.getWebSocketUrl() + '/ws/yjs?documentId=',
      this.docId,
      this.doc,
      { connect: true, resyncInterval: 10000 }
    );

    // Track connection attempts for exponential backoff
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout: number | null = null;

    // Set up WebSocket status handling
    this.provider.on('status', ({ status }: { status: string }) => {
      console.log(`[ProjectState] WebSocket status for elements: ${status}`);

      switch (status) {
        case 'connected':
          this.docSyncState.set(DocumentSyncState.Synced);
          reconnectAttempts = 0; // Reset on successful connection
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
          break;
        case 'disconnected':
          this.docSyncState.set(DocumentSyncState.Offline);

          // Implement exponential backoff for reconnection
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(
              1000 * Math.pow(2, reconnectAttempts),
              30000
            );
            console.log(
              `[ProjectState] Will attempt reconnect in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`
            );

            reconnectTimeout = window.setTimeout(() => {
              if (this.provider) {
                console.log(
                  '[ProjectState] Attempting to reconnect WebSocket...'
                );
                this.provider.connect();
                reconnectAttempts++;
              }
            }, delay);
          } else {
            console.warn('[ProjectState] Max reconnection attempts reached');
            this.error.set(
              'Unable to connect to server. Please refresh the page.'
            );
          }
          break;
        default:
          this.docSyncState.set(DocumentSyncState.Synced);
      }
    });

    // Handle connection errors specifically
    this.provider.on('connection-error', (event: unknown) => {
      console.error('[ProjectState] WebSocket connection error:', event);

      // Try to extract error message from the event
      let errorMessage = '';
      if (event instanceof Error) {
        errorMessage = event.message;
      } else if (event instanceof Event) {
        errorMessage = event.type;
      } else if (typeof event === 'string') {
        errorMessage = event;
      }

      // Check if this is an authentication error
      if (
        errorMessage &&
        (errorMessage.includes('401') ||
          errorMessage.includes('Unauthorized') ||
          errorMessage.includes('Invalid session'))
      ) {
        console.warn(
          '[ProjectState] Authentication error on WebSocket, session may have expired'
        );
        this.error.set(
          'Session expired. Please refresh the page to log in again.'
        );
        this.docSyncState.set(DocumentSyncState.Unavailable);

        // Don't retry on auth errors
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        reconnectAttempts = maxReconnectAttempts;
      } else {
        this.docSyncState.set(DocumentSyncState.Offline);
      }
    });

    // Listen for online/offline events
    const handleOnline = () => {
      console.log(
        '[ProjectState] Network connection restored, attempting to reconnect...'
      );
      if (this.provider) {
        reconnectAttempts = 0; // Reset attempts on network restore
        this.provider.connect();
      }
    };

    const handleOffline = () => {
      console.log('[ProjectState] Network connection lost');
      this.docSyncState.set(DocumentSyncState.Offline);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    this.initializeFromDoc();
    this.observeDocChanges();
  }

  updateElements(elements: ProjectElementDto[]): void {
    const mode = this.setupService.getMode();

    if (mode === 'offline') {
      // Update offline elements
      const project = this.project();
      if (project) {
        this.offlineElementsService.saveElements(
          project.username,
          project.slug,
          elements
        );
        this.elements.set(elements);
      }
    } else {
      // Update server elements via Yjs
      if (!this.doc) return;

      const elementsArray = this.doc.getArray<ProjectElementDto>('elements');
      this.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, elements);
      });
    }
  }

  renameNode(node: ProjectElement, newName: string): void {
    const mode = this.setupService.getMode();
    const project = this.project();

    if (mode === 'offline' && project) {
      // Rename element in offline mode
      const newElements = this.offlineElementsService.renameElement(
        project.username,
        project.slug,
        node.id,
        newName
      );
      this.elements.set(newElements);
    } else {
      // Rename element in server mode
      const elements = this.elements();
      const index = elements.findIndex(e => e.id === node.id);
      if (index === -1) return;

      const newElements = [...elements];
      newElements[index] = { ...newElements[index], name: newName };
      this.updateElements(this.recomputePositions(newElements));
    }
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
    const mode = this.setupService.getMode();
    const project = this.project();

    if (mode === 'offline' && project) {
      // Add element in offline mode
      const newElements = this.offlineElementsService.addElement(
        project.username,
        project.slug,
        type,
        name,
        parentId
      );
      this.elements.set(newElements);

      // Auto-expand parent when adding new element
      if (parentId) {
        this.setExpanded(parentId, true);
      }
    } else {
      // Add element in server mode
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
    const mode = this.setupService.getMode();
    const project = this.project();

    if (mode === 'offline' && project) {
      // Move element in offline mode
      const newElements = this.offlineElementsService.moveElement(
        project.username,
        project.slug,
        elementId,
        targetIndex,
        newLevel
      );
      this.elements.set(newElements);
    } else {
      // Move element in server mode
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

  async publishProject(project: ProjectDto): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.projectAPIService.projectPublishEpubControllerPublishEpub(
          project.username,
          project.slug
        )
      );

      console.log('Project published successfully:', response);
    } catch (error) {
      console.error('Failed to publish project:', error);
      this.error.set('Failed to publish project. Please try again later.');
    }
  }

  deleteElement(elementId: string): void {
    const mode = this.setupService.getMode();
    const project = this.project();

    if (mode === 'offline' && project) {
      // Delete element in offline mode
      const newElements = this.offlineElementsService.deleteElement(
        project.username,
        project.slug,
        elementId
      );
      this.elements.set(newElements);

      // Remove deleted element from expanded set
      const expanded = this.expandedNodeIds();
      const newExpanded = new Set(expanded);
      newExpanded.delete(elementId);
      this.expandedNodeIds.set(newExpanded);
    } else {
      // Delete element in server mode
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
  }

  // Tab Operations
  openDocument(element: ProjectElementDto): void {
    const documents = this.openDocuments();
    const tabs = this.openTabs();

    // Add to recent documents if we have a project
    const project = this.project();
    console.log('Opening document:', element.name, 'Project:', project);

    this.recentFilesService.addRecentFile(
      element,
      project!.username,
      project!.slug
    );
    console.log(
      'Added to recent files. Current recent files:',
      this.recentFilesService.getRecentFilesForProject(
        project!.username,
        project!.slug
      )
    );

    if (!documents.some(d => d.id === element.id)) {
      this.openDocuments.set([...documents, element]);

      // Add to tabs
      const newTab: AppTab = {
        id: element.id,
        name: element.name,
        type: element.type === 'FOLDER' ? 'folder' : 'document',
        element: element,
      };

      if (!tabs.some(t => t.id === element.id)) {
        this.openTabs.set([...tabs, newTab]);
      }

      // Save updated opened documents to cache
      void this.saveOpenedDocumentsToCache();
    }

    // Find the tab and select it
    const index = this.openTabs().findIndex(t => t.id === element.id);
    if (index !== -1) {
      // Set index+1 because index 0 is reserved for home tab in the TabInterfaceComponent
      this.selectedTabIndex.set(index + 1);
      console.log(
        `Document tab "${element.name}" selected at index ${index + 1} (zero-based index: ${index})`
      );
    }
  }

  /**
   * Opens a system tab like documents list or project files
   */
  openSystemTab(type: 'documents-list' | 'project-files'): void {
    const tabs = this.openTabs();
    const tabId = `system-${type}`;
    const tabName = type === 'documents-list' ? 'Documents' : 'Files';

    if (!tabs.some(t => t.id === tabId)) {
      const newTab: AppTab = {
        id: tabId,
        name: tabName,
        type: 'system',
        systemType: type,
      };

      this.openTabs.set([...tabs, newTab]);

      // Save opened tabs to cache when adding a new tab
      void this.saveOpenedDocumentsToCache();
    }

    const index = this.openTabs().findIndex(t => t.id === tabId);
    if (index !== -1) {
      // Set index+1 because index 0 is reserved for home tab in the TabInterfaceComponent
      this.selectedTabIndex.set(index + 1);
      console.log(
        `System tab "${tabName}" selected at index ${index + 1} (zero-based index: ${index})`
      );
    }
  }

  closeTab(index: number): void {
    const tabs = this.openTabs();
    const closedTab = tabs[index];

    if (!closedTab) {
      console.error(`Attempted to close invalid tab at index ${index}`);
      return;
    }

    // Remove from tabs
    const newTabs = [...tabs.slice(0, index), ...tabs.slice(index + 1)];
    this.openTabs.set(newTabs);

    // If it was a document/folder tab, also remove from openDocuments
    if (
      (closedTab.type === 'document' || closedTab.type === 'folder') &&
      closedTab.element
    ) {
      const docIndex = this.openDocuments().findIndex(
        d => d.id === closedTab.id
      );
      if (docIndex !== -1) {
        const documents = this.openDocuments();
        const newDocuments = [
          ...documents.slice(0, docIndex),
          ...documents.slice(docIndex + 1),
        ];
        this.openDocuments.set(newDocuments);
      }
    }

    // Update selected tab index - ensure we go to home tab if the closed tab was selected
    const currentSelectedIndex = this.selectedTabIndex();
    if (currentSelectedIndex === index) {
      // If we closed the selected tab, go back to the first tab (Home)
      this.selectedTabIndex.set(0);
    } else if (currentSelectedIndex > index) {
      // If we closed a tab before the currently selected one, adjust the index
      this.selectedTabIndex.set(currentSelectedIndex - 1);
    }
    // Otherwise current selection is fine - it's a tab before the one we closed

    // Save updated opened documents to cache
    void this.saveOpenedDocumentsToCache();
  }

  /**
   * Closes a tab by element ID
   * @param elementId The ID of the element whose tab should be closed
   */
  closeTabByElementId(elementId: string): void {
    const tabs = this.openTabs();
    const tabIndex = tabs.findIndex(
      tab => tab.element && tab.element.id === elementId
    );

    if (tabIndex !== -1) {
      this.closeTab(tabIndex);
    }
  }

  /**
   * Legacy alias for closeTab to maintain backwards compatibility
   */
  closeDocument(index: number): void {
    this.closeTab(index);
  }

  async saveOpenedDocumentsToCache(): Promise<void> {
    if (!this.documentCacheDb || !this.storageService.isAvailable()) return;

    const project = this.project();
    if (!project || !project.username || !project.slug) return;

    const cacheKey = `${project.username}/${project.slug}/documents`;

    try {
      const db = await this.documentCacheDb;

      // Save document elements (for backward compatibility)
      await this.storageService.put(
        db,
        'openedDocuments',
        this.openDocuments(),
        cacheKey
      );

      // Save tabs (using a different key)
      await this.storageService.put(
        db,
        'openedDocuments',
        this.openTabs(),
        `${cacheKey}/tabs`
      );

      console.log('Opened documents and tabs saved to cache:', cacheKey);
    } catch (error) {
      console.error('Failed to save opened documents to cache:', error);
    }
  }

  async restoreOpenedDocumentsFromCache(): Promise<void> {
    if (!this.documentCacheDb || !this.storageService.isAvailable()) return;

    const project = this.project();
    if (!project || !project.username || !project.slug) return;

    const cacheKey = `${project.username}/${project.slug}/documents`;

    try {
      const db = await this.documentCacheDb;

      // Try to get tabs first
      const tabs = await this.storageService.get<AppTab[]>(
        db,
        'openedDocuments',
        `${cacheKey}/tabs`
      );

      if (tabs && tabs.length > 0) {
        console.log('Restoring tabs from cache:', tabs);

        // Validate document tabs still exist in project
        const currentElements = this.elements();
        const validTabs = tabs.filter(tab => {
          // Always keep system tabs
          if (tab.type === 'system') {
            console.log('Keeping system tab:', tab.name, tab.systemType);
            return true;
          }

          // For document/folder tabs, verify they exist in project
          const exists =
            tab.element &&
            currentElements.some(element => element.id === tab.id);

          if (!exists) {
            console.log('Removing invalid tab:', tab.name, tab.id);
          }

          return exists;
        });

        if (validTabs.length > 0) {
          this.openTabs.set(validTabs);

          // Also update openDocuments for backward compatibility
          const documents = validTabs
            .filter(
              tab =>
                tab.element &&
                (tab.type === 'document' || tab.type === 'folder')
            )
            .map(tab => tab.element as ProjectElementDto);

          if (documents.length > 0) {
            this.openDocuments.set(documents);
          }

          // Restore the previously selected tab or select Home tab
          const urlParams = window.location.pathname.split('/');
          const lastSegment = urlParams[urlParams.length - 1];

          let selectedIndex = 0; // Default to Home tab

          // Check if URL indicates we should be on a specific system tab
          if (lastSegment === 'documents') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'documents-list'
            );
            selectedIndex = selectedIndex !== -1 ? selectedIndex : 0;
          } else if (lastSegment === 'files') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'project-files'
            );
            selectedIndex = selectedIndex !== -1 ? selectedIndex : 0;
          } else if (lastSegment.match(/^[a-f0-9-]+$/)) {
            // If URL has a document ID, find and select that document tab
            const potentialDocId = lastSegment;
            selectedIndex = validTabs.findIndex(t => t.id === potentialDocId);
            selectedIndex = selectedIndex !== -1 ? selectedIndex : 0;
          }

          this.selectedTabIndex.set(selectedIndex);
          console.log(
            'Opened tabs restored from cache:',
            validTabs.length,
            'Selected index:',
            selectedIndex
          );
          return;
        }
      }

      // Fallback to legacy document loading
      const documents = await this.storageService.get<ProjectElementDto[]>(
        db,
        'openedDocuments',
        cacheKey
      );

      if (documents && documents.length > 0) {
        // Validate that all documents still exist in the current project
        const currentElements = this.elements();
        const validDocuments = documents.filter(doc =>
          currentElements.some(element => element.id === doc.id)
        );

        if (validDocuments.length > 0) {
          this.openDocuments.set(validDocuments);

          // Convert to tabs
          const tabs: AppTab[] = validDocuments.map(doc => ({
            id: doc.id,
            name: doc.name,
            type: doc.type === 'FOLDER' ? 'folder' : 'document',
            element: doc,
          }));
          this.openTabs.set(tabs);

          // Set the first document as selected
          this.selectedTabIndex.set(Math.min(1, validDocuments.length));
          console.log(
            'Opened documents restored from cache:',
            validDocuments.length
          );
        }
      }
    } catch (error) {
      console.error('Failed to restore opened documents from cache:', error);
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
