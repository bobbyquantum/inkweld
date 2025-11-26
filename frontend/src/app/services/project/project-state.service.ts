import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import {
  Element,
  ElementType,
  ExportService,
  Project,
  ProjectsService,
} from '@inkweld/index';
import { ProjectElement } from 'app/models/project-element';
import { nanoid } from 'nanoid';
import { firstValueFrom, Subscription } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../core/dialog-gateway.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { StorageService } from '../offline/storage.service';
import { UnifiedProjectService } from '../offline/unified-project.service';
import {
  ElementSyncProviderFactory,
  IElementSyncProvider,
} from '../sync/index';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { ElementTreeService, ValidDropLevels } from './element-tree.service';
import { RecentFilesService } from './recent-files.service';
import { AppTab, TabManagerService } from './tab-manager.service';

// Constants for document cache configuration
const DOCUMENT_CACHE_CONFIG = {
  dbName: 'documentCache',
  version: 1,
  stores: {
    openedDocuments: null,
  },
};

// Re-export for backward compatibility
export type { AppTab, ValidDropLevels };

/**
 * Central service for managing project state.
 *
 * Responsibilities:
 * - Project loading and switching
 * - Element tree state management
 * - Tab/document management coordination
 * - Tree expansion state
 *
 * Delegates to:
 * - IElementSyncProvider: Element sync (Yjs or offline)
 * - TabManagerService: Tab lifecycle
 * - ElementTreeService: Tree operations
 * - WorldbuildingService: Custom element types
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectStateService implements OnDestroy {
  // Injected services
  private readonly projectsService = inject(ProjectsService);
  private readonly exportService = inject(ExportService);
  private readonly unifiedProjectService = inject(UnifiedProjectService);
  private readonly setupService = inject(SetupService);
  private readonly offlineElementsService = inject(
    OfflineProjectElementsService
  );
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly recentFilesService = inject(RecentFilesService);
  private readonly storageService = inject(StorageService);
  private readonly logger = inject(LoggerService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly elementTreeService = inject(ElementTreeService);
  private readonly tabManager = inject(TabManagerService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);

  // Current sync provider (set when project is loaded)
  private syncProvider: IElementSyncProvider | null = null;
  private providerSubscriptions: Subscription[] = [];

  // Document cache
  private documentCacheDb: Promise<IDBDatabase> | null = null;

  // Core state signals
  readonly project = signal<Project | undefined>(undefined);
  readonly elements = signal<Element[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | undefined>(undefined);

  // Sync state from provider
  private readonly docSyncState = signal<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );
  readonly getSyncState = computed(() => this.docSyncState());

  // Local-only expanded nodes state
  private readonly expandedNodeIds = signal<Set<string>>(new Set());

  // Tab state - delegate to TabManagerService
  readonly openDocuments = computed(() => this.tabManager.openDocuments());
  readonly openTabs = computed(() => this.tabManager.openTabs());
  readonly selectedTabIndex = computed(() =>
    this.tabManager.selectedTabIndex()
  );

  // Computed state for tree visibility with local expansion state
  readonly visibleElements = computed(() => {
    const elements = this.elements();
    const expanded = this.expandedNodeIds();
    const result: ProjectElement[] = [];
    const stack: { id: string; level: number }[] = [];

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

  constructor() {
    void this.initializeDocumentCache();
  }

  ngOnDestroy(): void {
    this.cleanupProviderSubscriptions();
    this.syncProvider?.disconnect();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Loading
  // ─────────────────────────────────────────────────────────────────────────────

  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // Clear previous project state
      this.clearProjectState();

      // Load project metadata and elements
      const mode = this.setupService.getMode();

      if (mode === 'offline') {
        await this.loadOfflineProject(username, slug);
      } else {
        await this.loadServerProject(username, slug);
      }

      // Restore opened documents from cache
      await this.restoreOpenedDocumentsFromCache();
    } catch (err) {
      this.handleLoadError(err);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadOfflineProject(
    username: string,
    slug: string
  ): Promise<void> {
    // Get project metadata
    const project = await this.unifiedProjectService.getProject(username, slug);
    if (!project) {
      throw new Error('Project not found');
    }
    this.project.set(project);

    // Connect sync provider
    await this.connectSyncProvider(username, slug);
  }

  private async loadServerProject(
    username: string,
    slug: string
  ): Promise<void> {
    // Get project metadata from API
    const project = await firstValueFrom(
      this.projectsService.getProject(username, slug)
    );
    this.project.set(project);

    // Connect sync provider
    await this.connectSyncProvider(username, slug);
  }

  /**
   * Connect the appropriate sync provider and subscribe to its observables.
   */
  private async connectSyncProvider(
    username: string,
    slug: string
  ): Promise<void> {
    // Get the appropriate provider (Yjs or Offline)
    this.syncProvider = this.syncProviderFactory.getProvider();

    // Subscribe to provider observables
    this.setupProviderSubscriptions();

    // Connect
    const result = await this.syncProvider.connect({
      username,
      slug,
      webSocketUrl: this.setupService.getWebSocketUrl() ?? undefined,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect to sync provider');
    }

    this.logger.info(
      'ProjectState',
      `Connected to ${this.syncProviderFactory.getCurrentMode()} sync provider`
    );
  }

  /**
   * Subscribe to sync provider observables.
   */
  private setupProviderSubscriptions(): void {
    if (!this.syncProvider) return;

    // Clean up any existing subscriptions
    this.cleanupProviderSubscriptions();

    // Elements changes
    this.providerSubscriptions.push(
      this.syncProvider.elements$.subscribe(elements => {
        this.elements.set(elements);
        // Enrich custom type elements with icons
        void this.enrichElementsWithIcons(elements);
      })
    );

    // Sync state changes
    this.providerSubscriptions.push(
      this.syncProvider.syncState$.subscribe(state => {
        this.docSyncState.set(state);
      })
    );

    // Errors
    this.providerSubscriptions.push(
      this.syncProvider.errors$.subscribe(errorMsg => {
        this.logger.error('ProjectState', 'Sync provider error', errorMsg);
        this.error.set(errorMsg);
      })
    );
  }

  private cleanupProviderSubscriptions(): void {
    this.providerSubscriptions.forEach(sub => sub.unsubscribe());
    this.providerSubscriptions = [];
  }

  /**
   * Clear all project-specific state when switching projects.
   */
  private clearProjectState(): void {
    const currentProject = this.project();
    this.logger.info('ProjectState', '🧹 Clearing project state', {
      currentProjectId: currentProject?.id,
      currentProjectSlug: currentProject?.slug,
    });

    // Disconnect sync provider
    this.cleanupProviderSubscriptions();
    this.syncProvider?.disconnect();
    this.syncProvider = null;

    // Close all tabs
    this.tabManager.clearAllTabs();

    // Clear elements and expansion state
    this.elements.set([]);
    this.expandedNodeIds.set(new Set());

    // Clear error state
    this.error.set(undefined);
  }

  private handleLoadError(err: unknown): void {
    this.logger.error('ProjectState', 'Failed to load project', err);

    let errorMessage = 'Failed to load project';

    if (err instanceof Error) {
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorMessage = 'Session expired. Please log in again.';
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
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Element Operations
  // ─────────────────────────────────────────────────────────────────────────────

  updateElements(elements: Element[]): void {
    if (!this.syncProvider) {
      this.logger.warn(
        'ProjectState',
        'Cannot update elements - no sync provider'
      );
      return;
    }

    this.syncProvider.updateElements(elements);
  }

  async addElement(
    type: Element['type'],
    name: string,
    parentId?: string
  ): Promise<string | undefined> {
    const project = this.project();
    if (!project) return undefined;

    // Fetch icon for custom templates
    const icon = await this.worldbuildingService.getIconForType(
      type,
      project.username,
      project.slug
    );

    // Calculate position
    const elements = this.elements();
    const parentIndex = parentId
      ? elements.findIndex(e => e.id === parentId)
      : -1;
    const parentLevel = parentIndex >= 0 ? elements[parentIndex].level : -1;

    const newElement: Element = {
      id: nanoid(),
      name,
      type,
      parentId: parentId || null,
      level: parentLevel + 1,
      expandable: type === ElementType.Folder,
      order: elements.length,
      version: 0,
      metadata: icon ? { icon } : {},
    };

    const updatedElements = [...elements];
    updatedElements.splice(parentIndex + 1, 0, newElement);

    this.updateElements(
      this.elementTreeService.recomputeOrder(updatedElements)
    );

    // Auto-expand parent
    if (parentId) {
      this.setExpanded(parentId, true);
    }

    // Initialize worldbuilding data
    void this.worldbuildingService.initializeWorldbuildingElement(
      newElement,
      project.username,
      project.slug
    );

    return newElement.id;
  }

  deleteElement(elementId: string): void {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return;

    const subtree = this.elementTreeService.getSubtree(elements, index);
    const newElements = elements.filter(e => !subtree.includes(e));

    // Remove deleted elements from expanded set
    const expanded = this.expandedNodeIds();
    const newExpanded = new Set(expanded);
    subtree.forEach(e => newExpanded.delete(e.id));
    this.expandedNodeIds.set(newExpanded);

    this.updateElements(this.elementTreeService.recomputeOrder(newElements));
  }

  renameNode(node: Element, newName: string): void {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === node.id);
    if (index === -1) return;

    const newElements = [...elements];
    newElements[index] = { ...newElements[index], name: newName };
    this.updateElements(this.elementTreeService.recomputeOrder(newElements));
  }

  moveElement(elementId: string, targetIndex: number, newLevel: number): void {
    const elements = this.elements();
    const newElements = this.elementTreeService.moveElement(
      elements,
      elementId,
      targetIndex,
      newLevel
    );
    if (newElements !== elements) {
      this.updateElements(newElements);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tree Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  isValidDrop(nodeAbove: Element | null, targetLevel: number): boolean {
    return this.elementTreeService.isValidDrop(nodeAbove, targetLevel);
  }

  getValidDropLevels(
    nodeAbove: Element | null,
    nodeBelow: Element | null
  ): ValidDropLevels {
    return this.elementTreeService.getValidDropLevels(nodeAbove, nodeBelow);
  }

  getDropInsertIndex(nodeAbove: Element | null, targetLevel: number): number {
    return this.elementTreeService.getDropInsertIndex(
      this.elements(),
      nodeAbove,
      targetLevel
    );
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab Operations
  // ─────────────────────────────────────────────────────────────────────────────

  openDocument(element: Element): void {
    const project = this.project();
    if (!project) return;

    this.recentFilesService.addRecentFile(
      element,
      project.username,
      project.slug
    );

    const result = this.tabManager.openDocument(element);

    // Initialize worldbuilding data if needed
    if (result.wasCreated && result.tab.type === 'worldbuilding') {
      void this.initializeWorldbuildingForElement(element);

      // Cache icon for custom types
      if (element.type.startsWith('CUSTOM_')) {
        void this.worldbuildingService
          .getIconForType(element.type, project.username, project.slug)
          .then(icon => {
            const updatedElement = { ...element };
            updatedElement.metadata = { ...element.metadata, icon };
            this.tabManager.updateTabElement(element.id, updatedElement);
          })
          .catch(err => {
            console.warn(`Failed to load icon for ${element.type}:`, err);
          });
      }
    }

    if (result.wasCreated) {
      void this.saveOpenedDocumentsToCache();
    }
  }

  openSystemTab(
    type: 'documents-list' | 'project-files' | 'templates-list'
  ): void {
    const result = this.tabManager.openSystemTab(type);
    if (result.wasCreated) {
      void this.saveOpenedDocumentsToCache();
    }
  }

  closeTab(index: number): void {
    const closed = this.tabManager.closeTab(index);
    if (closed) {
      void this.saveOpenedDocumentsToCache();
    }
  }

  closeTabByElementId(elementId: string): void {
    const closed = this.tabManager.closeTabByElementId(elementId);
    if (closed) {
      void this.saveOpenedDocumentsToCache();
    }
  }

  closeDocument(index: number): void {
    this.closeTab(index);
  }

  selectTab(index: number): void {
    this.tabManager.selectTab(index);
    void this.saveOpenedDocumentsToCache();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Operations
  // ─────────────────────────────────────────────────────────────────────────────

  updateProject(project: Project): void {
    // Note: This updates local state only.
    // Full project updates should go through ProjectsService API
    this.project.set(project);
  }

  updateSyncState(
    documentId: string,
    state: DocumentSyncState | undefined
  ): void {
    if (!documentId || !state) return;
    this.docSyncState.set(state);
  }

  async publishProject(project: Project): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.exportService.exportProjectAsEpub(project.username, project.slug)
      );
      this.logger.info(
        'ProjectState',
        'Project published successfully',
        response
      );
    } catch (error) {
      this.logger.error('ProjectState', 'Failed to publish project', error);
      this.error.set('Failed to publish project. Please try again later.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dialog Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  showNewElementDialog(parentElement?: Element): void {
    void this.dialogGateway.openNewElementDialog().then(async result => {
      if (result) {
        const newElementId = await this.addElement(
          result.type,
          result.name,
          parentElement?.id
        );

        if (newElementId) {
          const elements = this.elements();
          const newElement = elements.find(e => e.id === newElementId);
          if (newElement) {
            this.openDocument(newElement);
          }
        }
      }
    });
  }

  showEditProjectDialog(): void {
    void this.dialogGateway
      .openEditProjectDialog(this.project()!)
      .then(result => {
        if (result) {
          this.updateProject(result);
        }
      });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Cache (Tab Persistence)
  // ─────────────────────────────────────────────────────────────────────────────

  private initializeDocumentCache(): void {
    if (this.storageService.isAvailable()) {
      try {
        this.documentCacheDb = this.storageService.initializeDatabase(
          DOCUMENT_CACHE_CONFIG
        );
        this.logger.info('ProjectState', 'Document cache initialized');
      } catch (error) {
        this.logger.error(
          'ProjectState',
          'Failed to initialize document cache',
          error
        );
      }
    }
  }

  async saveOpenedDocumentsToCache(): Promise<void> {
    if (!this.documentCacheDb || !this.storageService.isAvailable()) return;

    const project = this.project();
    if (!project?.username || !project?.slug) return;

    const cacheKey = `${project.username}/${project.slug}/documents`;
    const tabsCacheKey = `${cacheKey}/tabs`;

    const tabsToSave = this.openTabs();
    this.logger.debug(
      'ProjectState',
      `💾 Saving ${tabsToSave.length} tabs to cache`
    );

    try {
      const db = await this.documentCacheDb;

      await this.storageService.put(
        db,
        'openedDocuments',
        this.openDocuments(),
        cacheKey
      );

      await this.storageService.put(
        db,
        'openedDocuments',
        tabsToSave,
        tabsCacheKey
      );
    } catch (error) {
      this.logger.error(
        'ProjectState',
        'Failed to save opened documents to cache',
        error
      );
    }
  }

  async restoreOpenedDocumentsFromCache(): Promise<void> {
    if (!this.documentCacheDb || !this.storageService.isAvailable()) return;

    const project = this.project();
    if (!project?.username || !project?.slug) return;

    const cacheKey = `${project.username}/${project.slug}/documents`;
    const tabsCacheKey = `${cacheKey}/tabs`;

    try {
      const db = await this.documentCacheDb;

      const tabs = await this.storageService.get<AppTab[]>(
        db,
        'openedDocuments',
        tabsCacheKey
      );

      if (tabs && tabs.length > 0) {
        const currentElements = this.elements();
        const validTabs = tabs.filter(tab => {
          if (tab.type === 'system') return true;
          return (
            tab.element &&
            currentElements.some(element => element.id === tab.id)
          );
        });

        if (validTabs.length > 0) {
          const urlParams = window.location.pathname.split('/');
          const lastSegment = urlParams[urlParams.length - 1];
          let selectedIndex = 0;

          if (lastSegment === 'documents') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'documents-list'
            );
          } else if (lastSegment === 'files') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'project-files'
            );
          } else if (lastSegment === 'templates') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'templates-list'
            );
          } else if (lastSegment.match(/^[a-f0-9-]+$/)) {
            selectedIndex = validTabs.findIndex(t => t.id === lastSegment);
          }

          selectedIndex = selectedIndex !== -1 ? selectedIndex : 0;
          this.tabManager.setTabs(validTabs, selectedIndex);

          this.logger.info('ProjectState', 'Tabs restored from cache', {
            tabsCount: validTabs.length,
            selectedIndex,
          });
          return;
        }
      }

      // Fallback to legacy document loading
      const documents = await this.storageService.get<Element[]>(
        db,
        'openedDocuments',
        cacheKey
      );

      if (documents && documents.length > 0) {
        const currentElements = this.elements();
        const validDocuments = documents.filter(doc =>
          currentElements.some(el => el.id === doc.id)
        );

        for (const doc of validDocuments) {
          this.tabManager.openDocument(doc);
        }
      }
    } catch (error) {
      this.logger.error(
        'ProjectState',
        'Failed to restore opened documents from cache',
        error
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding
  // ─────────────────────────────────────────────────────────────────────────────

  private async initializeWorldbuildingForElement(
    element: Element
  ): Promise<void> {
    if (element.id) {
      await this.worldbuildingService.initializeWorldbuildingElement(element);
    }
  }

  private async enrichElementsWithIcons(elements: Element[]): Promise<void> {
    const project = this.project();
    if (!project) return;

    const customElements = elements.filter(
      el => el.type.startsWith('CUSTOM_') && !el.metadata?.['icon']
    );

    if (customElements.length === 0) return;

    for (const element of customElements) {
      try {
        const icon = await this.worldbuildingService.getIconForType(
          element.type,
          project.username,
          project.slug
        );
        element.metadata = { ...element.metadata, icon };
      } catch (err) {
        console.warn(`Failed to load icon for ${element.type}:`, err);
      }
    }

    this.elements.set([...elements]);
  }
}
