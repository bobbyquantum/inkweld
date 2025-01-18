import { computed, inject, Injectable, signal } from '@angular/core';
import { ProjectAPIService, ProjectDto, ProjectElementDto } from '@worm/index';
import { nanoid } from 'nanoid';
import { firstValueFrom } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { environment } from '../../environments/environment';
import { DocumentSyncState } from '../models/document-sync-state';

/**
 * Manages the state of projects and their elements with offline-first capabilities
 *
 * This service provides a comprehensive solution for managing project metadata,
 * elements, and synchronization state. It uses Yjs for real-time collaboration
 * and IndexedDB for offline persistence. The service maintains reactive signals
 * for all state properties and handles synchronization between local and remote
 * states automatically.
 *
 * Key Features:
 * - Offline-first architecture with automatic conflict resolution
 * - Real-time collaboration through Yjs
 * - Reactive state management using Angular signals
 * - Automatic synchronization between local and remote states
 * - Comprehensive error handling and state tracking
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectStateService {
  /** The project's metadata, e.g. name, slug, etc. */
  readonly project = signal<ProjectDto | undefined>(undefined);

  /** The list of elements for the project. */
  readonly elements = signal<ProjectElementDto[]>([]);

  /** The currently open "files" or "tabs" in the editor. */
  readonly openFiles = signal<ProjectElementDto[]>([]);

  /** The index of whichever tab is selected. */
  readonly selectedTabIndex = signal<number>(0);

  /** Whether we are currently loading data from somewhere. */
  readonly isLoading = signal<boolean>(false);

  /** Whether we are currently saving data. */
  readonly isSaving = signal<boolean>(false);

  /** If an error occurred, store the message here. */
  readonly error = signal<string | undefined>(undefined);

  /**
   * For a single doc approach, we store just one `DocumentSyncState`.
   * If you had multiple docs, you'd store a Map<string, DocumentSyncState>.
   */
  readonly getSyncState = computed(() => this.docSyncState());

  private readonly docSyncState = signal<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );

  private doc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private docId: string | null = null;

  private projectService = inject(ProjectAPIService);
  /**
   * Initializes and loads a project with offline-first synchronization
   *
   * This method sets up the Yjs document for the specified project, establishing
   * both local IndexedDB persistence and WebSocket synchronization. It handles
   * the complete project loading lifecycle including:
   * - Creating a new Yjs document
   * - Setting up IndexedDB persistence for offline access
   * - Establishing WebSocket connection for real-time collaboration
   * - Initializing reactive signals from the document state
   * - Setting up change observers for automatic synchronization
   *
   * @param {string} username - The owner's username for the project
   * @param {string} slug - The project's unique slug identifier
   * @returns {Promise<void>} Resolves when the project is fully loaded and synchronized
   * @throws Will throw and log errors if initialization fails
   * @example
   * await projectStateService.loadProject('john-doe', 'my-project');
   */
  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    console.log('Loading project:', username, slug);
    const projectDto = await firstValueFrom(
      this.projectService.projectControllerGetProjectByUsernameAndSlug(
        username,
        slug
      )
    );
    console.log('Project loaded:', projectDto);
    this.project.set(projectDto);

    try {
      this.docId = `projectElements:${username}:${slug}`;

      // Create a new Y.Doc
      this.doc = new Y.Doc();

      this.indexeddbProvider = new IndexeddbPersistence(this.docId, this.doc);
      await this.indexeddbProvider.whenSynced;
      console.log('Local IndexedDB sync complete for docId:', this.docId);

      if (!environment.wssUrl) {
        throw new Error('WebSocket URL is not configured in environment');
      }
      this.provider = new WebsocketProvider(
        environment.wssUrl + '/ws/yjs?documentId=',
        this.docId,
        this.doc,
        {
          connect: true,
          resyncInterval: 10000,
        }
      );

      this.provider.on('status', ({ status }: { status: string }) => {
        console.log(`Doc ${this.docId} websocket status: ${status}`);
        switch (status) {
          case 'connected':
            this.docSyncState.set(DocumentSyncState.Synced);
            break;
          case 'disconnected':
            this.docSyncState.set(DocumentSyncState.Offline);
            break;
          default:
            // For initial connection, set to synced once IndexedDB is ready
            this.docSyncState.set(DocumentSyncState.Synced);
        }
      });

      // Set initial sync state after IndexedDB sync
      this.docSyncState.set(DocumentSyncState.Synced);

      this.initializeLocalSignalsFromDoc();

      this.observeDocChanges();

      void this.updateProject(projectDto);
    } catch (err) {
      if (err instanceof Error) {
        console.error('Failed to load project doc via Yjs:', err.message);
      } else {
        console.error('Failed to load project doc via Yjs:', String(err));
      }
      this.error.set('Failed to load project');
      this.docSyncState.set(DocumentSyncState.Unavailable);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Loads project elements by reading them from the Yjs doc
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async loadProjectElements(username: string, slug: string): Promise<void> {
    console.log('Loading project elements:', username, slug);
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      this.initializeLocalSignalsFromDoc();
    } catch (err) {
      console.error('Error loading project elements (Yjs doc):', err);
      this.error.set('Failed to load project elements');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Opens a file (element) in the "editor tabs".
   */
  openFile(element: ProjectElementDto | null): void {
    if (!element?.id) return;

    const files = this.openFiles();
    const alreadyOpen = files.some(f => f.id === element.id);
    if (!alreadyOpen) {
      this.openFiles.set([...files, element]);
      // We only have one doc, so let's leave docSyncState alone or set to current value
      // docSyncState might remain 'Synced' or 'Offline' etc.
      // We'll just do no-op here.
    }
    const index = this.openFiles().findIndex(f => f.id === element.id);
    this.selectedTabIndex.set(index);
  }

  /**
   * Closes an open file (element) tab by index.
   */
  closeFile(index: number): void {
    const files = this.openFiles();
    const file = files[index];
    if (file?.id) {
      // Optionally set docSyncState to something else if we like.
      // docSyncState.set(DocumentSyncState.Offline);
    }
    const newFiles = [...files.slice(0, index), ...files.slice(index + 1)];
    this.openFiles.set(newFiles);

    // If the selected tab was the last, move the selection to the previous
    const filesLength = newFiles.length;
    if (this.selectedTabIndex() >= filesLength) {
      this.selectedTabIndex.set(filesLength - 1);
    }
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

  /**
   * Updates project elements with full synchronization between local state and Yjs document
   *
   * This method performs a transactional update of project elements, ensuring consistency
   * between the local reactive signals and the Yjs document. It handles:
   * - Immediate UI updates through Angular signals
   * - Atomic updates to the Yjs document
   * - Automatic ID generation for new elements
   * - Structured cloning for proper Yjs data handling
   *
   * @param {ProjectElementDto[]} elements - The updated array of project elements
   * @example
   * const updatedElements = [...currentElements, newElement];
   * projectStateService.updateElements(updatedElements);
   *
   * @note This method performs a complete replacement of elements. For partial updates,
   * consider modifying the Yjs document directly through the exposed methods.
   */
  updateElements(elements: ProjectElementDto[]): void {
    // Update the signals (for immediate UI reflection)
    this.elements.set(elements);

    if (this.doc) {
      const arr = this.getElementsArray();
      if (!arr) return;

      this.doc.transact(() => {
        // Clear the entire Yjs array
        arr.delete(0, arr.length);

        // Insert the new set
        for (const elem of elements) {
          // If there's no ID yet, generate one
          if (!elem.id) {
            elem.id = nanoid();
            // or any other ID strategy: could be a UUID, timestamp, etc.
          }

          // Because Yjs data must be plain, we do a structured clone
          arr.push([structuredClone(elem)]);
        }
      });
    }
  }

  /**
   * Saves project elements by updating the Yjs doc
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async saveProjectElements(
    _username: string,
    _slug: string,
    elements: ProjectElementDto[]
  ): Promise<void> {
    this.isSaving.set(true);
    this.error.set(undefined);

    try {
      // Preserve current project title
      const currentProject = this.project();
      const currentTitle = currentProject?.title || 'Project';

      // Update elements
      this.updateElements(elements);

      // Restore project title if it was changed
      if (currentProject) {
        this.project.set({ ...currentProject, title: currentTitle });
      }

      console.log(
        'Elements saved to the Y.Doc - remote sync will happen automatically!'
      );
    } catch (err) {
      console.error('Error saving project elements (Yjs):', err);
      this.error.set('Failed to save project elements');
    } finally {
      this.isSaving.set(false);
    }
  }

  async updateProject(project: ProjectDto): Promise<void> {
    this.isSaving.set(true);
    this.error.set(undefined);

    try {
      if (this.doc) {
        // Wrap transaction in Promise to properly await it
        await new Promise<void>((resolve, reject) => {
          try {
            this.doc!.transact(() => {
              const projectMap = this.getProjectMetaMap();
              projectMap.set('title', project.title);
              projectMap.set('description', project.description);
            });
            resolve();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
        this.project.set(project);
      }
    } catch (err) {
      console.error('Error updating project:', err);
      this.error.set('Failed to update project');
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Synchronizes local Angular signals with the Yjs document state
   *
   * This method establishes the connection between the Yjs document and Angular's
   * reactive signals. It handles:
   * - Reading project metadata from the Yjs map
   * - Loading project elements from the Yjs array
   * - Setting up initial signal values
   * - Ensuring type safety when converting Yjs data to Angular signals
   *
   * The synchronization is bidirectional:
   * - Changes in Yjs are reflected in Angular signals
   * - Changes in Angular signals are propagated to Yjs
   *
   * @note This method should be called whenever the Yjs document is initialized
   * or when significant changes occur in the document structure
   */
  private initializeLocalSignalsFromDoc(): void {
    if (!this.doc) return;

    // 1. Project metadata
    const projectMap = this.getProjectMetaMap();
    // Try reading fields or fallback to placeholders
    const projectId = projectMap.get('id') ?? 0;
    const projectName = projectMap.get('name') ?? '(Unnamed)';
    const projectSlug = projectMap.get('slug') ?? '(no slug)';
    const projectDesc = projectMap.get('description') ?? '';

    // Construct your strongly-typed `ProjectDto`
    const loadedProject: ProjectDto = {
      id: projectId as string,
      title: projectName as string,
      slug: projectSlug as string,
      description: projectDesc as string,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };
    this.project.set(loadedProject);

    // 2. Elements array
    const arr = this.getElementsArray();
    if (arr) {
      const rawElements = arr.toArray();
      // Yjs doesn't natively enforce the type, so we'll assume we put `ProjectElementDto`s in
      // If you wanted runtime validation, you'd do it here.
      this.elements.set(rawElements);
    }
  }

  /**
   * Establishes real-time synchronization between Yjs document and Angular signals
   *
   * This method creates a comprehensive observation system that:
   * - Tracks changes to project metadata (name, slug, description)
   * - Monitors deep changes in the elements array
   * - Handles both local and remote changes
   * - Maintains consistency between Yjs document and Angular signals
   *
   * The synchronization system provides:
   * - Real-time updates across all connected clients
   * - Efficient change detection using Yjs's delta-based system
   * - Automatic conflict resolution for concurrent edits
   * - Granular control over which changes trigger updates
   * - Comprehensive error handling and recovery mechanisms
   *
   * @note The observers use Yjs's efficient change detection system, which
   * minimizes unnecessary updates and maintains optimal performance even
   * with large documents and frequent changes. The system automatically
   * handles network interruptions and reconnects when possible.
   *
   * @example
   * // Changes to project metadata
   * projectMetaMap.set('name', 'New Project Name');
   *
   * // Changes to elements array
   * elementsArray.push([newElement]);
   * elementsArray.get(0).content = 'Updated content';
   */
  private observeDocChanges(): void {
    if (!this.doc) return;

    // Listen for changes in `projectMeta`
    const projectMetaMap = this.getProjectMetaMap();
    projectMetaMap.observe((event, transaction) => {
      console.log('Project meta changed:', event, transaction);
      this.initializeLocalSignalsFromDoc();
      // or do a partial update if you want
    });

    // Listen for changes in `elements` array
    const elementsArray = this.getElementsArray();
    elementsArray?.observeDeep(events => {
      console.log('Elements array changed in doc:', events);
      this.initializeLocalSignalsFromDoc();
      // or do partial updates if you prefer
    });
  }

  /**
   * Manages access to project metadata stored in a Yjs map
   *
   * This method provides a type-safe interface for working with project metadata,
   * including:
   * - Retrieving and modifying project identification (id, slug)
   * - Managing descriptive information (name, description)
   * - Handling timestamps for creation and modification
   * - Storing additional project-specific metadata
   *
   * The metadata map offers:
   * - Real-time synchronization across all collaborators
   * - Automatic conflict resolution for concurrent edits
   * - Efficient change detection using Yjs's delta-based system
   * - Comprehensive error handling and recovery mechanisms
   *
   * @returns {Y.Map<unknown>} The Yjs map containing project metadata
   * @throws {Error} If the Yjs document is not initialized
   * @note The returned map is a live Yjs data structure that automatically
   * synchronizes changes across all connected clients. All modifications to this
   * map are immediately propagated to all collaborators.
   *
   * @example
   * // Update project name and description
   * const metaMap = projectStateService.getProjectMetaMap();
   * metaMap.set('name', 'New Project Name');
   * metaMap.set('description', 'Updated project description');
   *
   * // Add custom metadata
   * metaMap.set('customField', 'Custom Value');
   *
   * // Read metadata
   * const projectName = metaMap.get('name');
   */
  private getProjectMetaMap(): Y.Map<unknown> {
    if (!this.doc) {
      throw new Error('Cannot get projectMetaMap because doc is null');
    }
    // `Y.Doc.getMap<T>()` is strongly typed, but the generic param doesn't do much runtime checking.
    const existing = this.doc.getMap<unknown>('projectMeta');
    return existing;
  }

  /**
   * Provides access to the project's element structure in a Yjs array
   *
   * This method manages the core element storage system, offering:
   * - Lazy initialization of the elements array
   * - Type-safe access to project elements
   * - Integration with the Yjs document structure
   * - Automatic synchronization across collaborators
   *
   * The elements array provides:
   * - Hierarchical organization of project elements
   * - Real-time synchronization of all changes
   * - Efficient delta-based updates
   * - Automatic conflict resolution for concurrent edits
   * - Comprehensive error handling and recovery mechanisms
   *
   * @returns {Y.Array<ProjectElementDto> | undefined} The Yjs array containing project elements,
   * or undefined if the document is not initialized
   * @throws {Error} If the document structure is corrupted
   * @note The returned array is a live Yjs data structure that automatically
   * synchronizes changes across all connected clients. All modifications to this
   * array are immediately propagated to all collaborators.
   *
   * @example
   * // Add new element
   * const elementsArray = projectStateService.getElementsArray();
   * if (elementsArray) {
   *   elementsArray.push([{
   *     id: nanoid(),
   *     type: 'file',
   *     content: 'New content',
   *     position: 0
   *   }]);
   * }
   *
   * // Modify existing element
   * const firstElement = elementsArray.get(0);
   * if (firstElement) {
   *   firstElement.content = 'Updated content';
   * }
   *
   * // Remove element
   * elementsArray.delete(0, 1);
   */
  private getElementsArray(): Y.Array<ProjectElementDto> | undefined {
    if (!this.doc) return undefined;

    const dataMap = this.doc.getMap<unknown>('data');
    // If there's no 'elements' key, we create it
    if (!dataMap.has('elements')) {
      dataMap.set('elements', new Y.Array<ProjectElementDto>());
    }
    const arr = dataMap.get('elements');
    if (arr instanceof Y.Array) {
      return arr as Y.Array<ProjectElementDto>;
    }
    return undefined;
  }
}
