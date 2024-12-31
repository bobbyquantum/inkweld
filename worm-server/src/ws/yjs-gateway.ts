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
import { Logger } from '@nestjs/common';

@WebSocketGateway({ path: '/ws/yjs' })
export class YjsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  afterInit(server: Server) {
    this.logger.log('YjsGateway initialized, ');
  }
  private readonly logger = new Logger(YjsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(connection: WebSocket, req: Request): void {
    this.logger.debug(
      'New Yjs WebSocket connection',
      req.url,
      req.params,
      req.query,
    );

    const url = new URL(`http://localhost${req.url}`); // hack to parse query
    const docId = url.searchParams.get('documentId') || 'default';

    setupWSConnection(connection, req, { docId });

    console.log(`New Yjs WebSocket connection for doc: "${docId}"`);
  }

  handleDisconnect(client: WebSocket): void {
    // Nest calls this when the socket disconnects
    console.log('Yjs client disconnected');
  }
}
