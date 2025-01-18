import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import Server from 'ws';
import type { Request } from 'express';
import {
  setupWSConnection,
  setPersistence,
  getPersistence,
} from './y-websocket-utils.js';
import { LeveldbPersistence } from 'y-leveldb';
import { Logger, Injectable } from '@nestjs/common';
import { TypeOrmSessionStore } from '../auth/session.store.js';
import { ConfigService } from '@nestjs/config';
import * as cookie from 'cookie';
import { Doc, encodeStateAsUpdate, applyUpdate } from 'yjs';

@WebSocketGateway({ path: '/ws/yjs/*splat' })
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
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found');
    }

    // Get or create document
    const doc = await ldb.getYDoc(documentId);
    return doc;
  }

  private async persistDocument(doc: Doc): Promise<void> {
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found');
    }

    // Store the final state
    const update = encodeStateAsUpdate(doc);
    await ldb.storeUpdate(doc.guid, update);
  }

  private readonly logger = new Logger(YjsGateway.name);
  private readonly allowedOrigins: string[];

  constructor(
    private readonly sessionStore: TypeOrmSessionStore,
    private readonly configService: ConfigService,
  ) {
    // Get allowed origins from config
    this.allowedOrigins = this.configService
      .get<string>('ALLOWED_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  /**
   * Called once the gateway is initialized. Here we set up the LevelDB persistence
   * so that any docs loaded via `setupWSConnection` get automatically persisted.
   */
  afterInit(_server: Server) {
    this.logger.log('YjsGateway initialized');

    // Initialize LevelDBPersistence
    const ldb = new LeveldbPersistence(process.env.YPERSISTENCE, {
      // You can pass level options here if desired
      levelOptions: {
        createIfMissing: true,
        errorIfExists: false,
      },
    });

    // Inform y-websocket about our persistence instance
    setPersistence({
      provider: ldb,

      /**
       * bindState is called whenever y-websocket needs to “attach” an incoming doc.
       * We load the persisted doc, apply any changes to the new in-memory doc, and
       * persist new updates as they come in.
       */
      bindState: async (docName, ydoc) => {
        // Get doc from DB and apply its state to the new in-memory Y.Doc
        const persistedYdoc = await ldb.getYDoc(docName);

        // Always store an initial update so the DB knows this doc name exists
        const newUpdates = encodeStateAsUpdate(ydoc);
        await ldb.storeUpdate(docName, newUpdates);

        // Apply persisted state onto our fresh doc
        applyUpdate(ydoc, encodeStateAsUpdate(persistedYdoc));

        // Listen for any doc updates and write them out
        ydoc.on('update', async (update) => {
          await ldb.storeUpdate(docName, update);
        });
      },

      // (Optionally implement if you want a "cleanup" phase)
      writeState: async (_docName, _ydoc) => {
        // Example: flush or merge incremental updates
      },
    });
  }

  @WebSocketServer()
  server: Server;

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

      // Check & enforce doc ownership
      const ldb = getPersistence()?.provider as LeveldbPersistence;
      if (!ldb) {
        this.logger.error('No LevelDB persistence found!');
        connection.close(1011, 'Server Error');
        return;
      }

      // Retrieve existing owner
      const docOwner = await ldb.getMeta(docId, 'ownerId');
      this.logger.log('session', session);
      // If no owner is set, the first user to open the doc becomes the owner
      if (!docOwner) {
        await ldb.setMeta(docId, 'ownerId', session.userId);
        this.logger.log(
          `Doc "${docId}" had no owner; set owner to user ${session.userId}`,
        );
      } else if (docOwner !== session.userId) {
        // If the doc is owned by someone else, deny
        this.logger.warn(
          `User ${session.userId} tried to open doc "${docId}", but it belongs to ${docOwner}`,
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
        `New Yjs WebSocket connection for doc: "${docId}" with persistence "${process.env.YPERSISTENCE}" (Owner: ${
          docOwner || session.userId
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
