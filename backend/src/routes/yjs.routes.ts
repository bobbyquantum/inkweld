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

    return {
      async onOpen(_event, ws) {
        console.log(`WebSocket opened for ${documentId}`);
        // Store the doc for use in other handlers
        doc = await yjsService.handleConnection(ws.raw, documentId);
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
        if (doc) {
          yjsService.handleDisconnect(ws.raw, doc);
        }
      },
      onError(evt, _ws) {
        console.error(`WebSocket error for ${documentId}:`, evt);
      },
    };
  })
);

export default app;
