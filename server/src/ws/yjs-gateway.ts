import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import type { Server as WSServer, WebSocket } from 'ws';
import type { Request } from 'express';
import { setupWSConnection, setPersistence } from './y-websocket-utils.js';
import { Logger, Injectable } from '@nestjs/common';
import { TypeOrmSessionStore } from '../auth/session.store.js';
import { ConfigService } from '@nestjs/config';
import * as cookie from 'cookie';
import { Doc, encodeStateAsUpdate, applyUpdate } from 'yjs';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { LeveldbPersistence } from 'y-leveldb';

/**
 * Custom persistence adapter for using per-project LevelDB instances
 */
class PerProjectPersistence {
  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    private readonly logger: Logger,
  ) {
    this.logger.log('Initialized per-project LevelDB persistence adapter');
  }

  /**
   * Parse a docName to extract username and project slug
   * Expected format: "documentName:username:projectSlug"
   */
  private parseDocName(docName: string): {
    username: string;
    projectSlug: string;
  } {
    const parts = docName.split(':');
    if (parts.length < 3) {
      // Instead of generating fallback identifiers, throw an error
      // This will help identify and fix the root cause of improperly formatted document names
      this.logger.error(
        `Invalid document name format: ${docName}. Expected format: "documentName:username:projectSlug"`,
      );
      throw new Error(
        `Invalid document name format: ${docName}. Expected format: "documentName:username:projectSlug"`,
      );
    }
    // First part is the document type, rest should be username and project
    const username = parts[1];
    const projectSlug = parts[2];
    return { username, projectSlug };
  }

  /**
   * Get the LevelDB instance for a specific document
   */
  private async getLevelDBForDoc(docName: string): Promise<LeveldbPersistence> {
    const { username, projectSlug } = this.parseDocName(docName);
    return await this.levelDBManager.getProjectDatabase(username, projectSlug);
  }

  /**
   * Get document metadata stored in LevelDB
   */
  async getMeta(docName: string, key: string): Promise<any> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      return await db.getMeta(docName, key);
    } catch (error) {
      this.logger.error(`Error getting meta for ${docName}.${key}:`, error);
      return null;
    }
  }

  /**
   * Set document metadata in LevelDB
   */
  async setMeta(docName: string, key: string, value: any): Promise<void> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      await db.setMeta(docName, key, value);
    } catch (error) {
      this.logger.error(`Error setting meta for ${docName}.${key}:`, error);
    }
  }

  /**
   * Store an update to a document in LevelDB
   */
  async storeUpdate(docName: string, update: Uint8Array): Promise<void> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      await db.storeUpdate(docName, update);
    } catch (error) {
      this.logger.error(`Error storing update for ${docName}:`, error);
    }
  }

  /**
   * Get a Y.Doc from LevelDB
   */
  async getYDoc(docName: string): Promise<Doc> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      return await db.getYDoc(docName);
    } catch (error) {
      this.logger.error(`Error getting document ${docName}:`, error);
      throw error;
    }
  }

  /**
   * Bind state for a document in LevelDB (called by y-websocket)
   */
  async bindState(docName: string, ydoc: Doc): Promise<void> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      const persistedYdoc = await db.getYDoc(docName);

      // Always store an initial update so the DB knows this doc name exists
      const newUpdates = encodeStateAsUpdate(ydoc);
      await db.storeUpdate(docName, newUpdates);

      // Apply persisted state onto our fresh doc
      applyUpdate(ydoc, encodeStateAsUpdate(persistedYdoc));

      // Listen for any doc updates and write them out
      ydoc.on('update', async (update) => {
        await db.storeUpdate(docName, update);
      });

      this.logger.verbose(`Bound state for document ${docName}`);
    } catch (error) {
      this.logger.error(`Error binding state for ${docName}:`, error);
    }
  }

  /**
   * Write state for a document back to LevelDB (optional cleanup phase)
   */
  async writeState(docName: string, ydoc: Doc): Promise<void> {
    try {
      const db = await this.getLevelDBForDoc(docName);
      const update = encodeStateAsUpdate(ydoc);
      await db.storeUpdate(docName, update);
      this.logger.verbose(`Wrote state for document ${docName}`);
    } catch (error) {
      this.logger.error(`Error writing state for ${docName}:`, error);
    }
  }
}

