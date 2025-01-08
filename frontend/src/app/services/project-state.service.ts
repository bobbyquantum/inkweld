import { computed, Injectable, signal } from '@angular/core';
import { ProjectDto, ProjectElementDto } from '@worm/index';
import { nanoid } from 'nanoid';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../models/document-sync-state';

/**
 * This service is an "all in" offline-first approach to managing
 * project + elements. Under the hood, it uses Yjs for real-time sync
 * and merges, but it still exposes the same signals + methods you had before.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectStateService {
  // ─────────────────────────────────────────────────────────────
  // Public signals (unchanged in shape)
  // ─────────────────────────────────────────────────────────────

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
  readonly getSyncState = computed(() => (): DocumentSyncState => {
    return this.docSyncState();
  });

  // ─────────────────────────────────────────────────────────────
  // Private signals + fields
  // ─────────────────────────────────────────────────────────────

  private readonly docSyncState = signal<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );

  private doc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private docId: string | null = null;

  // ─────────────────────────────────────────────────────────────
  // Public methods (same shape as your original ProjectStateService)
  // ─────────────────────────────────────────────────────────────

  /**
   * Initializes the Yjs doc for the given project. Once connected,
   * we load from local IndexedDB, then connect to the server for live sync.
   */
  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);
    console.log('Loading project:', username, slug);
    try {
      // Derive a unique docId for this project
      this.docId = `projectElements:${username}:${slug}`;

      // Create a new Y.Doc
      this.doc = new Y.Doc();

      // Step 1: Offline store
      this.indexeddbProvider = new IndexeddbPersistence(this.docId, this.doc);
      await this.indexeddbProvider.whenSynced;
      console.log('Local IndexedDB sync complete for docId:', this.docId);

      // Step 2: WebSocket provider
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProto}://${window.location.host}/ws/yjs?documentId=`;
      this.provider = new WebsocketProvider(wsUrl, this.docId, this.doc, {
        connect: true,
        resyncInterval: 10000,
      });

      // Step 3: Listen for connection status
      this.provider.on('status', ({ status }: { status: string }) => {
        console.log(`Doc ${this.docId} websocket status: ${status}`);
        if (status === 'connected') {
          this.docSyncState.set(DocumentSyncState.Synced);
        } else {
          this.docSyncState.set(DocumentSyncState.Offline);
        }
      });

      // Step 4: Load initial data from the doc into signals
      this.initializeLocalSignalsFromDoc();

      // Step 5: Observe future changes from Yjs
      this.observeDocChanges();
    } catch (err) {
      console.error('Failed to load project doc via Yjs:', err);
      this.error.set('Failed to load project');
      this.docSyncState.set(DocumentSyncState.Unavailable);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * In a purely Yjs approach, "loading elements" is basically
   * reading them from the doc. We'll keep this method for compatibility,
   * but it just refreshes from the doc now.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async loadProjectElements(username: string, slug: string): Promise<void> {
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
    // If we only ever have one doc, we can ignore the docId
    if (state !== undefined) {
      this.docSyncState.set(state);
    }
  }

  /**
   * Locally updates the elements array in the signals *and* in the Y.Doc.
   * Good for reordering, renaming, etc.
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
   * "Saving" in Yjs is basically just updating the doc.
   * The doc syncs automatically. We'll keep the method for API parity.
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
      // Just call updateElements for now
      this.updateElements(elements);
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

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Reads from the doc's data structures and initializes
   * the `project` and `elements` signals.
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
   * Observes the doc for changes to either the project map or the elements array,
   * and updates the relevant signals in real time.
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
   * Returns the Y.Map used to store top-level project metadata.
   * If it doesn't exist, we create it.
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
   * Returns the Y.Array of elements. Creates it if missing.
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
