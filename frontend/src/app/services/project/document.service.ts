import {
  inject,
  Injectable,
  NgZone,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { Editor } from '@bobbyquantum/ngx-editor';
import { DocumentsService } from '@inkweld/index';
import { Plugin } from 'prosemirror-state';
import { Observable } from 'rxjs';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import {
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import {
  createElementRefPlugin,
  ElementRefService,
} from '../../components/element-ref';
import {
  createImagePastePlugin,
  extractMediaId,
  generateMediaId,
  isMediaUrl,
} from '../../components/image-paste';
import { LintApiService } from '../../components/lint/lint-api.service';
import { createLintPlugin } from '../../components/lint/lint-plugin';
import { DocumentSyncState } from '../../models/document-sync-state';
import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { SystemConfigService } from '../core/system-config.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import {
  createAuthenticatedWebsocketProvider,
  setupReauthentication,
} from '../sync/authenticated-websocket-provider';
import { UnifiedUserService } from '../user/unified-user.service';
import { ProjectStateService } from './project-state.service';

/**
 * Constants for reconnection logic
 */
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * Represents an active Yjs document connection
 */
export interface DocumentConnection {
  /** The Yjs document instance */
  ydoc: Y.Doc;
  /** WebSocket provider for real-time sync (null in offline mode) */
  provider: WebsocketProvider | null;
  /** XML fragment used for ProseMirror content */
  type: Y.XmlFragment;
  /** IndexedDB provider for offline persistence */
  indexeddbProvider: IndexeddbPersistence;
}

/**
 * Represents a ProseMirror JSON node for conversion to XML.
 */
interface ProseMirrorNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
}

