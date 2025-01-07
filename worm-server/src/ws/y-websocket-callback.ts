// callback.ts (ESM + TypeScript)

import http, { RequestOptions } from 'node:http';
import { parseInt as parseIntLib } from 'lib0/number';
// We'll assume your newly converted utils.ts exports WSSharedDoc:
import type { WSSharedDoc } from './y-websocket-utils.js';

/**
 * If CALLBACK_URL is set, we parse it as a URL. Otherwise undefined.
 */
const CALLBACK_URL = process.env.CALLBACK_URL
  ? new URL(process.env.CALLBACK_URL)
  : undefined;

/**
 * Timeout for the callback request in milliseconds (default 5000).
 */
const CALLBACK_TIMEOUT = parseIntLib(process.env.CALLBACK_TIMEOUT || '5000');

/**
 * If CALLBACK_OBJECTS is set, parse JSON describing which Yjs types to extract.
 * Example: `{ "items": "Array", "settings": "Map" }`
 */
const CALLBACK_OBJECTS: Record<string, string> = process.env.CALLBACK_OBJECTS
  ? JSON.parse(process.env.CALLBACK_OBJECTS)
  : {};

/**
 * Indicates whether a callback is set up at all.
 */
export const isCallbackSet: boolean = !!CALLBACK_URL;

/**
 * The main function that gets triggered on each Yjs update,
 * collecting contents from certain shared objects and POSTing
 * them to the callback URL (if set).
 *
 * @param update - The binary Yjs update
 * @param origin - The update origin (often unused)
 * @param doc - The WSSharedDoc from your utils.ts
 */
export function callbackHandler(
  _update: Uint8Array,
  _origin: unknown,
  doc: WSSharedDoc,
): void {
  const room = doc.name;
  const dataToSend = {
    room,
    data: {} as Record<string, { type: string; content: unknown }>,
  };

  const sharedObjectList = Object.keys(CALLBACK_OBJECTS);
  sharedObjectList.forEach((sharedObjectName) => {
    const sharedObjectType = CALLBACK_OBJECTS[sharedObjectName];
    const yjsItem = getContent(sharedObjectName, sharedObjectType, doc);

    dataToSend.data[sharedObjectName] = {
      type: sharedObjectType,
      content: typeof yjsItem?.toJSON === 'function' ? yjsItem.toJSON() : {}, // fallback if the object doesn't have toJSON
    };
  });

  if (CALLBACK_URL) {
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
  }
}

/**
 * Actually performs the HTTP POST request to your callback URL.
 *
 * @param url - The callback endpoint
 * @param timeout - Request timeout in ms
 * @param data - The JSON-serializable payload
 */
function callbackRequest(url: URL, timeout: number, data: unknown): void {
  const body = JSON.stringify(data);
  const options: RequestOptions = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    timeout,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = http.request(options);
  req.on('timeout', () => {
    console.warn('Callback request timed out.');
    req.destroy(); // or req.abort() on older Node
  });
  req.on('error', (e) => {
    console.error('Callback request error.', e);
    req.destroy();
  });

  req.write(body);
  req.end();
}

/**
 * Which Yjs types we might have in the doc.
 * Expand if your doc uses more Yjs types.
 */
type SharedObjectType = 'Array' | 'Map' | 'Text' | 'XmlFragment' | 'XmlElement';

/**
 * Retrieves the specified Yjs type from the doc.
 *
 * @param objName - The name of the shared object
 * @param objType - The type of the shared object
 * @param doc - The doc from which to retrieve
 */
function getContent(objName: string, objType: string, doc: WSSharedDoc): any {
  // Cast objType to our known union, else fallback
  const type = objType as SharedObjectType;
  switch (type) {
    case 'Array':
      return doc.getArray(objName);
    case 'Map':
      return doc.getMap(objName);
    case 'Text':
      return doc.getText(objName);
    case 'XmlFragment':
      return doc.getXmlFragment(objName);
    case 'XmlElement':
      return doc.getXmlElement(objName);
    default:
      // If we get some unknown string, just return {}
      return {};
  }
}
