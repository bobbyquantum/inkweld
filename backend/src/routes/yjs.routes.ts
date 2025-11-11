import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService } from '../services/yjs.service';

const app = new Hono();

// WebSocket upgrade handler for Yjs collaboration
app.get(
  '/yjs',
  upgradeWebSocket((c) => {
    const documentId = c.req.query('documentId');

    if (!documentId) {
      console.error('Missing documentId parameter');
      return {};
    }

    // TODO: Add authentication check
    // const session = c.get('session');
    // if (!session?.userId) {
    //   console.error('Unauthorized WebSocket connection attempt');
    //   return {};
    // }

    // Validate document access (format: username:slug:documentId or username:slug:elements)
    const parts = documentId.split(':');
    if (parts.length < 2) {
      console.error(`Invalid document ID format: ${documentId}`);
      return {};
    }

    console.log(`WebSocket connection for document: ${documentId}`);

    let doc: any = null;
    let pongReceived = true;
    let pingInterval: Timer | null = null;

    return {
      async onOpen(_event, ws) {
        console.log(`WebSocket opened for ${documentId}`);
        // Store the doc for use in other handlers
        doc = await yjsService.handleConnection(ws.raw, documentId);
        
        // Set up ping/pong heartbeat to keep connection alive and detect broken connections
        // This is especially important when browser tabs go out of focus
        const PING_TIMEOUT = 30000; // 30 seconds
        pongReceived = true;
        
        // Set up pong event listener on the raw WebSocket
        ws.raw.on('pong', () => {
          pongReceived = true;
        });
        
        pingInterval = setInterval(() => {
          if (!pongReceived) {
            // Connection is broken - close it
            console.log(`No pong received for ${documentId}, closing connection`);
            ws.close();
            if (pingInterval) clearInterval(pingInterval);
          } else {
            // Send ping and wait for pong
            pongReceived = false;
            try {
              ws.raw.ping();
            } catch (error) {
              console.error(`Error sending ping for ${documentId}:`, error);
              ws.close();
              if (pingInterval) clearInterval(pingInterval);
            }
          }
        }, PING_TIMEOUT);
      },
      onMessage(event, ws) {
        // Yjs messages are binary
        if (event.data instanceof ArrayBuffer && doc) {
          const buffer = Buffer.from(event.data);
          yjsService.handleMessage(ws.raw, doc, buffer);
        }
      },
      onClose(_event, ws) {
        console.log(`WebSocket closed for ${documentId}`);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (doc) {
          yjsService.handleDisconnect(ws.raw, doc);
        }
      },
      onError(evt, _ws) {
        console.error(`WebSocket error for ${documentId}:`, evt);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      },
    };
  })
);

export default app;
