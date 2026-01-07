import {
  computed,
  inject,
  Injectable,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import { Element, ElementType, Project } from '@inkweld/index';
import { ProjectElement } from 'app/models/project-element';
import { nanoid } from 'nanoid';
import { Subscription } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
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
  private readonly ngZone = inject(NgZone);

  // Current sync provider (set when project is loaded)
  private syncProvider: IElementSyncProvider | null = null;
  private providerSubscriptions: Subscription[] = [];

  // Document cache
  private documentCacheDb: Promise<IDBDatabase> | null = null;

  // Core state signals
  readonly project = signal<Project | undefined>(undefined);
  readonly elements = signal<Element[]>([]);
  readonly publishPlans = signal<PublishPlan[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | undefined>(undefined);

  /**
   * Whether the current user can write (edit) the project.
   * Returns true for owners and collaborators with editor/admin role.
   * Returns false for viewers.
   */
  readonly canWrite = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    // In offline mode, user owns all their projects - grant full access
    if (this.setupService.getMode() === 'offline') return true;
    // SECURITY: Default to no write access if access info is missing in server mode
    if (!proj.access) return false;
    return proj.access.canWrite;
  });

  /**
   * Whether the current user is the project owner.
   */
  readonly isOwner = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    // In offline mode, user owns all their projects
    if (this.setupService.getMode() === 'offline') return true;
    // SECURITY: Default to not owner if access info is missing in server mode
    if (!proj.access) return false;
    return proj.access.isOwner;
  });

  /**
   * Whether the current user has admin access (owner or admin collaborator).
   */
  readonly isAdmin = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    // In offline mode, user owns all their projects - grant full admin
    if (this.setupService.getMode() === 'offline') return true;
    // SECURITY: Default to no admin access if access info is missing in server mode
    if (!proj.access) return false;
    return proj.access.canAdmin;
  });

  /**
   * Whether access information has been loaded for the current project.
   * Returns true in offline mode (always have full access) or when server mode
   * project has access info populated. Use this to wait before rendering
   * access-controlled UI elements to avoid flicker.
   */
  readonly accessLoaded = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    // In offline mode, access is always known (full access)
    if (this.setupService.getMode() === 'offline') return true;
    // In server mode, access is loaded when the access property is present
    return proj.access !== undefined;
  });

  /**
   * Cover image media ID (stored in local IndexedDB media library).
   * This is separate from the API Project.coverImage URL because it enables
   * offline-first editing via Yjs sync.
   */
  readonly coverMediaId = signal<string | undefined>(undefined);

  // Flag to prevent feedback loop when we're the source of metadata changes
  private isUpdatingMeta = false;

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
    // Skip if already loaded and connected to the same project
    const currentProject = this.project();
    if (
      currentProject?.username === username &&
      currentProject?.slug === slug &&
      this.syncProvider?.isConnected()
    ) {
      this.logger.debug(
        'ProjectState',
        `Skipping reload - already connected to ${username}/${slug}`
      );
      return;
    }

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
    const connected = await this.connectSyncProvider(username, slug);
    if (!connected) {
      throw new Error('Failed to connect to sync provider');
    }
  }

  private async loadServerProject(
    username: string,
    slug: string
  ): Promise<void> {
    // Local-first: Try to get project metadata using UnifiedProjectService
    // which handles caching and graceful fallback when server is down
    let project: Project | null = null;
    let serverError: Error | null = null;

    try {
      project = await this.unifiedProjectService.getProject(username, slug);
    } catch (err) {
      // Server might be down - save error but continue
      serverError = err instanceof Error ? err : new Error('Unknown error');
      this.logger.warn(
        'ProjectState',
        `Server unavailable, will try local-first sync: ${serverError.message}`
      );
    }

    // If we got project metadata, set it
    if (project) {
      this.project.set(project);
    } else if (!serverError) {
      // No project and no error means project wasn't found
      throw new Error('Project not found');
    }

    // Connect sync provider - this is local-first (IndexedDB + WebSocket)
    // Even if server is down, we can load from IndexedDB
    const connected = await this.connectSyncProvider(username, slug);

    // If we don't have project metadata but sync provider connected,
    // we're in degraded mode - show a placeholder project
    if (!project && connected && this.syncProvider?.isConnected()) {
      this.logger.info(
        'ProjectState',
        'Operating in offline mode - server unavailable but local data loaded'
      );
      // Create a minimal project placeholder so UI can render
      // The real project data will sync when server comes back
      this.project.set({
        id: `local-${username}-${slug}`,
        username,
        slug,
        title: slug, // Use slug as title placeholder
        description: '',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      });
      // Mark as offline state
      this.docSyncState.set(DocumentSyncState.Offline);
    } else if (!project && !connected) {
      // No project and sync provider failed too
      throw serverError || new Error('Failed to load project');
    }
  }

  /**
   * Connect the appropriate sync provider and subscribe to its observables.
   * Returns true if connection succeeded (even in degraded offline mode).
   */
  private async connectSyncProvider(
    username: string,
    slug: string
  ): Promise<boolean> {
    // Get the appropriate provider (Yjs or Offline)
    this.syncProvider = this.syncProviderFactory.getProvider();

    // Set WorldbuildingService sync provider BEFORE subscribing to observables
    // This ensures schemasCache is populated when elements$ triggers component effects
    this.worldbuildingService.setSyncProvider(this.syncProvider);

    // Subscribe to provider observables
    this.setupProviderSubscriptions();

    // Connect - Yjs provider is local-first and will load from IndexedDB
    // even if WebSocket fails
    const result = await this.syncProvider.connect({
      username,
      slug,
      webSocketUrl: this.setupService.getWebSocketUrl() ?? undefined,
    });

    if (!result.success) {
      // Critical failure (e.g., IndexedDB unavailable)
      this.logger.error(
        'ProjectState',
        `Sync provider failed: ${result.error}`
      );
      return false;
    }

    this.logger.info(
      'ProjectState',
      `Connected to ${this.syncProviderFactory.getCurrentMode()} sync provider`
    );

    return true;
  }

  /**
   * Subscribe to sync provider observables.
   * Wraps callbacks in NgZone.run() to ensure Angular change detection runs.
   */
  private setupProviderSubscriptions(): void {
    if (!this.syncProvider) return;

    // Clean up any existing subscriptions
    this.cleanupProviderSubscriptions();

    // Elements changes - wrap in NgZone for proper change detection
    this.providerSubscriptions.push(
      this.syncProvider.elements$.subscribe(elements => {
        this.ngZone.run(() => {
          this.elements.set(elements);
          // Enrich custom type elements with icons
          void this.enrichElementsWithIcons(elements);
          // Update any open tabs whose element names may have changed
          this.syncTabsWithElements(elements);
        });
      })
    );

    // Publish plans changes
    this.providerSubscriptions.push(
      this.syncProvider.publishPlans$.subscribe(plans => {
        this.ngZone.run(() => {
          this.publishPlans.set(plans);
        });
      })
    );

    // Sync state changes
    this.providerSubscriptions.push(
      this.syncProvider.syncState$.subscribe(state => {
        this.ngZone.run(() => {
          this.docSyncState.set(state);
        });
      })
    );

    // Project metadata changes (name, description, cover)
    // This receives updates from Yjs (both local and remote changes)
    this.providerSubscriptions.push(
      this.syncProvider.projectMeta$.subscribe(meta => {
        // Skip if we're the source of this change (prevents feedback loop)
        // We already updated signals directly in updateProject()
        if (this.isUpdatingMeta) {
          return;
        }

        // For remote changes, update signals
        // Defer to next microtask to avoid ExpressionChangedAfterItHasBeenCheckedError
        queueMicrotask(() => {
          // Double-check flag in case another update started
          if (this.isUpdatingMeta) {
            return;
          }
          this.ngZone.run(() => {
            if (meta) {
              // Merge Yjs metadata with current project
              const current = this.project();
              if (current) {
                this.project.set({
                  ...current,
                  title: meta.name,
                  description: meta.description,
                });
                // Store coverMediaId separately - it's not part of the API Project model
                this.coverMediaId.set(meta.coverMediaId);
              }
            }
          });
        });
      })
    );

    // Errors - only set error if it's a critical error, not transient connection issues
    this.providerSubscriptions.push(
      this.syncProvider.errors$.subscribe(errorMsg => {
        this.ngZone.run(() => {
          this.logger.error('ProjectState', 'Sync provider error', errorMsg);
          // Don't set a fatal error for transient connection issues
          // These are logged but the app can continue with local data
          if (this.isCriticalError(errorMsg)) {
            this.error.set(errorMsg);
          }
        });
      })
    );
  }

  /**
   * Determine if an error message represents a critical error that should
   * block the UI, vs a transient connection issue that can be recovered from.
   */
  private isCriticalError(errorMsg: string): boolean {
    // Session expiry is critical - user needs to re-authenticate
    if (
      errorMsg.includes('Session expired') ||
      errorMsg.includes('401') ||
      errorMsg.includes('Unauthorized')
    ) {
      return true;
    }

    // These are transient and the app can continue with local data:
    // - WebSocket sync timeout
    // - Connection errors
    // - Network errors
    if (
      errorMsg.includes('WebSocket sync timeout') ||
      errorMsg.includes('Unable to connect') ||
      errorMsg.includes('connection')
    ) {
      return false;
    }

    // For unknown errors, be cautious and don't block the UI
    return false;
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

    // Clear WorldbuildingService sync provider
    this.worldbuildingService.setSyncProvider(null);

    // Disconnect sync provider
    this.cleanupProviderSubscriptions();
    this.syncProvider?.disconnect();
    this.syncProvider = null;

    // Close all tabs
    this.tabManager.clearAllTabs();

    // Clear elements, publish plans, and expansion state
    this.elements.set([]);
    this.publishPlans.set([]);
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

  addElement(
    type: Element['type'],
    name: string,
    parentId?: string,
    schemaId?: string
  ): string | undefined {
    const project = this.project();
    if (!project) return undefined;

    // Fetch icon for custom templates
    const icon = this.worldbuildingService.getIconForType(
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
      schemaId: schemaId || undefined,
      parentId: parentId || null,
      level: parentLevel + 1,
      expandable: type === ElementType.Folder,
      order: elements.length,
      version: 0,
      metadata: icon ? { icon } : {},
    };

    const updatedElements = [...elements];
    updatedElements.splice(parentIndex + 1, 0, newElement);

    const recomputedElements =
      this.elementTreeService.recomputeOrder(updatedElements);
    this.elements.set(recomputedElements);
    this.updateElements(recomputedElements);

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

    const recomputedElements =
      this.elementTreeService.recomputeOrder(newElements);
    this.elements.set(recomputedElements);
    this.updateElements(recomputedElements);
  }

  renameNode(node: Element, newName: string): void {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === node.id);
    if (index === -1) return;

    const newElements = [...elements];
    const updatedNode = { ...newElements[index], name: newName };
    newElements[index] = updatedNode;
    const recomputedElements =
      this.elementTreeService.recomputeOrder(newElements);
    this.elements.set(recomputedElements);
    this.updateElements(recomputedElements);

    // Update the tab name if this element is open in a tab
    this.tabManager.updateTabElement(node.id, updatedNode);
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
      this.elements.set(newElements);
      this.updateElements(newElements);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Publish Plan Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all publish plans for the current project.
   */
  getPublishPlans(): PublishPlan[] {
    return this.publishPlans();
  }

  /**
   * Get a specific publish plan by ID.
   */
  getPublishPlan(planId: string): PublishPlan | undefined {
    return this.publishPlans().find(p => p.id === planId);
  }

  /**
   * Update all publish plans (used internally by sync).
   */
  updatePublishPlans(plans: PublishPlan[]): void {
    if (!this.syncProvider) {
      this.logger.warn(
        'ProjectState',
        'Cannot update publish plans - no sync provider'
      );
      return;
    }

    this.syncProvider.updatePublishPlans(plans);
  }

  /**
   * Create a new publish plan.
   */
  createPublishPlan(plan: PublishPlan): void {
    const plans = [...this.publishPlans(), plan];
    this.publishPlans.set(plans);
    this.updatePublishPlans(plans);
    this.logger.info('ProjectState', `Created publish plan: ${plan.name}`);
  }

  /**
   * Update an existing publish plan.
   */
  updatePublishPlan(plan: PublishPlan): void {
    const plans = this.publishPlans();
    const index = plans.findIndex(p => p.id === plan.id);

    if (index === -1) {
      this.logger.warn('ProjectState', `Plan not found: ${plan.id}`);
      return;
    }

    const updatedPlan = { ...plan, updatedAt: new Date().toISOString() };
    const updatedPlans = [...plans];
    updatedPlans[index] = updatedPlan;
    this.publishPlans.set(updatedPlans);
    this.updatePublishPlans(updatedPlans);

    // Update any open tab for this plan
    this.tabManager.updatePublishPlanTab(updatedPlan);

    this.logger.info('ProjectState', `Updated publish plan: ${plan.name}`);
  }

  /**
   * Delete a publish plan.
   */
  deletePublishPlan(planId: string): void {
    const plans = this.publishPlans();
    const plan = plans.find(p => p.id === planId);

    if (!plan) {
      this.logger.warn('ProjectState', `Plan not found: ${planId}`);
      return;
    }

    const updatedPlans = plans.filter(p => p.id !== planId);
    this.publishPlans.set(updatedPlans);
    this.updatePublishPlans(updatedPlans);

    // Close any open tab for this plan
    this.tabManager.closeTabById(`publishPlan-${planId}`);

    this.logger.info('ProjectState', `Deleted publish plan: ${plan.name}`);
  }

  /**
   * Open a publish plan in a tab.
   */
  openPublishPlan(plan: PublishPlan): void {
    const result = this.tabManager.openPublishPlanTab(plan);
    if (result.wasCreated) {
      void this.saveOpenedDocumentsToCache();
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
        try {
          const icon = this.worldbuildingService.getIconForType(
            element.type,
            project.username,
            project.slug
          );
          const updatedElement = { ...element };
          updatedElement.metadata = { ...element.metadata, icon };
          this.tabManager.updateTabElement(element.id, updatedElement);
        } catch (err) {
          console.warn(`Failed to load icon for ${element.type}:`, err);
        }
      }
    }

    if (result.wasCreated) {
      void this.saveOpenedDocumentsToCache();
    }
  }

  openSystemTab(
    type:
      | 'documents-list'
      | 'media'
      | 'templates-list'
      | 'relationships-list'
      | 'tags-list'
      | 'settings'
      | 'home'
  ): { index: number; wasCreated: boolean } {
    const result = this.tabManager.openSystemTab(type);
    if (result.wasCreated) {
      void this.saveOpenedDocumentsToCache();
    }
    return { index: result.index, wasCreated: result.wasCreated };
  }

  /** Opens the home tab */
  openHomeTab(): void {
    this.openSystemTab('home');
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

  reorderTabs(fromIndex: number, toIndex: number): void {
    this.tabManager.reorderTabs(fromIndex, toIndex);
    void this.saveOpenedDocumentsToCache();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update project state and sync metadata via Yjs.
   * This enables offline-first editing of project name, description, and cover.
   *
   * @param project The updated project
   * @param coverMediaId Optional cover media ID (stored separately in Yjs)
   */
  updateProject(project: Project, coverMediaId?: string): void {
    const previousProject = this.project();
    const previousCoverMediaId = this.coverMediaId();
    this.project.set(project);

    // Update cover media ID if provided
    if (coverMediaId !== undefined) {
      this.coverMediaId.set(coverMediaId);
    }

    // Sync metadata changes to Yjs if provider is connected
    if (this.syncProvider?.isConnected()) {
      // Only update Yjs if metadata actually changed
      const metaChanged =
        previousProject?.title !== project.title ||
        previousProject?.description !== project.description ||
        (coverMediaId !== undefined && previousCoverMediaId !== coverMediaId);

      if (metaChanged) {
        const meta: {
          name: string;
          description: string;
          coverMediaId?: string;
        } = {
          name: project.title,
          description: project.description || '',
        };
        if (coverMediaId !== undefined) {
          meta.coverMediaId = coverMediaId;
        }
        // Set flag to prevent feedback loop from subscription
        this.isUpdatingMeta = true;
        this.syncProvider.updateProjectMeta(meta);
        this.logger.debug(
          'ProjectState',
          'Updated project metadata via Yjs sync'
        );
        // Clear flag after microtask to ensure subscription callback is fully skipped
        queueMicrotask(() => {
          this.isUpdatingMeta = false;
        });
      }
    }
  }

  updateSyncState(
    documentId: string,
    state: DocumentSyncState | undefined
  ): void {
    if (!documentId || !state) return;
    this.docSyncState.set(state);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dialog Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  showNewElementDialog(parentElement?: Element): void {
    void this.dialogGateway.openNewElementDialog().then(result => {
      if (result) {
        const newElementId = this.addElement(
          result.type,
          result.name,
          parentElement?.id,
          result.schemaId
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

  showNewFolderDialog(parentElement?: Element): void {
    void this.dialogGateway.openNewFolderDialog().then(result => {
      if (result) {
        const newElementId = this.addElement(
          ElementType.Folder,
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
        // Filter valid tabs and update element data with fresh data from elements()
        // This ensures properties like schemaId are up-to-date
        const validTabs = tabs
          .filter(tab => {
            if (tab.type === 'system') return true;
            return (
              tab.element &&
              currentElements.some(element => element.id === tab.id)
            );
          })
          .map(tab => {
            if (tab.type === 'system') return tab;
            // Update tab.element with fresh data from currentElements
            const freshElement = currentElements.find(el => el.id === tab.id);
            if (freshElement) {
              return { ...tab, element: freshElement };
            }
            return tab;
          });

        if (validTabs.length > 0) {
          const urlParams = window.location.pathname.split('/');
          const lastSegment = urlParams[urlParams.length - 1];
          let selectedIndex = 0;

          if (lastSegment === 'documents') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'documents-list'
            );
          } else if (lastSegment === 'media') {
            selectedIndex = validTabs.findIndex(t => t.systemType === 'media');
          } else if (lastSegment === 'templates') {
            selectedIndex = validTabs.findIndex(
              t => t.systemType === 'templates-list'
            );
          } else if (lastSegment && lastSegment !== project.slug) {
            // Match any element ID (slugs like 'doc-moonveil-accord' or UUIDs)
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

        // Open home tab first, then restored documents
        this.tabManager.openSystemTab('home');
        for (const doc of validDocuments) {
          this.tabManager.openDocument(doc);
        }
        // Select home tab
        this.tabManager.selectTab(0);
      } else {
        // No cached tabs or documents - open home tab by default
        this.tabManager.openSystemTab('home');
      }
    } catch (error) {
      this.logger.error(
        'ProjectState',
        'Failed to restore opened documents from cache',
        error
      );
      // On error, still open home tab
      this.tabManager.openSystemTab('home');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding
  // ─────────────────────────────────────────────────────────────────────────────

  private async initializeWorldbuildingForElement(
    element: Element
  ): Promise<void> {
    const project = this.project();
    if (element.id && project) {
      await this.worldbuildingService.initializeWorldbuildingElement(
        element,
        project.username,
        project.slug
      );
    }
  }

  private enrichElementsWithIcons(elements: Element[]): void {
    const project = this.project();
    if (!project) return;

    const customElements = elements.filter(
      el => el.type.startsWith('CUSTOM_') && !el.metadata?.['icon']
    );

    if (customElements.length === 0) return;

    for (const element of customElements) {
      try {
        const icon = this.worldbuildingService.getIconForType(
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

  /**
   * Sync open tabs with updated elements from Yjs.
   * Updates tab names when elements are renamed externally (e.g., via MCP).
   */
  private syncTabsWithElements(elements: Element[]): void {
    const openTabs = this.tabManager.openTabs();
    let anyUpdated = false;

    for (const tab of openTabs) {
      if (tab.element) {
        const updatedElement = elements.find(e => e.id === tab.element!.id);
        if (updatedElement && updatedElement.name !== tab.name) {
          this.tabManager.updateTabElement(tab.element.id, updatedElement);
          anyUpdated = true;
        }
      }
    }

    if (anyUpdated) {
      this.logger.debug(
        'ProjectState',
        'Synced tab names with updated elements'
      );
    }
  }
}
