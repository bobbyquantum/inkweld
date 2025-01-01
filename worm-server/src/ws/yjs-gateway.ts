import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Request } from 'express';
import { setupWSConnection } from 'y-websocket/bin/utils.cjs';
import {
  Logger,
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { TypeOrmSessionStore } from '../auth/session.store';
import { ConfigService } from '@nestjs/config';
import * as cookie from 'cookie';

@WebSocketGateway({ path: '/ws/yjs' })
@Injectable()
export class YjsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(YjsGateway.name);
  private readonly allowedOrigins: string[];

  constructor(
    private readonly sessionStore: TypeOrmSessionStore,
    private readonly configService: ConfigService,
  ) {
    // Get allowed origins from configuration
    this.allowedOrigins = this.configService
      .get<string>('ALLOWED_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  afterInit(server: Server) {
    this.logger.log('YjsGateway initialized');
  }

  @WebSocketServer()
  server: Server;

  async handleConnection(connection: WebSocket, req: Request): Promise<void> {
    this.logger.log(`New Yjs WebSocket connection for doc`);
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

      // Extract session token from query or headers
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

      // Parse URL and extract document ID
      const url = new URL(`http://localhost${req.url}`);
      const docId = url.searchParams.get('documentId') || 'default';

      // Attach user info to the connection if needed
      const connectionOptions = {
        docId,
        user: session.user, // Attach user info from session
      };

      setupWSConnection(connection, req, connectionOptions);

      this.logger.log(`New Yjs WebSocket connection for doc: "${docId}"`);
    } catch (error) {
      this.logger.error('WebSocket connection error', error);
      connection.close(1011, 'Internal server error');
    }
  }

  handleDisconnect(client: WebSocket): void {
    this.logger.log('Yjs client disconnected');
  }

  private isOriginAllowed(origin: string): boolean {
    // If no allowed origins are configured, allow all
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
          // Fallback to simple string matching if URL parsing fails
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

  private extractSessionToken(req: Request): string | null {
    // Logging for debugging token extraction
    this.logger.debug('Attempting to extract session token', {
      testHeaders: Object.keys(req.headers || {}),
      cookiesHeader: req.headers?.cookie ?? 'missing',
      queryParams: req.url,
      cookies: Object.keys(req.cookies || {}),
      authHeader: req.headers.authorization ? 'Present' : 'Missing',
    });

    // Try to get session token from query parameters
    const urlToken = new URL(`http://localhost${req.url}`).searchParams.get(
      'sessionToken',
    );
    if (urlToken) {
      this.logger.debug('Session token found in query parameters');
      return urlToken;
    }

    // Try to get session token from cookie header
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const parsedCookies = cookie.parse(cookieHeader);
      const connectSid = parsedCookies['connect.sid'];

      if (connectSid) {
        // Remove 's:' prefix and everything after the '.'
        const cleanedToken = connectSid.replace(/^s:/, '').split('.')[0];
        this.logger.debug('Session token found in connect.sid cookie', {
          originalToken: connectSid,
          cleanedToken,
        });
        return cleanedToken;
      }
    }

    // Try to get session token from cookies object
    const cookieToken =
      req.cookies?.sessionToken || req.cookies?.['connect.sid'];
    if (cookieToken) {
      this.logger.debug('Session token found in cookies object');
      return cookieToken;
    }

    // Try to get session token from authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      this.logger.debug('Session token found in Authorization header');
      return authHeader.substring(7);
    }

    this.logger.warn('No session token found');
    return null;
  }

  private async validateSession(sessionId: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
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

        // Additional session validation checks
        const now = Date.now();
        if (
          session.cookie &&
          session.cookie.expires &&
          now > session.cookie.expires
        ) {
          this.logger.warn(`Session expired for token: ${sessionId}`);
          resolve(null);
          return;
        }

        // Log successful session validation
        this.logger.debug(
          `Session validated successfully for token: ${sessionId}`,
        );
        resolve(session);
      });
    });
  }
}