/**
 * Manages Yjs document connections for collaborative editing
 *
 * Handles WebSocket connections, IndexedDB persistence, and ProseMirror integration
 * for real-time collaborative document editing. Maintains connections to multiple
 * documents and provides synchronization status updates.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private documentsService = inject(DocumentsService);
  private authTokenService = inject(AuthTokenService);
  private setupService = inject(SetupService);
  private ngZone = inject(NgZone);
  private systemConfigService = inject(SystemConfigService);
  private projectStateService = inject(ProjectStateService);
  private lintApiService = inject(LintApiService);
  private elementRefService = inject(ElementRefService);
  private logger = inject(LoggerService);
  private userService = inject(UnifiedUserService);
  private offlineStorage = inject(OfflineStorageService);

  private connections: Map<string, DocumentConnection> = new Map();

  private unsyncedChanges = new Map<string, boolean>();
  /** Reactive sync status signals per document */
  private syncStatusSignals = new Map<
    string,
    WritableSignal<DocumentSyncState>
  >();
  /** Reactive word count signals per document */
  private wordCountSignals = new Map<string, WritableSignal<number>>();
  /** Track reconnect timeouts to cancel them on disconnect */
  private reconnectTimeouts = new Map<string, number>();

  constructor() {
    // Ensure awareness is cleaned up when the browser tab/window closes
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.connections.forEach((connection, documentId) => {
          if (connection.provider) {
            this.logger.debug(
              'DocumentService',
              `Cleaning up awareness for ${documentId} on page unload`
            );
            connection.provider.awareness.setLocalState(null);
          }
        });
      });
    }
  }

  /**
   * Gets reactive sync status signal for a document
   */
  getSyncStatusSignal(documentId: string): Signal<DocumentSyncState> {
    this.initializeSyncStatus(documentId);
    return this.syncStatusSignals.get(documentId)!;
  }

  /**
   * Initializes sync status for a document without setting up full collaboration
   * This is used to ensure sync indicators appear in the tab interface
   */
  initializeSyncStatus(documentId: string): void {
    if (!this.syncStatusSignals.has(documentId)) {
      this.logger.debug(
        'DocumentService',
        `Explicitly initializing sync status for ${documentId}`
      );
      this.syncStatusSignals.set(documentId, signal(DocumentSyncState.Offline));
    }
  }

  /**
   * Checks if a document has unsynced changes
   * @param documentId - The document ID to check
   * @returns True if there are changes that haven't been synced to the server
   */
  hasUnsyncedChanges(documentId: string): boolean {
    return this.unsyncedChanges.get(documentId) || false;
  }

  /**
   * Gets reactive word count signal for a document
   */
  getWordCountSignal(documentId: string): Signal<number> {
    if (!this.wordCountSignals.has(documentId)) {
      this.wordCountSignals.set(documentId, signal(0));
    }
    return this.wordCountSignals.get(documentId)!;
  }

  /**
   * Updates the word count for a document
   * @param documentId - The document ID
   * @param count - New word count
   */
  updateWordCount(documentId: string, count: number): void {
    this.ngZone.run(() => {
      if (this.wordCountSignals.has(documentId)) {
        this.wordCountSignals.get(documentId)!.set(count);
      } else {
        this.wordCountSignals.set(documentId, signal(count));
      }
    });
  }

  /**
   * Exports the content of a document
   * @param documentId - The document ID to export
   * @returns Observable<unknown> that emits the document content
   */
  exportDocument(documentId: string): Observable<unknown> {
    const connection = this.connections.get(documentId);
    if (!connection) {
      throw new Error(`No connection found for document ${documentId}`);
    }
    return new Observable(observer => {
      observer.next(connection.type.toJSON());
      observer.complete();
    });
  }

  /**
   * Gets the Yjs document instance for a document.
   *
   * Returns the active connection's ydoc if connected, or creates a temporary
   * one from IndexedDB for snapshot purposes.
   *
   * @param documentId - The document ID
   * @returns The Yjs document or null if not found
   */
  async getYDoc(documentId: string): Promise<Y.Doc | null> {
    // First try: Active connection
    const connection = this.connections.get(documentId);
    if (connection) {
      return connection.ydoc;
    }

    // Second try: Load from IndexedDB (for snapshots of non-active documents)
    this.logger.debug(
      'DocumentService',
      `Loading Yjs doc from IndexedDB for snapshot: ${documentId}`
    );

    const ydoc = new Y.Doc();
    const provider = new IndexeddbPersistence(documentId, ydoc);

    try {
      await provider.whenSynced;

      // Check if we actually have content
      const prosemirror = ydoc.getXmlFragment('prosemirror');
      if (prosemirror.length === 0) {
        this.logger.debug(
          'DocumentService',
          `No content found in IndexedDB for ${documentId}`
        );
        await provider.destroy();
        ydoc.destroy();
        return null;
      }

      // Note: We return the ydoc here - caller is responsible for cleanup
      // The provider is attached to the ydoc, so destroying ydoc will cleanup
      return ydoc;
    } catch (error) {
      this.logger.warn(
        'DocumentService',
        `Error loading Yjs doc from IndexedDB: ${documentId}`,
        error
      );
      try {
        await provider.destroy();
        ydoc.destroy();
      } catch {
        // Ignore cleanup errors
      }
      return null;
    }
  }

  /**
   * Gets all active document connections for presence awareness.
   *
   * Returns an array of connections that have active WebSocket providers,
   * useful for tracking user presence across collaborative documents.
   *
   * @returns Array of active document connections with their providers
   */
  getActiveConnections(): DocumentConnection[] {
    return Array.from(this.connections.values()).filter(
      conn => conn.provider !== null
    );
  }

  /**
   * Gets document content as ProseMirror-compatible JSON.
   *
   * This is the single abstraction point for retrieving document content.
   * It handles both connected documents (via active Yjs connection) and
   * offline documents (via IndexedDB persistence).
   *
   * Use this method instead of directly accessing Yjs or IndexedDB.
   *
   * @param documentId - The full document ID (username:slug:elementId)
   * @returns Promise resolving to the document content as JSON, or null if not found
   */
  async getDocumentContent(documentId: string): Promise<unknown> {
    // First try: Active connection
    const connection = this.connections.get(documentId);
    if (connection) {
      this.logger.debug(
        'DocumentService',
        `Getting content from active connection: ${documentId}`
      );
      // Use y-prosemirror to convert XmlFragment to ProseMirror JSON format
      const json = yXmlFragmentToProsemirrorJSON(connection.type);
      return json?.['content'] ?? [];
    }

    // Second try: Load from IndexedDB
    this.logger.debug(
      'DocumentService',
      `Loading content from IndexedDB: ${documentId}`
    );
    return this.loadContentFromIndexedDB(documentId);
  }

  /**
   * Loads document content directly from IndexedDB.
   *
   * Creates a temporary Yjs document and IndexedDB provider to read
   * the persisted content, then immediately cleans up.
   *
   * @param documentId - The full document ID
   * @returns Promise resolving to the document content, or null if empty/not found
   */
  private async loadContentFromIndexedDB(documentId: string): Promise<unknown> {
    const ydoc = new Y.Doc();
    const provider = new IndexeddbPersistence(documentId, ydoc);

    try {
      await provider.whenSynced;

      // First check for imported content (from project import)
      const importedContentMap = ydoc.getMap<unknown>('importedContent');
      const importedContent = importedContentMap.get('content');
      if (importedContent) {
        this.logger.debug(
          'DocumentService',
          `Found imported content for ${documentId}, returning it`
        );
        return importedContent;
      }

      // Otherwise load from prosemirror XmlFragment
      const fragment = ydoc.getXmlFragment('prosemirror');

      if (fragment.length === 0) {
        this.logger.debug(
          'DocumentService',
          `Document ${documentId} has no content in IndexedDB`
        );
        return null;
      }

      // Use y-prosemirror to convert XmlFragment to ProseMirror JSON format
      const json = yXmlFragmentToProsemirrorJSON(fragment);
      const content = (json?.['content'] ?? []) as unknown[];
      this.logger.debug(
        'DocumentService',
        `Loaded content from IndexedDB: ${documentId}`
      );
      return content;
    } finally {
      // Clean up temporary resources
      try {
        await provider.destroy();
        ydoc.destroy();
      } catch (error) {
        this.logger.warn(
          'DocumentService',
          `Error cleaning up temp IndexedDB provider for ${documentId}`,
          error
        );
      }
    }
  }

  /**
   * Imports content into a document, replacing existing content.
   * This will propagate changes to all connected users and update IndexedDB.
   * @param documentId - The document ID to import into
   * @param content - The content to import, as a JSON string
   */
  importDocument(documentId: string, content: string): void {
    const connection = this.connections.get(documentId);
    if (!connection) {
      throw new Error(`No connection found for document ${documentId}`);
    }

    this.importXmlString(connection.ydoc, connection.type, content);
  }

  /**
   * Import XML content into a Yjs XmlFragment.
   *
   * This properly handles nested elements and attributes, including
   * inline nodes like elementRef. Uses forward CRDT operations to ensure
   * proper propagation through Yjs to all clients.
   */
  importXmlString(ydoc: Y.Doc, fragment: Y.XmlFragment, xmlString: string) {
    // Ensure the string has a single root element by wrapping it.
    const wrapped = `<root>${xmlString}</root>`;
    const parser = new DOMParser();
    const dom = parser.parseFromString(wrapped, 'text/xml');
    const root = dom.documentElement;

    // Begin a Yjs transaction to update the fragment.
    Y.transact(ydoc, () => {
      // Clear existing content
      fragment.delete(0, fragment.length);
      this.logger.debug('DocumentService', 'Cleared previous doc');
      // Traverse each child element of our temporary root.
      for (let i = 0; i < root.childNodes.length; i++) {
        const node = root.childNodes[i];
        const yNode = this.domNodeToYjsNode(node);
        if (yNode) {
          // Append the created node to the fragment using forward CRDT operation.
          fragment.push([yNode]);
        }
      }
    });
  }

  /**
   * Recursively convert a DOM Node to a Yjs XmlElement or XmlText.
   * Properly handles nested elements and attributes.
   */
  private domNodeToYjsNode(node: Node): Y.XmlElement | Y.XmlText | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim() === '' && text !== ' ') {
        // Skip whitespace-only text nodes (but preserve single spaces)
        return null;
      }
      const yText = new Y.XmlText();
      yText.insert(0, text);
      return yText;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      // Keep the original case of node names - ProseMirror schema uses camelCase (e.g., elementRef)
      const yElement = new Y.XmlElement(element.nodeName);

      // Copy all attributes from the DOM element
      for (const attr of Array.from(element.attributes)) {
        // Parse attribute values that might be JSON
        let value: string | number | boolean | object = attr.value;
        try {
          // Try to parse as JSON for complex values (like objects)
          const parsed = JSON.parse(attr.value) as unknown;
          if (
            typeof parsed === 'object' ||
            typeof parsed === 'number' ||
            typeof parsed === 'boolean'
          ) {
            value = parsed as string | number | boolean | object;
          }
        } catch {
          // Keep as string if not valid JSON
        }
        yElement.setAttribute(attr.name, value as string);
      }

      // Recursively process children
      const children: (Y.XmlElement | Y.XmlText)[] = [];
      for (let i = 0; i < element.childNodes.length; i++) {
        const childNode = this.domNodeToYjsNode(element.childNodes[i]);
        if (childNode) {
          children.push(childNode);
        }
      }

      if (children.length > 0) {
        yElement.insert(0, children);
      }

      return yElement;
    }

    return null;
  }

  /**
   * Converts ProseMirror JSON content to an XML string for import.
   *
   * This is used when importing project archives - the content is stored
   * as ProseMirror JSON, and we need to convert it to XML to apply it
   * to the Yjs XmlFragment using forward CRDT operations.
   *
   * @param content - ProseMirror JSON content (the content array or full doc)
   * @returns XML string representation, or null if content is empty/invalid
   */
  private prosemirrorJsonToXml(content: unknown): string | null {
    if (!content) return null;

    // Handle both full doc format { type: 'doc', content: [...] } and just content array
    const contentArray = Array.isArray(content)
      ? content
      : (content as { content?: unknown[] }).content;

    if (
      !contentArray ||
      !Array.isArray(contentArray) ||
      contentArray.length === 0
    ) {
      return null;
    }

    const parts: string[] = [];
    for (const node of contentArray) {
      parts.push(this.prosemirrorNodeToXml(node as ProseMirrorNode));
    }
    return parts.join('');
  }

  /**
   * Recursively converts a ProseMirror node to XML.
   */
  private prosemirrorNodeToXml(node: ProseMirrorNode): string {
    if (!node || typeof node !== 'object') return '';

    // Text node
    if (node.type === 'text' && typeof node.text === 'string') {
      // Escape XML special characters
      return this.escapeXml(node.text);
    }

    // Element node
    const tagName = node.type || 'paragraph';
    const attrs = node.attrs || {};

    // Build attribute string
    const attrParts: string[] = [];
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null && value !== undefined) {
        // Serialize objects as JSON, primitives as strings
        let strValue: string;
        if (typeof value === 'object') {
          strValue = JSON.stringify(value);
        } else if (typeof value === 'string') {
          strValue = value;
        } else {
          strValue = String(value as string | number | boolean);
        }
        attrParts.push(`${key}="${this.escapeXml(strValue)}"`);
      }
    }
    const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';

    // Build children
    const children = node.content || [];
    if (children.length === 0) {
      return `<${tagName}${attrStr}/>`;
    }

    const childXml = children
      .map(child => this.prosemirrorNodeToXml(child))
      .join('');
    return `<${tagName}${attrStr}>${childXml}</${tagName}>`;
  }

  /**
   * Escapes special XML characters.
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Opens a document as HTML in a new browser tab
   *
   * Uses the API endpoint that directly returns the HTML representation
   * of the document, instead of generating HTML client-side.
   *
   * @param username - The username of the document owner
   * @param projectSlug - The project slug
   * @param documentId - The document ID to render as HTML
   */
  openDocumentAsHtml(
    username: string,
    projectSlug: string,
    documentId: string
  ): void {
    // Extract ID parts if we have a full ID (docName:username:projectSlug)
    let docName = documentId;
    if (documentId.includes(':')) {
      const parts = documentId.split(':');
      if (parts.length === 3) {
        username = parts[0];
        projectSlug = parts[1];
        docName = parts[2];
      }
    }
    this.documentsService
      .renderDocumentAsHtml(username, projectSlug, docName)
      .subscribe({
        next: (response: string) => {
          const blob = new Blob([response], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        },
      });

    // // Directly open the API endpoint URL in a new tab
    // const url = `/api/v1/projects/${username}/${projectSlug}/docs/${docName}/html`;
    // window.open(url, '_blank');
  }

  /**
   * Sets up collaborative editing for a document
   * @param editor - The editor instance to enable collaboration on
   * @param documentId - Unique identifier for the document
   * @returns Promise that resolves when collaboration is set up
   */
  async setupCollaboration(editor: Editor, documentId: string): Promise<void> {
    console.log('[DocumentService] setupCollaboration called for:', documentId);
    console.log(
      '[DocumentService] editor doc size BEFORE:',
      editor.view?.state.doc.content.size
    );

    // Validate documentId format (must be username:slug:docId)
    if (!documentId || documentId === 'invalid' || !documentId.includes(':')) {
      this.logger.error(
        'DocumentService',
        `Invalid documentId format: "${documentId}" - must be username:slug:docId`
      );
      throw new Error(`Invalid documentId format: ${documentId}`);
    }

    const parts = documentId.split(':');
    if (parts.length !== 3 || parts.some(part => !part.trim())) {
      this.logger.error(
        'DocumentService',
        `Invalid documentId parts: "${documentId}" - each part must be non-empty`
      );
      throw new Error(`Invalid documentId: ${documentId}`);
    }

    // Check if editor is properly initialized
    if (!editor || !editor.view) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Check if we already have a connection for this document
    let connection = this.connections.get(documentId);

    // If connection exists and editor already has y-sync plugin, don't re-add plugins
    if (
      connection &&
      editor.view.state.plugins.some(p => {
        const key = p.spec?.key;
        if (!key) return false;
        if (typeof key === 'string') return key === 'y-sync$';
        // PluginKey - check the key property name via string representation
        return 'key' in key && (key as { key: string }).key === 'y-sync$';
      })
    ) {
      this.logger.info(
        'DocumentService',
        `Collaboration already set up for ${documentId}, skipping plugin setup`
      );
      return;
    }

    if (!connection) {
      // Ensure sync status signal exists before updates
      this.initializeSyncStatus(documentId);

      // Create new connection if one doesn't exist
      const ydoc = new Y.Doc();
      const type = ydoc.getXmlFragment('prosemirror');
      // Initialize IndexedDB provider first
      const indexeddbProvider = new IndexeddbPersistence(documentId, ydoc);
      this.logger.debug('DocumentService', 'Waiting for IndexedDB sync...');

      // Set state to Offline while waiting for IndexedDB
      this.updateSyncStatus(documentId, DocumentSyncState.Offline);

      // Wait for initial IndexedDB sync
      await indexeddbProvider.whenSynced;
      this.logger.debug('DocumentService', 'IndexedDB sync complete');
      console.log(
        '[DocumentService] IndexedDB synced, ydoc XML fragment:',
        type.toJSON()
      );
      console.log(
        '[DocumentService] Editor doc size AFTER sync:',
        editor.view?.state.doc.content.size
      );

      // Check for imported content from project import
      // This is content stored as JSON in importedContentMap that needs to be
      // applied to the XmlFragment using forward CRDT operations
      const importedContentMap = ydoc.getMap<unknown>('importedContent');
      const importedContent = importedContentMap.get('content');
      if (importedContent && type.length === 0) {
        this.logger.info(
          'DocumentService',
          `Found imported content for ${documentId}, applying to XmlFragment`
        );
        // Convert the JSON content to XML and apply it
        const xmlContent = this.prosemirrorJsonToXml(importedContent);
        if (xmlContent) {
          this.importXmlString(ydoc, type, xmlContent);
          // Clear the importedContent map now that we've applied it
          ydoc.transact(() => {
            importedContentMap.delete('content');
            importedContentMap.delete('importedAt');
          });
          this.logger.debug(
            'DocumentService',
            `Applied imported content and cleared importedContentMap`
          );
        }
      }

      // Try to setup WebSocket provider if URL is available
      let provider: WebsocketProvider | null = null;
      const websocketUrl = this.setupService.getWebSocketUrl();

      if (websocketUrl) {
        // Update state to Syncing while establishing WebSocket connection
        this.updateSyncStatus(documentId, DocumentSyncState.Syncing);

        // Make sure the documentId is properly formatted for WebSocket URL
        // Remove any leading '/' characters that might cause URL issues
        const formattedDocId = documentId.replace(/^\/+/, '');
        this.logger.debug(
          'DocumentService',
          `Setting up WebSocket connection for document: ${formattedDocId}`
        );

        // Get auth token for WebSocket authentication
        const authToken = this.authTokenService.getToken();
        if (authToken) {
          // Create authenticated WebSocket connection
          // The server expects the auth token as the first text message after connection
          const wsUrl = `${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`;

          try {
            provider = await createAuthenticatedWebsocketProvider(
              wsUrl,
              '', // Empty room name - documentId is already in URL
              ydoc,
              authToken,
              {
                resyncInterval: 10000, // Attempt to resync every 10 seconds when offline
              }
            );

            // Authentication succeeded - we're now connected and synced
            // Set state immediately since the "connected" event already fired during auth
            this.updateSyncStatus(documentId, DocumentSyncState.Synced);

            // Set up re-authentication for reconnections
            setupReauthentication(
              provider,
              () => this.authTokenService.getToken(),
              error => {
                this.logger.error(
                  'DocumentService',
                  `WebSocket auth error: ${error}`
                );
                this.updateSyncStatus(
                  documentId,
                  DocumentSyncState.Unavailable
                );
              }
            );
          } catch (error) {
            this.logger.error(
              'DocumentService',
              'Failed to establish authenticated WebSocket connection',
              error
            );
            this.updateSyncStatus(documentId, DocumentSyncState.Offline);
            // Continue without WebSocket - will use IndexedDB only
            // NOTE: Don't set provider, it remains null
          }
        } else {
          this.logger.error(
            'DocumentService',
            'No auth token available for WebSocket connection'
          );
          this.updateSyncStatus(documentId, DocumentSyncState.Offline);
          // Continue without WebSocket - will use IndexedDB only
        }

        // Only set up WebSocket-specific handlers if provider was successfully created
        if (provider) {
          // Set user information for awareness (collaborative cursors)
          const currentUser = this.userService.currentUser();
          if (currentUser?.username && provider.awareness.setLocalStateField) {
            provider.awareness.setLocalStateField('user', {
              name: currentUser.username,
              color: this.generateUserColor(currentUser.username),
            });
            this.logger.debug(
              'DocumentService',
              `Set awareness for ${currentUser.username}, clientID: ${provider.awareness.clientID}`
            );
          }

          // Track unsynced changes by listening to Yjs document updates
          this.unsyncedChanges.set(documentId, false);
          const providerRef = provider; // Capture for closure
          ydoc.on(
            'update',
            (
              update: Uint8Array,
              origin: unknown,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              doc: Y.Doc,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              transaction: unknown
            ) => {
              // Only mark as unsynced if the change originated locally
              if (origin !== providerRef) {
                this.unsyncedChanges.set(documentId, true);
              }
            }
          );

          // Track connection attempts for exponential backoff
          let reconnectAttempts = 0;
          let reconnectTimeout: number | null = null;

          // Handle connection status with enhanced logging
          provider.on('status', ({ status }: { status: string }) => {
            this.logger.debug(
              'DocumentService',
              `WebSocket status for document ${documentId}: ${status}`
            );

            // Log WebSocket URL and connection parameters
            if (status === 'connecting') {
              this.logger.debug(
                'DocumentService',
                `Connecting to WebSocket URL: ${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`
              );
            } else if (status === 'connected') {
              this.logger.info(
                'DocumentService',
                `Successfully connected to WebSocket server for ${documentId}`
              );
              reconnectAttempts = 0;
              if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
              }
              this.reconnectTimeouts.delete(documentId);
            } else if (status === 'disconnected') {
              // Check if document was intentionally disconnected
              if (!this.connections.has(documentId)) {
                return;
              }

              this.logger.warn(
                'DocumentService',
                `Disconnected from WebSocket server for ${documentId}. Will attempt reconnect.`
              );

              // Exponential backoff for reconnection
              if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(
                  INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
                  MAX_RECONNECT_DELAY
                );

                reconnectTimeout = window.setTimeout(() => {
                  // Verify connection still exists before reconnecting
                  if (!this.connections.has(documentId)) {
                    return;
                  }

                  providerRef.connect();
                  reconnectAttempts++;
                }, delay);

                this.reconnectTimeouts.set(documentId, reconnectTimeout);
              } else {
                this.logger.warn(
                  'DocumentService',
                  'Max reconnection attempts reached'
                );
              }
            }

            const newState =
              status === 'connected'
                ? DocumentSyncState.Synced
                : DocumentSyncState.Offline;
            this.updateSyncStatus(documentId, newState);

            // When we reconnect successfully, clear the unsynced changes flag
            if (newState === DocumentSyncState.Synced) {
              this.unsyncedChanges.set(documentId, false);
            }
          });

          // Handle connection errors with enhanced debugging
          provider.on('connection-error', (error: Error | string | Event) => {
            const errorMessage =
              error instanceof Error
                ? error.message
                : typeof error === 'string'
                  ? error
                  : error.type;

            this.logger.warn(
              'DocumentService',
              `WebSocket connection error for ${documentId}`,
              errorMessage
            );
            this.logger.debug(
              'DocumentService',
              `Connection details: URL=${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`
            );

            if (error instanceof Error && error.stack) {
              this.logger.debug(
                'DocumentService',
                `Error stack: ${error.stack}`
              );
            }

            // Check for authentication errors
            if (
              errorMessage.includes('401') ||
              errorMessage.includes('Unauthorized') ||
              errorMessage.includes('Invalid session')
            ) {
              this.logger.error(
                'DocumentService',
                'Authentication error on WebSocket, session may have expired'
              );
              this.updateSyncStatus(documentId, DocumentSyncState.Unavailable);
              // Notify project state service about auth error
              this.projectStateService.updateSyncState(
                documentId,
                DocumentSyncState.Unavailable
              );
              // Stop retry attempts on auth errors
              if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
              }
              reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
              return; // Don't set to Offline for auth errors
            }

            // If the error is related to CORS or connection refused, provide more guidance
            if (
              errorMessage.includes('CORS') ||
              errorMessage.includes('refused')
            ) {
              this.logger.error(
                'DocumentService',
                'WebSocket connection refused. Check if server is running and CORS is properly configured.'
              );
            }

            this.updateSyncStatus(documentId, DocumentSyncState.Offline);
          });

          // Setup automatic reconnection when online
          const handleOnline = () => {
            this.logger.info(
              'DocumentService',
              'Network connection restored, attempting to reconnect...'
            );
            reconnectAttempts = 0; // Reset attempts on network restore
            providerRef.connect();
          };

          window.addEventListener('online', handleOnline);
        } // end if (provider)
      } else {
        // No WebSocket URL available - staying in offline mode
        this.logger.info(
          'DocumentService',
          `No WebSocket URL configured, document ${documentId} will remain in offline mode`
        );
        this.updateSyncStatus(documentId, DocumentSyncState.Offline);
      }

      connection = { ydoc, provider, type, indexeddbProvider };
      this.connections.set(documentId, connection);
    }

    // Get the underlying ProseMirror view
    const view = editor.view;
    if (!connection.type) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Add collaboration plugins to the existing editor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const plugins: Plugin<any>[] = [
      ySyncPlugin(connection.type),
      yUndoPlugin(),
    ];

    // Add cursor plugin only if we have a WebSocket provider
    if (connection.provider) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      plugins.push(yCursorPlugin(connection.provider.awareness));
    }

    // Add the linting plugin
    if (this.systemConfigService.isAiLintingEnabled()) {
      const lintPlugin = createLintPlugin(this.lintApiService);
      plugins.push(lintPlugin);
    }

    // Add the element reference plugin for @ mentions
    const elementRefPlugin = createElementRefPlugin({
      onOpen: (position: { x: number; y: number }, query: string) => {
        this.elementRefService.openPopup(position, query);
      },
      onClose: () => {
        this.elementRefService.closePopup();
      },
      onQueryChange: (query: string) => {
        this.elementRefService.setSearchQuery(query);
      },
      onRefClick: event => {
        // Delegate to ElementRefService for context menu handling
        this.elementRefService.handleRefClick(event);
      },
      onRefHover: data => {
        // Show tooltip on element ref hover
        this.elementRefService.showTooltip(data);
      },
      onRefHoverEnd: () => {
        // Hide tooltip when hover ends
        this.elementRefService.hideTooltip();
      },
    });
    plugins.push(elementRefPlugin);

    // Store editor view in ElementRefService for context menu operations
    this.elementRefService.setEditorView(view);

    // Add image paste plugin for saving pasted images to media library
    const imagePastePlugin = createImagePastePlugin({
      saveImage: async (blob: Blob, _mimeType: string) => {
        const projectKey = this.getProjectKey();
        if (!projectKey) {
          throw new Error('No project key available for saving image');
        }
        const mediaId = generateMediaId();
        await this.offlineStorage.saveMedia(projectKey, mediaId, blob);
        this.logger.debug(
          'DocumentService',
          `Saved pasted image as ${mediaId} in ${projectKey}`
        );
        return mediaId;
      },
      getImageUrl: async (mediaId: string) => {
        const projectKey = this.getProjectKey();
        if (!projectKey) return null;
        return await this.offlineStorage.getMediaUrl(projectKey, mediaId);
      },
      getProjectKey: () => this.getProjectKey(),
    });
    plugins.push(imagePastePlugin);

    // Add word count tracking plugin
    const wordCountPlugin = new Plugin({
      view: () => ({
        update: (view, prevState) => {
          const doc = view.state.doc;
          if (!doc || typeof doc.textBetween !== 'function') return;
          const prevDoc = prevState.doc;
          if (prevDoc && doc !== prevDoc) {
            const text = doc.textBetween(0, doc.content.size, ' ');
            const count = text.trim().split(/\s+/).filter(Boolean).length;
            this.logger.debug(
              'DocumentService',
              `word count updated: ${count} for ${documentId}`
            );
            this.updateWordCount(documentId, count);
          }
        },
      }),
    });
    plugins.push(wordCountPlugin);

    // CRITICAL FIX: Instead of reconfiguring existing state, create a completely
    // new state from scratch with the Yjs plugins. This ensures ySyncPlugin's init()
    // is called properly and the ProsemirrorBinding syncs content from Yjs.
    const newState = view.state.reconfigure({
      plugins: [...view.state.plugins, ...plugins],
    });

    // Replace the entire editor state to trigger proper plugin initialization
    view.updateState(newState);
    console.log(
      '[DocumentService] Plugins added, editor doc size:',
      view.state.doc.content.size
    );

    // CRITICAL: Force the view to re-render by dispatching an empty transaction
    // This triggers the ySyncPlugin's binding to sync content from Yjs to ProseMirror
    view.dispatch(view.state.tr);

    // Start media URL observer for images with media: scheme
    // This watches for images with media: URLs and resolves them to blob URLs
    // by directly manipulating the DOM (not ProseMirror state) to avoid NG0100 errors
    this.startMediaUrlObserver(view, documentId);

    // Initial word count update with guard and error suppression
    try {
      if (view.state.doc && typeof view.state.doc.textBetween === 'function') {
        const text = view.state.doc.textBetween(
          0,
          view.state.doc.content.size,
          ' '
        );
        const initialCount = text.trim().split(/\s+/).filter(Boolean).length;
        this.logger.debug(
          'DocumentService',
          `initial word count: ${initialCount} for ${documentId}`
        );
        this.updateWordCount(documentId, initialCount);
      }
    } catch (error) {
      this.logger.warn(
        'DocumentService',
        'initial word count skipped due to error',
        error
      );
    }
  }

  /**
   * Disconnects from a specific document or all documents
   * @param documentId - Optional document ID to disconnect from. If not provided,
   * disconnects from all documents
   */
  disconnect(documentId?: string) {
    if (documentId) {
      // Disconnect specific document
      const connection = this.connections.get(documentId);
      if (connection) {
        this.logger.info('DocumentService', `Disconnecting from ${documentId}`);

        // Cancel any pending reconnect attempts
        const reconnectTimeout = this.reconnectTimeouts.get(documentId);
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          this.reconnectTimeouts.delete(documentId);
        }

        // Clean up media observer
        const mediaObserver = (
          connection as unknown as { mediaObserver?: MutationObserver }
        ).mediaObserver;
        if (mediaObserver) {
          mediaObserver.disconnect();
          this.logger.debug(
            'DocumentService',
            `Media observer disconnected for ${documentId}`
          );
        }

        // Remove from connections map FIRST to prevent reconnection
        this.connections.delete(documentId);

        // Clean up providers and document
        // Order: Clear awareness → WebSocket disconnect → destroy providers → destroy doc
        if (connection.provider) {
          try {
            // Clear local awareness state to remove cursor from other users' views
            const clientID = connection.provider.awareness.clientID;
            this.logger.debug(
              'DocumentService',
              `Clearing awareness for clientID ${clientID} on disconnect`
            );
            connection.provider.awareness.setLocalState(null);
            connection.provider.disconnect();
            connection.provider.destroy();
          } catch (error) {
            this.logger.warn(
              'DocumentService',
              `Error cleaning up WebSocket provider for ${documentId}`,
              error
            );
          }
        }

        // IMPORTANT: Flush any pending writes before destroying
        // y-indexeddb debounces writes, and destroy() cancels pending writes
        // without flushing them. This ensures all edits are persisted.
        // Note: We use void to fire-and-forget since disconnect() is sync,
        // but the data will still be saved before destroy() runs.
        void storeState(connection.indexeddbProvider, true)
          .then(() => connection.indexeddbProvider.destroy())
          .catch(error => {
            this.logger.warn(
              'DocumentService',
              `Error flushing/destroying IndexedDB provider for ${documentId}`,
              error
            );
          });

        try {
          connection.ydoc.destroy();
        } catch (error) {
          this.logger.warn(
            'DocumentService',
            `Error destroying Yjs doc for ${documentId}`,
            error
          );
        }

        // Clean up sync state
        this.syncStatusSignals.delete(documentId);
        this.unsyncedChanges.delete(documentId);
        this.wordCountSignals.delete(documentId);
      }
    } else {
      // Disconnect all documents
      this.logger.info('DocumentService', 'Disconnecting from all documents');

      // Cancel all pending reconnects
      for (const timeout of this.reconnectTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.reconnectTimeouts.clear();

      // Clear connections map first to prevent reconnections
      const connectionsToClose = Array.from(this.connections.entries());
      this.connections.clear();

      for (const [docId, connection] of connectionsToClose) {
        // Clean up in reverse order: doc first, then providers
        try {
          connection.ydoc.destroy();
        } catch (error) {
          this.logger.warn(
            'DocumentService',
            `Error destroying Yjs doc for ${docId}`,
            error
          );
        }

        // IMPORTANT: Flush pending writes before destroying IndexedDB provider
        void storeState(connection.indexeddbProvider, true)
          .then(() => connection.indexeddbProvider.destroy())
          .catch(error => {
            this.logger.warn(
              'DocumentService',
              `Error flushing/destroying IndexedDB provider for ${docId}`,
              error
            );
          });

        if (connection.provider) {
          try {
            connection.provider.destroy();
          } catch (error) {
            this.logger.warn(
              'DocumentService',
              `Error destroying provider for ${docId}`,
              error
            );
          }
        }

        this.syncStatusSignals.delete(docId);
        this.unsyncedChanges.delete(docId);
        this.wordCountSignals.delete(docId);
      }
      // Connections map already cleared above
    }
  }

  /**
   * Checks if a document is currently connected
   * @param documentId - The document ID to check
   * @returns True if the document has an active connection, false otherwise
   */
  isConnected(documentId: string): boolean {
    return this.connections.has(documentId);
  }

  /**
   * Updates the sync status for a document
   * @param documentId - The document ID to update
   * @param state - The new sync state
   */
  private updateSyncStatus(documentId: string, state: DocumentSyncState): void {
    this.ngZone.run(() => {
      if (this.syncStatusSignals.has(documentId)) {
        this.syncStatusSignals.get(documentId)!.set(state);
      }
      this.projectStateService.updateSyncState(documentId, state);
    });
  }

  /**
   * Generates a consistent color for a user based on their username
   * @param username - The username to generate a color for
   * @returns A hex color string
   */
  private generateUserColor(username: string): string {
    // Simple hash function to generate a consistent color from username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert to a pleasant color (avoid too dark or too light)
    const hue = Math.abs(hash % 360);
    const saturation = 70; // Keep saturation consistent for vibrancy
    const lightness = 60; // Keep lightness consistent for readability

    // Convert HSL to RGB, then to hex
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Restore media URLs for images in the document.
   *
   * After loading a document from Yjs/IndexedDB, images with `media:` scheme URLs
   * need to be resolved to actual blob URLs for display. This method scans the
   * document for such images and updates their src attributes.
   *
   * @param view - The ProseMirror editor view
   * @param documentId - The document ID for logging
   */
  /**
   * Start watching for media URLs in the editor DOM and resolve them to blob URLs.
   *
   * This uses a MutationObserver to detect when images with `media:` URLs are
   * added to the DOM, then resolves them to blob URLs by directly setting the
   * DOM element's src attribute. This avoids modifying the ProseMirror document
   * state, which would trigger Angular's change detection and cause NG0100 errors.
   *
   * The ProseMirror document continues to store `media:` URLs for persistence.
   * Only the rendered DOM elements have blob URLs for display.
   *
   * @param view - The ProseMirror editor view
   * @param documentId - The document ID for logging
   */
  private startMediaUrlObserver(
    view: import('prosemirror-view').EditorView,
    documentId: string
  ): void {
    const projectKey = this.getProjectKey();
    if (!projectKey) {
      this.logger.debug(
        'DocumentService',
        `No project key available for media restoration in ${documentId}`
      );
      return;
    }

    // Check if view has a DOM element we can observe
    if (!view?.dom) {
      this.logger.debug(
        'DocumentService',
        `View DOM not available for media restoration in ${documentId}`
      );
      return;
    }

    // Helper function to resolve a single image element
    const resolveImageSrc = async (img: HTMLImageElement): Promise<void> => {
      const src = img.getAttribute('src');
      if (!src || !isMediaUrl(src)) return;

      // Skip if already being processed
      if (img.dataset['mediaResolving'] === 'true') return;
      img.dataset['mediaResolving'] = 'true';

      const mediaId = extractMediaId(src);
      if (!mediaId) {
        img.dataset['mediaResolving'] = 'false';
        return;
      }

      try {
        const blobUrl = await this.offlineStorage.getMediaUrl(
          projectKey,
          mediaId
        );
        if (blobUrl) {
          // Store the media ID for reference
          img.dataset['mediaId'] = mediaId;
          // Directly set the DOM element's src (not ProseMirror state)
          img.src = blobUrl;
          this.logger.debug(
            'DocumentService',
            `Resolved media URL ${mediaId} to blob URL in ${documentId}`
          );
        } else {
          this.logger.warn(
            'DocumentService',
            `Media not found for ${mediaId} in ${documentId}`
          );
          // Show placeholder for missing media
          img.alt = `[Image not found: ${mediaId}]`;
        }
      } catch (error) {
        this.logger.error(
          'DocumentService',
          `Failed to restore media ${mediaId}:`,
          error
        );
      } finally {
        img.dataset['mediaResolving'] = 'false';
      }
    };

    // Wrapper that handles the promise without returning it (for setTimeout)
    const resolveImageSrcSync = (img: HTMLImageElement): void => {
      void resolveImageSrc(img);
    };

    // Process existing images in the DOM
    const existingImages =
      view.dom.querySelectorAll<HTMLImageElement>('img[src^="media:"]');
    for (const img of existingImages) {
      // Use setTimeout to break out of Angular's change detection cycle
      setTimeout(() => resolveImageSrcSync(img), 0);
    }

    // Set up MutationObserver to handle dynamically added images
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLImageElement && isMediaUrl(node.src)) {
            setTimeout(() => resolveImageSrcSync(node), 0);
          } else if (node instanceof HTMLElement) {
            const imgs =
              node.querySelectorAll<HTMLImageElement>('img[src^="media:"]');
            for (const img of imgs) {
              setTimeout(() => resolveImageSrcSync(img), 0);
            }
          }
        }
        // Check attribute changes on images
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'src' &&
          mutation.target instanceof HTMLImageElement
        ) {
          const img = mutation.target;
          if (isMediaUrl(img.src)) {
            setTimeout(() => resolveImageSrcSync(img), 0);
          }
        }
      }
    });

    observer.observe(view.dom, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    // Store observer for cleanup
    const connection = this.connections.get(documentId);
    if (connection) {
      // Store the observer on the connection for cleanup when disconnecting
      (
        connection as unknown as { mediaObserver?: MutationObserver }
      ).mediaObserver = observer;
    }

    this.logger.debug(
      'DocumentService',
      `Media URL observer started for ${documentId}`
    );
  }

  /**
   * Get the current project key in "username/slug" format.
   * Used by plugins that need to interact with the media library.
   */
  private getProjectKey(): string | null {
    const project = this.projectStateService.project();
    if (!project?.username || !project?.slug) {
      return null;
    }
    return `${project.username}/${project.slug}`;
  }
}