@WebSocketGateway({ path: '/ws/yjs' })
@Injectable()
export class YjsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  async updateDocument(documentId: string, content: string): Promise<void> {
    // Get the Y.Doc for this document
    const doc = await this.getDocument(documentId);

    // Get the root text type
    const text = doc.getText('content');

    // Apply the update
    doc.transact(() => {
      text.delete(0, text.length); // Clear existing content
      text.insert(0, content); // Insert new content
    });

    // Persist changes
    await this.persistDocument(doc);
  }

  private async getDocument(documentId: string): Promise<Doc> {
    const persistenceProvider = this.perProjectPersistence;
    if (!persistenceProvider) {
      throw new Error('No persistence found');
    }

    // Get or create document
    const doc = await persistenceProvider.getYDoc(documentId);
    return doc;
  }

  private async persistDocument(doc: Doc): Promise<void> {
    const persistenceProvider = this.perProjectPersistence;
    if (!persistenceProvider) {
      throw new Error('No persistence found');
    }

    // Store the final state
    const update = encodeStateAsUpdate(doc);
    await persistenceProvider.storeUpdate(doc.guid, update);
  }

  private readonly logger = new Logger(YjsGateway.name);
  private readonly allowedOrigins: string[];
  private perProjectPersistence: PerProjectPersistence;

  constructor(
    private readonly sessionStore: TypeOrmSessionStore,
    private readonly configService: ConfigService,
    private readonly levelDBManager: LevelDBManagerService,
  ) {
    // Get allowed origins from config
    this.allowedOrigins = this.configService
      .get<string>('ALLOWED_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  /**
   * Called once the gateway is initialized. Here we set up the per-project LevelDB persistence
   * so that any docs loaded via `setupWSConnection` get automatically persisted.
   */
  afterInit(_server: typeof WSServer) {
    this.logger.log('YjsGateway initialized');

    // Initialize per-project persistence adapter
    this.perProjectPersistence = new PerProjectPersistence(
      this.levelDBManager,
      new Logger('PerProjectPersistence'),
    );

    // Register our persistence with y-websocket utils
    setPersistence(this.perProjectPersistence);

    this.logger.log('Per-project LevelDB persistence initialized');
  }

  @WebSocketServer()
  server: typeof WSServer;

  /**
   * Called every time a new WebSocket connection is established. We:
   *  - Validate the user session
   *  - Check doc ownership
   *  - Attach the user to the doc via setupWSConnection
   */
  async handleConnection(connection: WebSocket, req: Request): Promise<void> {
    this.logger.log(`New Yjs WebSocket connection requested..`);

    try {
      // Validate origin
      const origin = req.headers.origin || '';
      if (!this.isOriginAllowed(origin)) {
        this.logger.warn(
          `Rejected connection from unauthorized origin: ${origin}`,
        );
        connection.close(1008, 'Unauthorized origin');
        return;
      }

      // Extract session token
      const sessionToken = this.extractSessionToken(req);
      if (!sessionToken) {
        this.logger.warn('No session token provided');
        connection.close(1008, 'No session token');
        return;
      }

      // Validate session
      const session = await this.validateSession(sessionToken);
      if (!session) {
        this.logger.warn(`Invalid session token: ${sessionToken}`);
        connection.close(1008, 'Invalid session');
        return;
      }
      // Determine doc name (e.g. from ?documentId=xyz)
      const url = new URL(`http://localhost${req.url}`);
      const docId = url.searchParams.get('documentId') || 'default';

      // Determine username and project slug
      const _username = session.userId;
      let _projectSlug = 'default';

      if (docId.includes(':')) {
        const parts = docId.split(':');
        if (parts.length >= 3) {
          _projectSlug = parts[2];
        }
      }

      // Check & enforce doc ownership
      const ownerId = await this.perProjectPersistence.getMeta(
        docId,
        'ownerId',
      );

      // If no owner is set, the first user to open the doc becomes the owner
      if (!ownerId) {
        await this.perProjectPersistence.setMeta(
          docId,
          'ownerId',
          session.userId,
        );
        this.logger.log(
          `Doc "${docId}" had no owner; set owner to user ${session.userId}`,
        );
      } else if (ownerId !== session.userId) {
        // If the doc is owned by someone else, deny
        this.logger.warn(
          `User ${session.userId} tried to open doc "${docId}", but it belongs to ${ownerId}`,
        );
        connection.close(1008, 'You do not have permission for this doc');
        return;
      }

      // // Attach user info if desired
      const connectionOptions = {
        docName: docId,
        user: session.userId,
      };

      // Create the Yjs connection
      setupWSConnection(connection, req, connectionOptions);

      this.logger.log(
        `New Yjs WebSocket connection for doc: "${docId}" (Owner: ${
          ownerId || session.userId
        })`,
      );
    } catch (error) {
      this.logger.error('WebSocket connection error', error);
      connection.close(1011, 'Internal server error');
    }
  }

  handleDisconnect(_client: WebSocket): void {
    this.logger.log('Yjs client disconnected');
  }

  /**
   * Helper: check whether the incoming Origin is permitted.
   */
  private isOriginAllowed(origin: string): boolean {
    if (this.allowedOrigins.length === 0) {
      this.logger.debug('No origin restrictions configured');
      return true;
    }

    try {
      const originUrl = new URL(origin);
      const isAllowed = this.allowedOrigins.some((allowedOrigin) => {
        try {
          const allowedUrl = new URL(allowedOrigin);
          return (
            allowedUrl.protocol === originUrl.protocol &&
            allowedUrl.hostname === originUrl.hostname &&
            (allowedUrl.port === originUrl.port ||
              (!allowedUrl.port && originUrl.port === '80') ||
              (!originUrl.port && allowedUrl.port === '80'))
          );
        } catch {
          // Fallback to string matching if parse fails
          return origin.startsWith(allowedOrigin);
        }
      });

      this.logger.debug(
        `Origin validation: ${origin} - ${isAllowed ? 'ALLOWED' : 'DENIED'}`,
      );
      return isAllowed;
    } catch (error) {
      this.logger.warn(`Invalid origin format: ${origin}`, error);
      return false;
    }
  }

  /**
   * Helper: tries to extract a session token from query params, cookies,
   * or Authorization headers.
   */
  private extractSessionToken(req: Request): string | null {
    this.logger.debug('Attempting to extract session token', {
      testHeaders: Object.keys(req.headers || {}),
      cookiesHeader: req.headers?.cookie ?? 'missing',
      queryParams: req.url,
      cookies: Object.keys(req.cookies || {}),
      authHeader: req.headers.authorization ? 'Present' : 'Missing',
    });

    // Query param
    const urlToken = new URL(`http://localhost${req.url}`).searchParams.get(
      'sessionToken',
    );
    if (urlToken) {
      this.logger.verbose('Session token found in query parameters');
      return urlToken;
    }

    // Cookie header
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const parsedCookies = cookie.parse(cookieHeader);
      const connectSid = parsedCookies['connect.sid'];
      if (connectSid) {
        const cleanedToken = connectSid.replace(/^s:/, '').split('.')[0];
        this.logger.verbose('Session token found in connect.sid cookie', {
          originalToken: connectSid,
          cleanedToken,
        });
        return cleanedToken;
      }
    }

    // Cookies object
    const cookieToken =
      req.cookies?.sessionToken || req.cookies?.['connect.sid'];
    if (cookieToken) {
      this.logger.verbose('Session token found in cookies object');
      return cookieToken;
    }

    // Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      this.logger.verbose('Session token found in Authorization header');
      return authHeader.substring(7);
    }

    this.logger.warn('No session token found');
    return null;
  }

  /**
   * Helper: verifies that the session token is valid by checking your session store.
   */
  private async validateSession(sessionId: string): Promise<any | null> {
    return new Promise((resolve) => {
      this.sessionStore.get(sessionId, (err, session) => {
        if (err) {
          this.logger.error('Session validation error', err);
          resolve(null);
          return;
        }

        if (!session) {
          this.logger.warn(`No session found for token: ${sessionId}`);
          resolve(null);
          return;
        }

        // Check for expiration
        const now = Date.now();
        if (session.cookie?.expires && now > session.cookie.expires) {
          this.logger.warn(`Session expired for token: ${sessionId}`);
          resolve(null);
          return;
        }

        this.logger.verbose(
          `Session validated for token: ${sessionId}`,
          session,
        );
        resolve(session);
      });
    });
  }
}
